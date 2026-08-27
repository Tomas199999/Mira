import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { signPaths } from '@/server/images/signed-urls';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

interface HistoryRow {
  day: string; object_display: string | null; submission_id: string | null;
  thumbnail_path: string | null; photo_path: string | null;
  outcome: string; streak_after: number | null;
}

/**
 * GET /api/history?month=YYYY-MM — calendario del mes (§20).
 *
 * Devuelve un día por fecha, incluidos los vacíos: un día sin desafío no es lo
 * mismo que un día perdido, y la interfaz tiene que poder distinguirlos.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const month = request.nextUrl.searchParams.get('month')
    ?? new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return fail('not_found', 'month must be YYYY-MM');

  try {
    const { data, error } = await auth.db.rpc('get_history_month', { p_month: month });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as HistoryRow[];
    const signed = await signPaths(
      rows.map((r) => r.thumbnail_path ?? r.photo_path).filter((p): p is string => Boolean(p)));

    const days = rows.map((r) => ({
      date: r.day,
      objectDisplayName: r.object_display,
      outcome: r.outcome,
      streakAfter: r.streak_after,
      submission: r.submission_id ? {
        id: r.submission_id,
        thumbnailUrl: signed.get(r.thumbnail_path ?? r.photo_path ?? '') ?? null,
      } : null,
    }));

    const withChallenge = days.filter((d) => d.outcome !== 'no_challenge');
    const completed = withChallenge.filter((d) => d.outcome === 'completed').length;

    return ok({
      month,
      days,
      participationRate: withChallenge.length ? completed / withChallenge.length : 0,
    });
  } catch (error) {
    return failFromError(error);
  }
}
