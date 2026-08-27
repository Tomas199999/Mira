import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

interface RankRow {
  rank: number; user_id: string; username: string;
  display_name: string; avatar_path: string | null; score: number; is_me: boolean;
}

/**
 * GET /api/rankings?scope=global|country|friends
 *
 * Global y país salen de snapshots materializados por un job diario: no se
 * recorre la tabla de usuarios en cada consulta (§36). El de amigos se calcula
 * al vuelo, porque el grafo de una persona es chico y así siempre está fresco.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const params = request.nextUrl.searchParams;
  const scope = params.get('scope') ?? 'friends';
  if (!['global', 'country', 'friends'].includes(scope)) {
    return fail('not_found', 'unknown scope');
  }

  const afterRank = Number(params.get('after') ?? 0) || 0;
  const limit = Math.min(Number(params.get('limit') ?? 50) || 50, 100);

  try {
    if (scope === 'friends') {
      const { data, error } = await auth.db.rpc('get_friends_ranking', { p_limit: limit });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<{
        rank: number; user_id: string; username: string;
        display_name: string; avatar_path: string | null; current_streak: number;
      }>;
      return ok({
        scope,
        snapshotDate: null,
        entries: rows.map((r) => ({
          rank: Number(r.rank), userId: r.user_id, username: r.username,
          displayName: r.display_name, score: r.current_streak,
          isMe: r.user_id === auth.userId,
        })),
        myEntry: null,
        nextAfter: null,
      });
    }

    // Para el ranking nacional hace falta el país del usuario, salvo que se pida uno.
    let scopeKey = params.get('country') ?? '';
    if (scope === 'country' && !scopeKey) {
      const { data: me } = await auth.db
        .from('profiles').select('country_code').eq('id', auth.userId).maybeSingle();
      scopeKey = me?.country_code ?? '';
      if (!scopeKey) return ok({ scope, snapshotDate: null, entries: [], myEntry: null, nextAfter: null });
    }

    const [page, mine] = await Promise.all([
      auth.db.rpc('get_ranking_page', {
        p_scope: scope, p_scope_key: scopeKey, p_after_rank: afterRank, p_limit: limit }),
      auth.db.rpc('get_my_rank', { p_scope: scope, p_scope_key: scopeKey }),
    ]);
    if (page.error) throw new Error(page.error.message);

    const rows = (page.data ?? []) as RankRow[];
    const myRank = (mine.data ?? {}) as { rank: number | null; total: number; updated_at: string | null };

    return ok({
      scope,
      scopeKey: scopeKey || null,
      snapshotDate: myRank.updated_at,
      entries: rows.map((r) => ({
        rank: r.rank, userId: r.user_id, username: r.username,
        displayName: r.display_name, score: r.score, isMe: r.is_me,
      })),
      myEntry: myRank.rank ? { rank: myRank.rank, score: null, isMe: true } : null,
      totalParticipants: myRank.total ?? 0,
      nextAfter: rows.length === limit ? rows.at(-1)?.rank ?? null : null,
    });
  } catch (error) {
    return failFromError(error);
  }
}
