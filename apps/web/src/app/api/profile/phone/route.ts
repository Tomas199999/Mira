import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/**
 * POST /api/profile/phone — publicar el propio teléfono para ser encontrable.
 *
 * El hash lo calcula el servidor. Si lo calculara el cliente, cualquiera podría
 * publicar el hash del teléfono de otra persona y aparecer cuando los contactos
 * de esa persona la buscan — la suplantación que cerró la migración 0015.
 *
 * El número en claro no se guarda en ningún lado: llega, se hashea, se descarta.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { phone, discoverable } = await request.json().catch(() => ({}));
  if (typeof discoverable !== 'boolean') {
    return fail('image_invalid', 'discoverable is required');
  }
  if (discoverable && typeof phone !== 'string') {
    return fail('image_invalid', 'phone is required when enabling discovery');
  }

  try {
    const { data, error } = await auth.db.rpc('set_phone_discoverability', {
      p_phone_e164: discoverable ? phone : '',
      p_discoverable: discoverable,
    });
    if (error) throw new Error(error.message);
    return ok({ discoverable: data === true });
  } catch (error) {
    return failFromError(error, 'image_invalid');
  }
}
