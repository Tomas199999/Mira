import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/** POST /api/friends/respond — aceptar o rechazar una solicitud recibida. */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { requestId, accept } = await request.json().catch(() => ({}));
  if (!requestId || typeof accept !== 'boolean') {
    return fail('not_found', 'requestId and accept are required');
  }

  try {
    // La política de RLS sólo deja a quien recibió la solicitud moverla a
    // 'accepted' o 'rejected'; el trigger crea la amistad si corresponde.
    const { error } = await auth.db.from('friend_requests')
      .update({ status: accept ? 'accepted' : 'rejected' })
      .eq('id', requestId)
      .eq('addressee_id', auth.userId);
    if (error) throw new Error(error.message);
    return ok({ status: accept ? 'friends' : 'none' });
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}
