import type { NextRequest } from 'next/server';
import { adminClient, userClient } from './supabase';

export interface AuthedRequest {
  userId: string;
  accessToken: string;
  /** Cliente con el JWT del usuario: todas las consultas pasan por RLS. */
  db: ReturnType<typeof userClient>;
}

/**
 * Verifica el token de la petición contra Supabase.
 *
 * No alcanza con decodificar el JWT: hay que preguntarle a Supabase, porque un
 * token puede estar revocado o pertenecer a una cuenta suspendida aunque su
 * firma sea válida y no haya vencido.
 */
export async function authenticate(request: NextRequest): Promise<AuthedRequest | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const accessToken = header.slice(7).trim();
  if (!accessToken) return null;

  const { data, error } = await adminClient().auth.getUser(accessToken);
  if (error || !data.user) return null;

  return { userId: data.user.id, accessToken, db: userClient(accessToken) };
}

/**
 * Comprueba que la llamada venga del cron de Vercel.
 *
 * Vercel manda `Authorization: Bearer $CRON_SECRET` cuando la variable existe.
 * Sin esto, cualquiera podría disparar los jobs desde afuera.
 */
export function isCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
