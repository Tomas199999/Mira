/**
 * Contrato de la API REST entre la app y el backend.
 *
 * Un solo lugar donde vive la forma de cada request y cada response. El backend
 * implementa estos tipos y la app los consume; cualquier divergencia la detecta
 * el typecheck antes de llegar a producción.
 */

import type {
  Achievement, ChallengeState, FeedItem, FriendRequest, FriendSummary,
  HistoryDay, IsoDate, OwnProfile, PublicProfile, RankingPage, RankingScope,
  ReactionType, ReportReason, Submission, UserSettings, Uuid,
} from './domain.js';

/** Toda respuesta de error usa esta forma. Ver §58: el usuario nunca ve un 500. */
export interface ApiError {
  /** Código estable para que la app decida el mensaje y el idioma. */
  code: ApiErrorCode;
  /** Texto en inglés para logs. NO se muestra al usuario. */
  detail: string;
  /** Segundos hasta poder reintentar, cuando aplica. */
  retryAfter?: number;
}

export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'account_suspended'
  | 'challenge_not_open'
  | 'challenge_already_completed'
  | 'attempts_exhausted'
  | 'upload_token_invalid'
  | 'attestation_failed'
  | 'duplicate_photo'
  | 'image_invalid'
  | 'moderation_blocked'
  | 'rate_limited'
  | 'username_taken'
  | 'username_invalid'
  | 'age_restricted'
  | 'not_found'
  | 'vision_unavailable'
  | 'internal';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

// --- Autenticación y alta -----------------------------------------------------

export interface CompleteSignupRequest {
  username: string;
  displayName: string;
  /** ISO `YYYY-MM-DD`. Se valida contra la edad mínima antes de crear nada. */
  birthDate: IsoDate;
  countryCode: string;
  timezone: string;
  locale: string;
}

export interface CheckUsernameResponse {
  available: boolean;
  reason?: 'taken' | 'too_short' | 'too_long' | 'invalid_chars' | 'reserved';
  suggestions: string[];
}

// --- Desafío diario -----------------------------------------------------------

export type GetChallengeResponse = ChallengeState;

/**
 * Paso 1 de la subida: el backend valida ventana, intentos y attestation, y
 * devuelve una URL firmada para subir directo a Storage. Los bytes de la foto
 * no pasan por el backend (ver docs/ARCHITECTURE.md § Subida de fotos).
 */
export interface StartSubmissionRequest {
  windowId: Uuid;
  /** Token de App Attest / Play Integrity generado en el dispositivo. */
  attestationToken: string;
  deviceId: string;
  /** Metadatos de la imagen. Señales, no fuente de verdad (§62). */
  capturedAt: string;
  width: number;
  height: number;
  bytes: number;
}

export interface StartSubmissionResponse {
  submissionId: Uuid;
  uploadUrl: string;
  uploadPath: string;
  /** Se manda de vuelta en finalize; de un solo uso y de vida corta. */
  uploadToken: string;
  expiresAt: string;
}

/** Paso 2: subida terminada, arranca el pipeline de validación. */
export interface FinalizeSubmissionRequest {
  submissionId: Uuid;
  uploadToken: string;
  /** SHA-256 del archivo subido, para verificar que es el mismo. */
  sha256: string;
}

export interface FinalizeSubmissionResponse {
  status: 'accepted' | 'rejected' | 'in_review' | 'blocked';
  /** Mensaje ya localizado y apto para mostrar. Nunca un error técnico. */
  message: string;
  submission: Submission | null;
  attemptsRemaining: number;
  streak: { current: number; best: number; increasedBy: number } | null;
  /** Posición mundial aproximada tras este envío, si el usuario participa. */
  globalRank: number | null;
}

// --- Feed ---------------------------------------------------------------------

export interface FeedQuery {
  cursor?: string;
  limit?: number;
}

export interface FeedResponse {
  items: FeedItem[];
  nextCursor: string | null;
}

export interface ReactRequest {
  submissionId: Uuid;
  /** `null` quita la reacción. */
  type: ReactionType | null;
}

// --- Social -------------------------------------------------------------------

export interface SearchUsersResponse {
  results: FriendSummary[];
}

/**
 * Descubrimiento por contactos (§16).
 *
 * El cliente manda SÓLO hashes, nunca números ni nombres. El backend compara
 * contra los hashes que cada usuario publicó de su propio teléfono y descarta
 * de inmediato los que no matchean: no se persiste la agenda de nadie.
 * Ver docs/SECURITY.md § Contactos.
 */
export interface MatchContactsRequest {
  /** SHA-256 de cada teléfono normalizado a E.164, con el salt de la app. */
  phoneHashes: string[];
}

export interface MatchContactsResponse {
  matches: FriendSummary[];
  /** Cuántos hashes se enviaron, para que la app muestre "X de Y encontrados". */
  submitted: number;
}

export interface FriendsResponse {
  friends: FriendSummary[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

// --- Rankings, perfil, historial ----------------------------------------------

export interface RankingQuery {
  scope: RankingScope;
  countryCode?: string;
  cursor?: string;
  limit?: number;
}

export type RankingResponse = RankingPage;

export interface ProfileResponse {
  profile: PublicProfile;
  relationship: FriendSummary['relationship'];
  achievements: Achievement[];
  ranks: { global: number | null; country: number | null; friends: number | null };
  friendCount: number;
  /** Sólo si el que consulta puede ver el contenido. */
  recentPhotos: Submission[];
}

export interface HistoryQuery {
  /** Mes en formato `YYYY-MM`. */
  month: string;
}

export interface HistoryResponse {
  month: string;
  days: HistoryDay[];
  participationRate: number;
}

export type UpdateSettingsRequest = Partial<UserSettings>;
export type MeResponse = OwnProfile;

// --- Seguridad ----------------------------------------------------------------

export interface ReportRequest {
  submissionId?: Uuid;
  reportedUserId?: Uuid;
  reason: ReportReason;
  description?: string;
}

export interface DeleteAccountRequest {
  /** Confirmación explícita: el usuario escribe su username. */
  confirmUsername: string;
  reason?: string;
}

export interface DeleteAccountResponse {
  scheduledFor: string;
  /** Días de gracia para arrepentirse antes del borrado definitivo. */
  graceDays: number;
}

// --- Push ---------------------------------------------------------------------

export interface RegisterPushTokenRequest {
  token: string;
  platform: 'ios' | 'android';
  deviceId: string;
  appVersion: string;
}
