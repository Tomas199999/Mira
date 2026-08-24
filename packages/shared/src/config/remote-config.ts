/**
 * Configuración remota (§56).
 *
 * Estos valores viven en la tabla `app_config` y se pueden cambiar sin publicar
 * una versión de la app. Lo que hay acá son los DEFAULTS de emergencia: lo que
 * usa el cliente si todavía no pudo leer la config del backend.
 *
 * Los umbrales de IA y los límites de rate limiting NO están acá a propósito —
 * son `is_public = false` en la base y nunca salen del backend.
 */

export interface PublicRemoteConfig {
  challengeWindowStartHour: number;
  challengeWindowEndHour: number;
  challengeDurationMinutes: number;
  maxUploadAttempts: number;
  lateSubmissionsAllowed: boolean;
  streakProtectionEveryNDays: number;
  streakProtectionMaxStock: number;
  minAgeYears: number;
  minAgeYearsEea: number;
  feedPageSize: number;
  friendsOfFriendsEnabled: boolean;
}

export const DEFAULT_REMOTE_CONFIG: PublicRemoteConfig = {
  challengeWindowStartHour: 10,
  challengeWindowEndHour: 22,
  challengeDurationMinutes: 120,
  maxUploadAttempts: 3,
  lateSubmissionsAllowed: true,
  streakProtectionEveryNDays: 10,
  streakProtectionMaxStock: 2,
  minAgeYears: 13,
  minAgeYearsEea: 16,
  feedPageSize: 20,
  friendsOfFriendsEnabled: false,
};

/** Países del Espacio Económico Europeo: ahí la edad mínima sube a 16 (GDPR art. 8). */
export const EEA_COUNTRIES = new Set([
  'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
  'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO',
]);

export function minimumAgeFor(countryCode: string | null | undefined, cfg = DEFAULT_REMOTE_CONFIG): number {
  if (countryCode && EEA_COUNTRIES.has(countryCode.toUpperCase())) return cfg.minAgeYearsEea;
  return cfg.minAgeYears;
}

/** Convierte las claves snake_case de la base al objeto tipado del cliente. */
export function parseRemoteConfig(rows: Array<{ key: string; value: unknown }>): PublicRemoteConfig {
  const map = new Map(rows.map(r => [r.key, r.value]));
  const num = (k: string, fallback: number) => {
    const v = map.get(k);
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) ? n : fallback;
  };
  const bool = (k: string, fallback: boolean) => {
    const v = map.get(k);
    return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback;
  };
  const d = DEFAULT_REMOTE_CONFIG;
  return {
    challengeWindowStartHour: num('challenge_window_start_hour', d.challengeWindowStartHour),
    challengeWindowEndHour: num('challenge_window_end_hour', d.challengeWindowEndHour),
    challengeDurationMinutes: num('challenge_duration_minutes', d.challengeDurationMinutes),
    maxUploadAttempts: num('max_upload_attempts', d.maxUploadAttempts),
    lateSubmissionsAllowed: bool('late_submissions_allowed', d.lateSubmissionsAllowed),
    streakProtectionEveryNDays: num('streak_protection_every_n_days', d.streakProtectionEveryNDays),
    streakProtectionMaxStock: num('streak_protection_max_stock', d.streakProtectionMaxStock),
    minAgeYears: num('min_age_years', d.minAgeYears),
    minAgeYearsEea: num('min_age_years_eea', d.minAgeYearsEea),
    feedPageSize: num('feed_page_size', d.feedPageSize),
    friendsOfFriendsEnabled: bool('friends_of_friends_enabled', d.friendsOfFriendsEnabled),
  };
}
