import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { consume } from '@/server/rate-limit';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/** Tope duro. Más que esto deja de ser "buscar a mis contactos". */
const MAX_HASHES = 2000;

/**
 * POST /api/friends/match-contacts — comparar la agenda contra quienes optaron
 * por ser encontrables.
 *
 * Lo que llega son hashes, nunca números ni nombres. Lo que no coincide se
 * descarta en la misma consulta: no hay ninguna tabla donde se guarde la agenda
 * de nadie (§16, docs/SECURITY.md § Contactos).
 *
 * El rate limit no es cosmético: sin él, este endpoint es una herramienta de
 * enumeración — se prueban rangos de números hasta encontrar quién está.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const body = await request.json().catch(() => ({}));
  const hashes: unknown = body?.phoneHashes;

  if (!Array.isArray(hashes) || hashes.length === 0) {
    return fail('image_invalid', 'phoneHashes must be a non-empty array');
  }
  if (hashes.length > MAX_HASHES) {
    return fail('image_invalid', `at most ${MAX_HASHES} hashes per request`);
  }

  const limit = await consume('contactSync', auth.userId);
  if (!limit.allowed) {
    return fail('rate_limited', 'too many contact syncs today', limit.retryAfter);
  }

  // Cada hash tiene que ser sha256 en hexadecimal. Filtrar acá evita mandarle
  // basura a Postgres y deja el error del lado del cliente, donde corresponde.
  const clean = hashes
    .filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h))
    .map((h) => `\\x${h.toLowerCase()}`);

  if (clean.length === 0) return fail('image_invalid', 'no valid sha256 hashes');

  try {
    const { data, error } = await auth.db.rpc('match_contact_hashes', { p_hashes: clean });
    if (error) throw new Error(error.message);

    const matches = (data ?? []) as Array<{
      user_id: string; username: string; display_name: string;
      avatar_path: string | null; relationship: string;
    }>;

    return ok({
      matches: matches.map((m) => ({
        userId: m.user_id,
        username: m.username,
        displayName: m.display_name,
        avatarPath: m.avatar_path,
        relationship: m.relationship,
      })),
      submitted: clean.length,
    });
  } catch (error) {
    return failFromError(error);
  }
}
