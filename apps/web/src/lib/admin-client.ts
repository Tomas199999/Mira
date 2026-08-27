'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase para el panel, en el navegador.
 *
 * Usa la clave publicable, igual que la app móvil: el panel no tiene privilegios
 * propios. Quién es administrador lo decide `viewer_has_admin_role` dentro de
 * Postgres, así que abrir esta página sin serlo no muestra nada.
 */
let cached: SupabaseClient | null = null;

export function browserClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: true, autoRefreshToken: true } },
  );
  return cached;
}

export async function adminFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { data } = await browserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('unauthenticated');

  const response = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new Error(payload?.error?.code ?? `HTTP ${response.status}`);
  }
  return payload.data as T;
}
