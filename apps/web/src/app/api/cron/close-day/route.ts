import type { NextRequest } from 'next/server';
import { isCronRequest } from '@/server/auth';
import { adminClient } from '@/server/supabase';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Vercel Cron invoca la ruta con GET, no con POST. Exportar sólo POST hace que
// el job devuelva 405 todas las noches sin que nadie se entere.

/**
 * Cron diario: cierra el día anterior y materializa los rankings.
 *
 * `close_challenge_day` gasta un protector o corta la racha de quien no
 * participó. Deja fuera a quien tiene un envío en revisión: ante la duda, el
 * usuario gana (ver docs/AI.md § Falsos negativos).
 *
 * Corre sobre AYER y no sobre hoy: la ventana del huso más atrasado todavía
 * puede estar abierta cuando el servidor ya cambió de fecha.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return fail('forbidden', 'invalid cron secret');

  const db = adminClient();

  try {
    const yesterday = addDays(new Date().toISOString().slice(0, 10), -1);

    const { data: closed, error: closeError } =
      await db.rpc('close_challenge_day', { p_date: yesterday });
    if (closeError) throw new Error(`close ${yesterday}: ${closeError.message}`);

    const { data: ranked, error: rankError } =
      await db.rpc('build_ranking_snapshots', { p_date: new Date().toISOString().slice(0, 10) });
    if (rankError) throw new Error(`rankings: ${rankError.message}`);

    return ok({ date: yesterday, streaksClosed: closed, globalRanked: ranked });
  } catch (error) {
    return failFromError(error);
  }
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
