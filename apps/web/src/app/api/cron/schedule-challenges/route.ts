import type { NextRequest } from 'next/server';
import { isCronRequest } from '@/server/auth';
import { adminClient } from '@/server/supabase';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel Cron invoca la ruta con GET, no con POST. Exportar sólo POST hace que
// el job devuelva 405 todas las noches sin que nadie se entere.

/** Días por delante que se preparan. Da margen para que un fallo no deje un día sin desafío. */
const LOOKAHEAD_DAYS = 3;

/**
 * Cron diario: sortea el objeto de los próximos días y crea la ventana de cada
 * usuario en su franja horaria local.
 *
 * Se ejecuta antes de que amanezca en el huso más adelantado, para que nadie
 * llegue a su franja sin ventana creada.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return fail('forbidden', 'invalid cron secret');

  const db = adminClient();
  const report: Array<Record<string, unknown>> = [];

  try {
    // Primero se aplican los cambios de huso que vencieron: si no, la ventana
    // se crearía con la zona vieja y el diferimiento no serviría de nada.
    const { data: promoted, error: promoteError } =
      await db.rpc('promote_pending_timezones', { p_date: today() });
    if (promoteError) throw new Error(promoteError.message);
    report.push({ step: 'promote_timezones', moved: promoted });

    for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
      const date = addDays(today(), offset);

      const { data: challengeId, error: scheduleError } =
        await db.rpc('schedule_daily_challenge', { target_date: date });
      if (scheduleError) throw new Error(`schedule ${date}: ${scheduleError.message}`);

      const { data: created, error: windowsError } =
        await db.rpc('create_challenge_windows', { p_date: date });
      if (windowsError) throw new Error(`windows ${date}: ${windowsError.message}`);

      report.push({ date, challengeId, windowsCreated: created });
    }

    return ok({ report });
  } catch (error) {
    return failFromError(error);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
