import { NextResponse } from 'next/server';
import type { ApiError, ApiErrorCode } from '@mira/shared';

/**
 * Envoltorio único de respuesta.
 *
 * El cliente recibe siempre un código estable, nunca un mensaje técnico ni un
 * stack (§58). El detalle en inglés existe para los logs, no para la pantalla.
 */

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  account_suspended: 403,
  challenge_not_open: 409,
  challenge_already_completed: 409,
  attempts_exhausted: 429,
  upload_token_invalid: 400,
  attestation_failed: 403,
  duplicate_photo: 409,
  image_invalid: 400,
  moderation_blocked: 422,
  rate_limited: 429,
  username_taken: 409,
  username_invalid: 400,
  age_restricted: 403,
  not_found: 404,
  vision_unavailable: 503,
  internal: 500,
};

export function ok<T>(data: T): NextResponse {
  return NextResponse.json({ ok: true, data });
}

export function fail(code: ApiErrorCode, detail: string, retryAfter?: number): NextResponse {
  const error: ApiError = { code, detail, ...(retryAfter ? { retryAfter } : {}) };
  const headers = retryAfter ? { 'Retry-After': String(retryAfter) } : undefined;
  return NextResponse.json({ ok: false, error }, { status: STATUS[code], headers });
}

/**
 * Convierte cualquier excepción en una respuesta segura.
 * Lo que se registra queda del lado del servidor; lo que viaja es un código.
 */
export function failFromError(error: unknown, fallback: ApiErrorCode = 'internal'): NextResponse {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[api]', message);

  if (message.includes('unauthenticated')) return fail('unauthenticated', message);
  if (message.includes('permission denied')) return fail('forbidden', message);
  if (message.includes('age_restricted')) return fail('age_restricted', message);
  if (message.includes('username_taken')) return fail('username_taken', message);

  return fail(fallback, message);
}
