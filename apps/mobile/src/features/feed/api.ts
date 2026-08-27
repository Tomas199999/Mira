import Constants from 'expo-constants';
import type { ReactionType } from '@mira/shared';
import { supabase } from '@/services/supabase';

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)
  ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export interface FeedEntry {
  submission: {
    id: string;
    userId: string;
    challengeDate: string;
    objectDisplayName: string;
    photoUrl: string;
    thumbnailUrl: string | null;
    submittedAt: string;
    wasLate: boolean;
  };
  author: { id: string; username: string; displayName: string; currentStreak: number };
  reactions: { counts: Partial<Record<ReactionType, number>>; mine: ReactionType | null };
}

async function headers(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('unauthenticated');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/**
 * Las URLs de las fotos vienen firmadas y vencen. Si el usuario deja la app
 * abierta un rato largo, recargar el feed es lo que renueva los enlaces: por
 * eso las imágenes no se cachean por URL más allá de la sesión.
 */
export async function getFeed(cursor?: string): Promise<{ items: FeedEntry[]; nextCursor: string | null }> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const response = await fetch(`${API_BASE}/api/feed${query}`, { headers: await headers() });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) throw new Error(payload?.error?.code ?? 'internal');
  return payload.data;
}

export async function react(submissionId: string, type: ReactionType | null): Promise<void> {
  const response = await fetch(`${API_BASE}/api/reactions`, {
    method: 'POST', headers: await headers(),
    body: JSON.stringify({ submissionId, type }),
  });
  if (!response.ok) throw new Error('reaction_failed');
}
