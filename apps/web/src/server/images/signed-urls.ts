import { adminClient } from '../supabase';

const BUCKET = process.env.STORAGE_BUCKET_SUBMISSIONS ?? 'submissions';
const TTL = Number(process.env.STORAGE_SIGNED_URL_TTL_SECONDS ?? 900);

/**
 * Firma varias rutas en una sola llamada.
 *
 * El bucket es privado (§32) y los usuarios no tienen política de lectura sobre
 * las fotos ajenas: la única forma de verlas es una URL firmada que emite el
 * servidor, después de que RLS decidió que esa persona puede verlas.
 *
 * Se firma en lote a propósito: una llamada por foto convertiría un feed de
 * veinte publicaciones en veinte viajes a Storage.
 */
export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data, error } = await adminClient()
    .storage.from(BUCKET).createSignedUrls(unique, TTL);

  if (error || !data) {
    console.error('[storage] no se pudieron firmar las URLs', error?.message);
    return new Map();
  }

  const signed = new Map<string, string>();
  for (const entry of data) {
    if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}
