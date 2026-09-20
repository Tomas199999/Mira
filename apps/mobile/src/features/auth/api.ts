import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/services/supabase';

/**
 * Operaciones de autenticación y alta de perfil.
 *
 * Ninguna decide nada: validan lo mínimo para no hacer un viaje inútil y
 * delegan en el servidor, que es quien manda (§61). En particular, el username
 * y la edad los valida `create_user_profile()` dentro de una transacción.
 */

export interface ProfileDraft {
  username: string;
  displayName: string;
  birthDate: string;   // ISO `YYYY-MM-DD`
  countryCode: string;
  timezone: string;
  locale: string;
}

/**
 * A dónde vuelve el link del mail de confirmación. Sin esto Supabase manda al
 * "Site URL" del proyecto, que de fábrica es localhost:3000 y no existe. La
 * URL tiene que estar en la lista de redirecciones permitidas del proyecto
 * (docs/DEPLOYMENT.md § Supabase): si no, Supabase la ignora en silencio.
 */
export const EMAIL_CONFIRM_PATH = 'auth/confirm';

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: Linking.createURL(EMAIL_CONFIRM_PATH) },
  });
  if (error) throw error;
}

/**
 * Canjea el código que trae el link del mail por una sesión. Funciona sólo en
 * el mismo dispositivo que pidió el alta: el verificador PKCE quedó guardado
 * ahí. Si el link se abre en otro lado, la cuenta igual queda confirmada y el
 * usuario entra con su contraseña.
 */
export async function completeEmailConfirmation(url: string): Promise<boolean> {
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  if (typeof code !== 'string' || !code) return false;
  const path = (parsed.path ?? '').replace(/^\/+/, '');
  if (path !== EMAIL_CONFIRM_PATH) return false;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return true;
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** ¿Este usuario ya completó el alta de perfil? */
export async function hasProfile(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/**
 * Consulta de disponibilidad para el onboarding. Es orientativa: entre esta
 * respuesta y el alta alguien puede tomar el nombre, y por eso la unicidad
 * real la garantiza el índice único de la base.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_username_available', {
    p_username: username,
  });
  if (error) throw error;
  return data === true;
}

/** Crea perfil, datos privados y ajustes en una sola transacción del servidor. */
export async function createProfile(draft: ProfileDraft): Promise<void> {
  const { error } = await supabase.rpc('create_user_profile', {
    p_username: draft.username,
    p_display_name: draft.displayName,
    p_birth_date: draft.birthDate,
    p_country_code: draft.countryCode,
    p_timezone: draft.timezone,
    p_locale: draft.locale,
  });
  if (error) throw error;
}

/** §50 — la baja se pide desde adentro de la app. Requisito de App Store. */
export async function requestAccountDeletion(reason?: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('unauthenticated');
  const { error } = await supabase
    .from('account_deletion_requests')
    .insert({ user_id: session.user.id, reason: reason ?? null });
  if (error) throw error;
}
