import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { signPaths } from '@/server/images/signed-urls';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

interface FeedRow {
  submission_id: string; user_id: string; username: string; display_name: string;
  avatar_path: string | null; current_streak: number; challenge_date: string;
  object_display: string | null; photo_path: string; thumbnail_path: string | null;
  medium_path: string | null; submitted_at: string; was_late: boolean;
  reactions: Record<string, number>; my_reaction: string | null;
}

/**
 * GET /api/feed — publicaciones recientes de quienes el usuario puede ver.
 *
 * La visibilidad la resuelve RLS dentro de `get_feed`, que corre como
 * SECURITY INVOKER. Este endpoint no filtra nada por su cuenta: si lo hiciera,
 * habría dos definiciones de "quién puede ver qué" y tarde o temprano
 * divergirían (§63).
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const params = request.nextUrl.searchParams;
  const limit = Math.min(Number(params.get('limit') ?? 20) || 20, 50);
  const cursor = params.get('cursor');

  // El cursor es opaco para el cliente: viaja como base64 y se descompone acá.
  let cursorAt: string | null = null;
  let cursorId: string | null = null;
  if (cursor) {
    try {
      const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      if (at && id) { cursorAt = at; cursorId = id; }
    } catch { /* un cursor corrupto se ignora y se empieza de cero */ }
  }

  try {
    const { data, error } = await auth.db.rpc('get_feed', {
      p_cursor_at: cursorAt, p_cursor_id: cursorId, p_limit: limit,
    });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as FeedRow[];

    // El feed usa miniaturas; la original sólo se baja al abrir la foto (§32).
    const signed = await signPaths(rows.map((r) => r.thumbnail_path ?? r.photo_path));

    const items = rows.map((r) => ({
      submission: {
        id: r.submission_id,
        userId: r.user_id,
        challengeDate: r.challenge_date,
        objectDisplayName: r.object_display ?? '',
        photoUrl: signed.get(r.thumbnail_path ?? r.photo_path) ?? '',
        thumbnailUrl: signed.get(r.thumbnail_path ?? '') ?? null,
        submittedAt: r.submitted_at,
        status: 'accepted' as const,
        countedForStreak: !r.was_late,
        wasLate: r.was_late,
      },
      author: {
        id: r.user_id, username: r.username, displayName: r.display_name,
        avatarUrl: null, bio: null, countryCode: null,
        currentStreak: r.current_streak, bestStreak: 0, totalCompleted: 0,
      },
      streakAtTime: r.current_streak,
      reactions: { counts: r.reactions ?? {}, mine: r.my_reaction ?? null },
    }));

    const last = rows.at(-1);
    const nextCursor = rows.length === limit && last
      ? Buffer.from(`${last.submitted_at}|${last.submission_id}`).toString('base64url')
      : null;

    return ok({ items, nextCursor });
  } catch (error) {
    return failFromError(error);
  }
}
