import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/** POST /api/push/register — asocia el token del dispositivo a la cuenta. */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { token, platform, deviceId, appVersion } = await request.json().catch(() => ({}));
  if (!token || (platform !== 'ios' && platform !== 'android')) {
    return fail('image_invalid', 'token and platform (ios|android) are required');
  }

  try {
    const { error } = await auth.db.rpc('register_push_token', {
      p_token: token, p_platform: platform,
      p_device_id: deviceId ?? null, p_app_version: appVersion ?? null,
    });
    if (error) throw new Error(error.message);
    return ok({ registered: true });
  } catch (error) {
    return failFromError(error);
  }
}
