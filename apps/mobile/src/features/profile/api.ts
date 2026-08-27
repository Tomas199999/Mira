import Constants from 'expo-constants';
import type { RankingScope } from '@mira/shared';
import { supabase } from '@/services/supabase';

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)
  ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export interface RankEntry {
  rank: number; userId: string; username: string;
  displayName: string; score: number; isMe: boolean;
}

export interface RankingPage {
  scope: RankingScope;
  snapshotDate: string | null;
  entries: RankEntry[];
  myEntry: { rank: number } | null;
  totalParticipants?: number;
  nextAfter: number | null;
}

export type DayOutcome = 'completed' | 'late' | 'reviewing' | 'missed' | 'protected' | 'no_challenge';

export interface HistoryDay {
  date: string;
  objectDisplayName: string | null;
  outcome: DayOutcome;
  streakAfter: number | null;
  submission: { id: string; thumbnailUrl: string | null } | null;
}

export interface MyProfile {
  profile: {
    id: string; username: string; displayName: string; bio: string | null;
    countryCode: string | null; currentStreak: number; bestStreak: number; totalCompleted: number;
  };
  stats: {
    currentStreak: number; bestStreak: number; totalCompleted: number;
    friendCount: number; protections: number; participationRate: number;
    achievements: Array<{ code: string; displayName: string; description: string; icon: string; unlockedAt: string | null }>;
  } | null;
  ranks: { global: number | null; country: number | null };
}

async function get<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('unauthenticated');
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.code ?? 'internal');
  return payload.data as T;
}

export const getRanking = (scope: RankingScope) =>
  get<RankingPage>(`/api/rankings?scope=${scope}`);

export const getHistory = (month: string) =>
  get<{ month: string; days: HistoryDay[]; participationRate: number }>(`/api/history?month=${month}`);

export const getMyProfile = () => get<MyProfile>('/api/profile/me');
