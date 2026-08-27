import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/**
 * POST /api/friends/block — bloquear o desbloquear.
 *
 * Bloquear destruye la amistad y cancela las solicitudes pendientes: lo hace un
 * trigger en la base, no este endpoint (§25).
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { userId, blocked } = await request.json().catch(() => ({}));
  if (!userId || typeof blocked !== 'boolean') {
    return fail('not_found', 'userId and blocked are required');
  }

  try {
    const { error } = blocked
      ? await auth.db.from('blocks')
          .upsert({ blocker_id: auth.userId, blocked_id: userId })
      : await auth.db.from('blocks')
          .delete().eq('blocker_id', auth.userId).eq('blocked_id', userId);
    if (error) throw new Error(error.message);
    return ok({ status: blocked ? 'blocked' : 'none' });
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}
