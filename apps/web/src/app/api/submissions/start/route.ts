import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { adminClient } from '@/server/supabase';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

const BUCKET = process.env.STORAGE_BUCKET_SUBMISSIONS ?? 'submissions';

/**
 * POST /api/submissions/start — paso 1 de la subida.
 *
 * Reserva el intento y devuelve una URL firmada para subir directo a Storage.
 * Los bytes de la foto no atraviesan esta función: eso evita el límite de
 * payload de una función serverless y no paga el ancho de banda dos veces
 * (docs/ARCHITECTURE.md § 4).
 *
 * La reserva del intento y la emisión del token pasan por `start_submission()`,
 * que las hace en una sola transacción con FOR UPDATE. Si fueran dos pasos, dos
 * peticiones simultáneas se llevarían el mismo intento.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  let body: { windowId?: string; deviceId?: string; attestationToken?: string };
  try {
    body = await request.json();
  } catch {
    return fail('image_invalid', 'body is not valid json');
  }

  if (!body.windowId) return fail('image_invalid', 'windowId is required');

  // TODO(Fase 5, requiere development build): verificar attestationToken contra
  // App Attest o Play Integrity. Hasta entonces se registra si vino o no, pero
  // no se puede validar: App Attest no funciona en Expo Go.
  const attestationPresent = Boolean(body.attestationToken);

  try {
    const { data, error } = await auth.db.rpc('start_submission', {
      p_window_id: body.windowId,
      p_device_id: body.deviceId ?? null,
      p_attestation_ok: attestationPresent,
    });
    if (error) throw new Error(error.message);

    const reserved = data as {
      submission_id: string;
      upload_path: string;
      upload_token: string;
      attempts_remaining: number;
      was_late: boolean;
      expires_at: string;
    };

    // La URL firmada la emite el cliente admin: es una autorización puntual
    // para escribir en esa ruta y sólo en esa.
    const storage = adminClient().storage.from(BUCKET);
    const { data: signed, error: signError } =
      await storage.createSignedUploadUrl(reserved.upload_path);
    if (signError) throw new Error(signError.message);

    return ok({
      submissionId: reserved.submission_id,
      uploadUrl: signed.signedUrl,
      uploadPath: reserved.upload_path,
      uploadToken: reserved.upload_token,
      attemptsRemaining: reserved.attempts_remaining,
      wasLate: reserved.was_late,
      expiresAt: reserved.expires_at,
    });
  } catch (error) {
    return failFromError(error, 'challenge_not_open');
  }
}
