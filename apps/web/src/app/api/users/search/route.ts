import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/** GET /api/users/search?q= — búsqueda por prefijo de username. */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  // Menos de dos caracteres devolvería medio padrón: no es una búsqueda.
  if (query.length < 2) return ok({ results: [] });

  try {
    const { data, error } = await auth.db.rpc('search_users', { p_query: query, p_limit: 20 });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as Array<{
      user_id: string; username: string; display_name: string;
      avatar_path: string | null; current_streak: number; relationship: string;
    }>;

    return ok({
      results: rows.map((r) => ({
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        avatarPath: r.avatar_path,
        currentStreak: r.current_streak,
        relationship: r.relationship,
      })),
    });
  } catch (error) {
    return failFromError(error);
  }
}
