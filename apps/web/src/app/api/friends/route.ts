import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/** GET /api/friends — amigos y solicitudes pendientes en las dos direcciones. */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  try {
    const { data, error } = await auth.db.rpc('get_my_social_graph');
    if (error) throw new Error(error.message);
    return ok(data);
  } catch (error) {
    return failFromError(error);
  }
}
