import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/metrics
 *
 * La comprobación del rol vive dentro de la función de Postgres, no acá: así
 * hay un solo lugar donde se decide quién es administrador, y no se puede
 * llegar a los datos por otra puerta.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  try {
    const { data, error } = await auth.db.rpc('admin_metrics');
    if (error) throw new Error(error.message);
    return ok(data);
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}
