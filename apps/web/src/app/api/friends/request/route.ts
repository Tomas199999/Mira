import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { consume } from '@/server/rate-limit';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/**
 * POST /api/friends/request — enviar solicitud.
 *
 * §16: nunca se manda una solicitud sin acción explícita del usuario. Este
 * endpoint existe para eso; no hay ningún camino que lo llame en lote.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { targetUserId } = await request.json().catch(() => ({ targetUserId: null }));
  if (!targetUserId) return fail('not_found', 'targetUserId is required');

  const limit = await consume('friendRequests', auth.userId);
  if (!limit.allowed) return fail('rate_limited', 'too many friend requests', limit.retryAfter);

  try {
    // Pasa por RLS: la política exige requester_id = auth.uid(), status
    // 'pending' y que no haya bloqueo en ninguna dirección.
    const { error } = await auth.db.from('friend_requests')
      .insert({ requester_id: auth.userId, addressee_id: targetUserId, status: 'pending' });
    if (error) throw new Error(error.message);
    return ok({ status: 'pending_sent' });
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}
