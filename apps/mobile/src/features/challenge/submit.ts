import * as ImageManipulator from 'expo-image-manipulator';
import { File, UploadType } from 'expo-file-system';
import Constants from 'expo-constants';
import { supabase } from '@/services/supabase';

/**
 * Subida en dos pasos.
 *
 *   1. El backend valida ventana, intentos y attestation, y devuelve una URL
 *      firmada. Ahí se reserva el intento: si el paso 2 falla, el intento ya
 *      se gastó, y es lo correcto — si no, reintentar sería gratis.
 *   2. La foto va directo a Storage, sin pasar por la función serverless.
 *   3. `finalize` dispara el pipeline y devuelve el veredicto.
 *
 * El cliente no decide nada del resultado: sólo transporta bytes y espera.
 */

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)
  ?? process.env.EXPO_PUBLIC_API_BASE_URL
  ?? '';

export interface SubmitResult {
  status: 'accepted' | 'rejected' | 'in_review' | 'blocked';
  streak: { current: number; increasedBy: number };
  wasLate: boolean;
  reason: string;
  detectedObject: string | null;
}

export class SubmitError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new SubmitError('unauthenticated', 'no session');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.ok !== true) {
    const code = payload?.error?.code ?? 'internal';
    throw new SubmitError(code, payload?.error?.detail ?? `HTTP ${response.status}`);
  }
  return payload.data as T;
}

/**
 * Comprime antes de subir. La foto es el producto, así que no se sacrifica
 * demasiada calidad, pero mandar 8 MB desde una conexión móvil es garantía de
 * subida fallida (§33).
 */
async function compress(uri: string): Promise<{ uri: string; bytes: number }> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1440 } }],
    { compress: 0.82, format: ImageManipulator.SaveFormat.WEBP },
  );

  const file = new File(manipulated.uri);
  return { uri: manipulated.uri, bytes: file.size ?? 0 };
}

export async function submitPhoto(params: {
  windowId: string;
  photoUri: string;
  deviceId: string;
  attestationToken?: string;
}): Promise<SubmitResult> {
  const compressed = await compress(params.photoUri);

  const started = await call<{
    submissionId: string;
    uploadUrl: string;
    uploadToken: string;
  }>('/api/submissions/start', {
    windowId: params.windowId,
    deviceId: params.deviceId,
    attestationToken: params.attestationToken,
  });

  // Subida directa a Storage con la URL firmada.
  // SDK 57 reemplazó FileSystem.uploadAsync por la clase File.
  const upload = await new File(compressed.uri).upload(started.uploadUrl, {
    httpMethod: 'PUT',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: 'image/webp',
    headers: { 'Content-Type': 'image/webp' },
  });

  if (upload.status >= 400) {
    throw new SubmitError('upload_failed', `storage responded ${upload.status}`);
  }

  return call<SubmitResult>('/api/submissions/finalize', {
    submissionId: started.submissionId,
    uploadToken: started.uploadToken,
  });
}
