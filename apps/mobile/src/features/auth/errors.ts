import type { ApiErrorCode } from '@mira/shared';
import { t } from '@/i18n';

/**
 * Traduce cualquier error —de Supabase Auth, de Postgres o de la red— a un
 * código estable y de ahí a un texto que se le puede mostrar a una persona.
 *
 * §58: el usuario nunca ve "API Error 500" ni un código de Postgres. Y lo que
 * sí ve nunca revela si un email está registrado, porque eso permite enumerar
 * cuentas.
 */

interface Unknownish {
  message?: unknown;
  code?: unknown;
  status?: unknown;
}

export function toErrorCode(error: unknown): ApiErrorCode {
  const e = (error ?? {}) as Unknownish;
  const raw = typeof e.message === 'string' ? e.message : '';
  const msg = raw.toLowerCase();
  const code = typeof e.code === 'string' ? e.code : '';

  // Errores que levanta create_user_profile() con RAISE EXCEPTION.
  if (raw.includes('username_taken')) return 'username_taken';
  if (raw.includes('username_reserved') || raw.includes('username_invalid')) return 'username_invalid';
  if (raw.includes('age_restricted') || raw.includes('birth_date_invalid')) return 'age_restricted';
  if (raw.includes('profile_already_exists')) return 'forbidden';
  if (raw.includes('unauthenticated')) return 'unauthenticated';

  // Códigos de Postgres.
  if (code === '42501' || msg.includes('permission denied')) return 'forbidden';
  if (code === '23505') return 'username_taken';

  // Supabase Auth.
  if (msg.includes('invalid login credentials')) return 'unauthenticated';
  if (msg.includes('email not confirmed')) return 'unauthenticated';
  if (msg.includes('user already registered')) return 'username_taken';
  if (msg.includes('rate limit') || e.status === 429) return 'rate_limited';
  if (msg.includes('provider is not enabled')) return 'internal';

  // Red.
  if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('timeout')) {
    return 'internal';
  }

  return 'internal';
}

export function toUserMessage(error: unknown): string {
  const copy = t().errors;
  switch (toErrorCode(error)) {
    case 'username_taken':   return copy.usernameTaken;
    case 'username_invalid': return copy.usernameInvalid;
    case 'age_restricted':   return copy.ageRestricted;
    case 'unauthenticated':  return copy.invalidCredentials;
    case 'rate_limited':     return copy.rateLimited;
    case 'forbidden':        return copy.generic;
    default:                 return copy.generic;
  }
}

/**
 * Los errores de red merecen otro mensaje: no es "algo salió mal", es "revisá
 * tu conexión", que es accionable.
 */
export function isNetworkError(error: unknown): boolean {
  const msg = String((error as Unknownish)?.message ?? '').toLowerCase();
  return msg.includes('network') || msg.includes('fetch failed') || msg.includes('timeout');
}
