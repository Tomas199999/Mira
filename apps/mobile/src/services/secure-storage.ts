import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Almacenamiento de la sesión de Supabase.
 *
 * SecureStore guarda en el Keychain de iOS y en el KeyStore de Android, que es
 * donde tiene que estar un refresh token. Pero tiene un límite de ~2048 bytes
 * por valor, y una sesión de Supabase (access token + refresh token + metadata
 * del usuario) lo pasa cómodamente.
 *
 * Si no se fragmenta, la escritura se trunca sin avisar y la sesión queda
 * corrupta: el usuario se desloguea solo, de forma intermitente y difícil de
 * diagnosticar. Por eso el valor se parte en trozos y se guarda cuántos son.
 */

const CHUNK_SIZE = 1800;
const COUNT_SUFFIX = '__chunks';

/** SecureStore sólo acepta [A-Za-z0-9._-] en las claves. */
function sanitize(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const isWeb = Platform.OS === 'web';

async function rawGet(key: string): Promise<string | null> {
  if (isWeb) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }
  return SecureStore.getItemAsync(key);
}

async function rawSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* modo privado */ }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function rawRemove(key: string): Promise<void> {
  if (isWeb) {
    try { globalThis.localStorage?.removeItem(key); } catch { /* ignorar */ }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = sanitize(key);
    try {
      const countRaw = await rawGet(`${base}${COUNT_SUFFIX}`);

      // Sin marca de fragmentos: valor guardado entero (o inexistente).
      if (countRaw === null) return rawGet(base);

      const count = Number.parseInt(countRaw, 10);
      if (!Number.isInteger(count) || count < 1) return null;

      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await rawGet(`${base}.${i}`);
        // Un fragmento faltante significa escritura incompleta: se descarta
        // todo en vez de devolver una sesión corrupta a medias.
        if (part === null) {
          await secureStorage.removeItem(key);
          return null;
        }
        parts.push(part);
      }
      return parts.join('');
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    const base = sanitize(key);
    // Limpiar antes de escribir: si el valor nuevo tiene menos fragmentos que
    // el viejo, los sobrantes quedarían huérfanos y corromperían la lectura.
    await secureStorage.removeItem(key);

    if (value.length <= CHUNK_SIZE) {
      await rawSet(base, value);
      return;
    }

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i += 1) {
      await rawSet(`${base}.${i}`, chunks[i]!);
    }
    // La marca se escribe al final: hasta que existe, una lectura concurrente
    // ve "sin sesión" en vez de una sesión a medio escribir.
    await rawSet(`${base}${COUNT_SUFFIX}`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const base = sanitize(key);
    try {
      const countRaw = await rawGet(`${base}${COUNT_SUFFIX}`);
      if (countRaw !== null) {
        const count = Number.parseInt(countRaw, 10);
        if (Number.isInteger(count)) {
          for (let i = 0; i < count; i += 1) await rawRemove(`${base}.${i}`);
        }
        await rawRemove(`${base}${COUNT_SUFFIX}`);
      }
      await rawRemove(base);
    } catch {
      /* borrar es idempotente: si falla, la sesión igual se descarta en memoria */
    }
  },
};
