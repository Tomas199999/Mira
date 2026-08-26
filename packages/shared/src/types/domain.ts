/**
 * Tipos del dominio de Mira, compartidos entre la app y el backend.
 *
 * Estos tipos reflejan el esquema de supabase/migrations. Si cambia una
 * migración, cambia acá. No hay generación automática todavía a propósito:
 * el mapeo explícito obliga a pensar qué campos salen del backend y cuáles no.
 */

export type Uuid = string;
/** Fecha calendaria en formato ISO `YYYY-MM-DD`. */
export type IsoDate = string;
/** Instante en formato ISO 8601 con zona. */
export type IsoDateTime = string;

// --- Perfil -------------------------------------------------------------------

export type AccountStatus = 'active' | 'suspended' | 'banned' | 'pending_deletion' | 'deleted';
export type AgeBand = 'under_13' | '13_15' | '16_17' | 'adult';

/** Lo que cualquier usuario autenticado puede ver de otro. */
export interface PublicProfile {
  id: Uuid;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  countryCode: string | null;
  currentStreak: number;
  bestStreak: number;
  totalCompleted: number;
}

/** Añadidos que sólo ve el propio usuario. */
export interface OwnProfile extends PublicProfile {
  ageBand: AgeBand;
  timezone: string;
  locale: string;
  accountStatus: AccountStatus;
  settings: UserSettings;
}

export type PhotoVisibility = 'friends' | 'friends_of_friends';

export interface UserSettings {
  photoVisibility: PhotoVisibility;
  privateAccount: boolean;
  showInGlobalRanking: boolean;
  showInCountryRanking: boolean;
  notifyDailyChallenge: boolean;
  notifyReminder: boolean;
  notifyFriendRequests: boolean;
  notifyFriendActivity: boolean;
  notifyReactions: boolean;
  notifyRanking: boolean;
  notifyAchievements: boolean;
}

// --- Desafío ------------------------------------------------------------------

export type ChallengeDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Estado del desafío tal como lo ve la app.
 *
 * `locked` es deliberadamente pobre en información: antes de que abra la
 * ventana el backend no manda el objeto (§5). La app sabe que hay algo
 * esperando, no qué es.
 */
export type ChallengeState =
  | { kind: 'none' }
  | { kind: 'locked'; challengeDate: IsoDate; opensAt: IsoDateTime }
  | {
      kind: 'open';
      windowId: Uuid;
      challengeDate: IsoDate;
      objectDisplayName: string;
      objectDescription: string | null;
      opensAt: IsoDateTime;
      closesAt: IsoDateTime;
      attemptsUsed: number;
      maxAttempts: number;
    }
  | {
      kind: 'completed';
      challengeDate: IsoDate;
      objectDisplayName: string;
      /**
       * La publicación con sus URLs firmadas. Puede venir `null` si el estado
       * se resolvió sin cargarla; la app dibuja el estado igual y pide la foto
       * aparte. Es preferible a forzar el tipo con un `as never`.
       */
      submission: Submission | null;
      currentStreak: number;
    }
  | {
      kind: 'reviewing';
      challengeDate: IsoDate;
      objectDisplayName: string;
      submissionId: Uuid;
    }
  | { kind: 'missed'; challengeDate: IsoDate; objectDisplayName: string; canSubmitLate: boolean };

// --- Publicaciones ------------------------------------------------------------

export type SubmissionStatus =
  | 'pending' | 'processing' | 'accepted' | 'rejected' | 'in_review' | 'blocked' | 'expired';

export interface Submission {
  id: Uuid;
  userId: Uuid;
  challengeDate: IsoDate;
  objectDisplayName: string;
  /** Signed URL de vida corta. Nunca una URL pública (§32). */
  photoUrl: string;
  thumbnailUrl: string | null;
  submittedAt: IsoDateTime;
  status: SubmissionStatus;
  countedForStreak: boolean;
  wasLate: boolean;
}

export interface FeedItem {
  submission: Submission;
  author: PublicProfile;
  streakAtTime: number;
  reactions: ReactionSummary;
}

export type ReactionType = 'fire' | 'laugh' | 'clap' | 'wow' | 'heart';

export interface ReactionSummary {
  counts: Record<ReactionType, number>;
  /** Qué reaccionó el usuario actual, si es que reaccionó. */
  mine: ReactionType | null;
}

// --- Grafo social -------------------------------------------------------------

export type RelationshipState =
  | 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'blocked' | 'blocked_by';

export interface FriendSummary {
  profile: PublicProfile;
  relationship: RelationshipState;
}

export interface FriendRequest {
  id: Uuid;
  profile: PublicProfile;
  direction: 'sent' | 'received';
  createdAt: IsoDateTime;
}

// --- Rankings -----------------------------------------------------------------

export type RankingScope = 'global' | 'country' | 'friends';

export interface RankingEntry {
  rank: number;
  profile: PublicProfile;
  score: number;
  isMe: boolean;
}

export interface RankingPage {
  scope: RankingScope;
  scopeKey: string | null;
  /** Fecha del snapshot. En `friends` es null porque se calcula al vuelo. */
  snapshotDate: IsoDate | null;
  entries: RankingEntry[];
  myEntry: RankingEntry | null;
  totalParticipants: number;
}

// --- Historial ----------------------------------------------------------------

export interface HistoryDay {
  date: IsoDate;
  objectDisplayName: string | null;
  submission: Submission | null;
  /** Qué pasó ese día: completado, perdido, protegido o sin desafío. */
  outcome: 'completed' | 'missed' | 'protected' | 'no_challenge' | 'late';
  streakAfter: number | null;
}

// --- Logros -------------------------------------------------------------------

export interface Achievement {
  code: string;
  displayName: string;
  description: string;
  icon: string;
  unlockedAt: IsoDateTime | null;
  isSecret: boolean;
}

// --- Reportes -----------------------------------------------------------------

export type ReportReason =
  | 'sexual_content' | 'violence' | 'hate' | 'harassment'
  | 'spam' | 'illegal' | 'dangerous' | 'impersonation' | 'other';
