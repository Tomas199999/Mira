import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { signPaths } from '@/server/images/signed-urls';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

interface QueueRow {
  submission_id: string; user_id: string; username: string;
  challenge_date: string; object_display: string; photo_path: string;
  ai_confidence: number | null; ai_reason: string | null;
  attempts: number; submitted_at: string;
}

/**
 * GET /api/admin/review — cola de revisión manual (§11).
 *
 * `admin_review_queue` ya excluye lo que el clasificador marcó como inseguro
 * de mirar. Este endpoint no vuelve a filtrar: si lo hiciera habría dos
 * definiciones de "qué es seguro" y una de las dos quedaría desactualizada.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  try {
    const { data, error } = await auth.db.rpc('admin_review_queue', { p_limit: 50 });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as QueueRow[];
    const signed = await signPaths(rows.map((r) => r.photo_path));

    return ok({
      items: rows.map((r) => ({
        submissionId: r.submission_id,
        username: r.username,
        challengeDate: r.challenge_date,
        objectDisplayName: r.object_display,
        photoUrl: signed.get(r.photo_path) ?? null,
        aiConfidence: r.ai_confidence,
        aiReason: r.ai_reason,
        attempts: r.attempts,
        submittedAt: r.submitted_at,
      })),
    });
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}

/** POST /api/admin/review — aceptar o rechazar un caso dudoso. */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { submissionId, accept, note } = await request.json().catch(() => ({}));
  if (!submissionId || typeof accept !== 'boolean') {
    return fail('not_found', 'submissionId and accept are required');
  }

  try {
    const { data, error } = await auth.db.rpc('admin_resolve_review', {
      p_submission_id: submissionId, p_accept: accept, p_note: note ?? null,
    });
    if (error) throw new Error(error.message);
    return ok(data);
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}
