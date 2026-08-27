import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { supabase } from '@/services/supabase';

/**
 * Grafo social y descubrimiento por contactos.
 *
 * La regla de §16 se cumple acá: la agenda **no sale del teléfono**. Se lee, se
 * normaliza, se hashea y se descarta. Lo que viaja son hashes; los nombres no
 * se mandan nunca.
 */

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)
  ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

/**
 * Separador de dominio. Viaja dentro del binario, o sea que NO es un secreto:
 * lo que hace es impedir que estos hashes se crucen con los de otra app.
 * Tiene que coincidir con `contact_hash_salt` en app_config.
 */
const CONTACT_SALT = 'mira.contacts.v1';

export interface PersonSummary {
  userId: string;
  username: string;
  displayName: string;
  avatarPath: string | null;
  currentStreak?: number;
  relationship: 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'blocked';
}

export interface SocialGraph {
  friends: PersonSummary[];
  incoming: Array<PersonSummary & { requestId: string }>;
  outgoing: Array<PersonSummary & { requestId: string }>;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('unauthenticated');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: await authHeaders(),
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw Object.assign(new Error(payload?.error?.detail ?? `HTTP ${response.status}`), {
      code: payload?.error?.code ?? 'internal',
    });
  }
  return payload.data as T;
}

export const getSocialGraph = () => call<SocialGraph>('/api/friends');

export const searchUsers = (query: string) =>
  call<{ results: PersonSummary[] }>(`/api/users/search?q=${encodeURIComponent(query)}`)
    .then((r) => r.results);

export const sendRequest = (targetUserId: string) =>
  call('/api/friends/request', { method: 'POST', body: { targetUserId } });

export const respondToRequest = (requestId: string, accept: boolean) =>
  call('/api/friends/respond', { method: 'POST', body: { requestId, accept } });

export const removeFriend = (userId: string) =>
  call('/api/friends/remove', { method: 'POST', body: { userId } });

export const setBlocked = (userId: string, blocked: boolean) =>
  call('/api/friends/block', { method: 'POST', body: { userId, blocked } });

export const setPhoneDiscoverable = (phone: string | null, discoverable: boolean) =>
  call<{ discoverable: boolean }>('/api/profile/phone', {
    method: 'POST', body: { phone, discoverable },
  });

export interface ContactMatchOutcome {
  matches: PersonSummary[];
  /** Cuántos números de la agenda pudieron normalizarse y se compararon. */
  compared: number;
  /** Cuántos se descartaron por no poder interpretarse. */
  skipped: number;
}

/**
 * Lee la agenda, normaliza los teléfonos y compara sólo hashes.
 *
 * `defaultCountry` hace falta porque un número guardado como "11 3333 4444" es
 * ambiguo sin país. Se usa el del perfil del usuario.
 */
export async function findContactsOnMira(defaultCountry: string): Promise<ContactMatchOutcome> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status !== 'granted') {
    throw Object.assign(new Error('contacts permission denied'), { code: 'contacts_denied' });
  }

  // Sólo se piden los números. Ni nombres, ni emails, ni fotos: lo que no se
  // pide no se puede filtrar por accidente.
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });

  const normalized = new Set<string>();
  let skipped = 0;

  for (const contact of data) {
    for (const entry of contact.phoneNumbers ?? []) {
      const raw = entry.number;
      if (!raw) continue;
      const parsed = parsePhoneNumberFromString(raw, defaultCountry as CountryCode);
      if (parsed?.isValid()) normalized.add(parsed.number);
      else skipped += 1;
    }
  }

  if (normalized.size === 0) return { matches: [], compared: 0, skipped };

  const hashes = await Promise.all(
    [...normalized].map((phone) =>
      Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, CONTACT_SALT + phone)),
  );

  const result = await call<{ matches: PersonSummary[]; submitted: number }>(
    '/api/friends/match-contacts', { method: 'POST', body: { phoneHashes: hashes } });

  // `normalized` y `hashes` quedan sólo en memoria y mueren con esta función.
  return { matches: result.matches, compared: result.submitted, skipped };
}
