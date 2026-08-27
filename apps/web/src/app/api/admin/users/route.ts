import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/** POST /api/admin/users — suspender, banear o reactivar una cuenta. */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { userId, status, note } = await request.json().catch(() => ({}));
  if (!userId || !['active', 'suspended', 'banned'].includes(status)) {
    return fail('not_found', 'userId and a valid status are required');
  }

  try {
    const { error } = await auth.db.rpc('admin_set_account_status', {
      p_user_id: userId, p_status: status, p_note: note ?? null });
    if (error) throw new Error(error.message);
    return ok({ status });
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}
