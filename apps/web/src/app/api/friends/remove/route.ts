import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/** POST /api/friends/remove — deshacer una amistad. */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { userId } = await request.json().catch(() => ({}));
  if (!userId) return fail('not_found', 'userId is required');

  try {
    // El par es canónico (user_a < user_b), así que hay una sola fila.
    const [a, b] = [auth.userId, userId].sort();
    const { error } = await auth.db.from('friendships')
      .delete().eq('user_a', a).eq('user_b', b);
    if (error) throw new Error(error.message);
    return ok({ status: 'none' });
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}
