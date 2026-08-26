import type { NextRequest } from 'next/server';
import type { ChallengeState } from '@mira/shared';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

interface ChallengeRow {
  window_id: string;
  challenge_date: string;
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  is_revealed: boolean;
  object_name: string | null;
  display_name: string | null;
  description: string | null;
  attempts_used: number;
  max_attempts: number;
  completed_at: string | null;
}

/**
 * GET /api/challenge — estado del desafío del usuario ahora mismo.
 *
 * La consulta pasa por RLS con el JWT del usuario, y `get_active_challenge()`
 * oculta el objeto hasta que abre su ventana. El servidor no le dice al cliente
 * cuál es el objeto de hoy antes de tiempo, ni siquiera "por comodidad" (§5).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  try {
    // Alta tardía: quien se registró después de que corrió el cron no tendría
    // ventana. Esto se la crea en el momento y es idempotente.
    await auth.db.rpc('ensure_own_challenge_window');

    const { data, error } = await auth.db.rpc('get_active_challenge');
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as ChallengeRow[];
    const row = rows[0];

    // La racha sólo hace falta cuando el desafío ya está completo; no se paga
    // una consulta de más en el caso habitual.
    let currentStreak = 0;
    if (row?.completed_at) {
      const { data: profile } = await auth.db
        .from('profiles').select('current_streak').eq('id', auth.userId).maybeSingle();
      currentStreak = profile?.current_streak ?? 0;
    }

    return ok(toChallengeState(row, currentStreak));
  } catch (error) {
    return failFromError(error);
  }
}

/**
 * Traduce la fila cruda al estado que dibuja la app.
 *
 * Toda la lógica de "en qué estado está el desafío" vive acá, en el servidor.
 * El cliente no compara fechas ni decide si la ventana está abierta (§61):
 * el reloj del teléfono se puede cambiar.
 */
function toChallengeState(row: ChallengeRow | undefined, currentStreak: number): ChallengeState {
  if (!row) return { kind: 'none' };

  if (row.completed_at) {
    return {
      kind: 'completed',
      challengeDate: row.challenge_date,
      objectDisplayName: row.display_name ?? '',
      // La foto con su URL firmada la trae GET /api/feed. Acá alcanza con el
      // estado y la racha, que es lo que dibuja la pantalla principal.
      submission: null,
      currentStreak,
    };
  }

  if (!row.is_revealed) {
    return { kind: 'locked', challengeDate: row.challenge_date, opensAt: row.opens_at };
  }

  if (row.is_open) {
    return {
      kind: 'open',
      windowId: row.window_id,
      challengeDate: row.challenge_date,
      objectDisplayName: row.display_name ?? '',
      objectDescription: row.description,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      attemptsUsed: row.attempts_used,
      maxAttempts: row.max_attempts,
    };
  }

  return {
    kind: 'missed',
    challengeDate: row.challenge_date,
    objectDisplayName: row.display_name ?? '',
    canSubmitLate: true,
  };
}
