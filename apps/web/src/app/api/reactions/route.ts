import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

const VALID = new Set(['fire', 'laugh', 'clap', 'wow', 'heart']);

/**
 * POST /api/reactions — poner o quitar una reacción.
 *
 * Una por persona y publicación. La política de RLS exige además que se pueda
 * ver la publicación, así que no hace falta comprobarlo acá: reaccionar a algo
 * invisible falla en la base.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { submissionId, type } = await request.json().catch(() => ({}));
  if (!submissionId) return fail('not_found', 'submissionId is required');
  if (type !== null && !VALID.has(type)) return fail('image_invalid', 'unknown reaction type');

  try {
    const { error } = type === null
      ? await auth.db.from('reactions')
          .delete().eq('submission_id', submissionId).eq('user_id', auth.userId)
      : await auth.db.from('reactions')
          .upsert({ submission_id: submissionId, user_id: auth.userId, type },
                  { onConflict: 'submission_id,user_id' });
    if (error) throw new Error(error.message);
    return ok({ type });
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}
