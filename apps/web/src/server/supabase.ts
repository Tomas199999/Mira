import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Dos clientes, y la diferencia importa.
 *
 * `adminClient` usa la clave secreta y saltea RLS por completo. Se usa SÓLO en
 * los jobs y en operaciones donde el servidor ya decidió qué corresponde.
 *
 * `userClient` reenvía el JWT del usuario, así que todas las consultas pasan
 * por las mismas políticas de RLS que aplicarían desde la app. Es el que usan
 * los endpoints de cara al usuario: si un endpoint necesita el cliente admin
 * para leer datos de alguien, casi siempre significa que la política está mal.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function userClient(accessToken: string): SupabaseClient {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
