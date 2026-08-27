import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { adminClient } from '@/server/supabase';
import { fail, failFromError, ok } from '@/server/response';
import { processImage } from '@/server/images/process';
import { runPipeline } from '@/server/ai/pipeline';
import { ClaudeVisionProvider } from '@/server/ai/vision-claude';
import { ClaudeModerationProvider } from '@/server/ai/moderation-claude';

export const dynamic = 'force-dynamic';
// La cascada de visión puede tardar; sin esto la función se corta a la mitad
// y la foto queda en 'pending' para siempre.
export const maxDuration = 120;

const BUCKET = process.env.STORAGE_BUCKET_SUBMISSIONS ?? 'submissions';

/**
 * POST /api/submissions/finalize — paso 2: la foto ya está en Storage.
 *
 * Acá corre el pipeline completo y se escribe el veredicto. El cliente no
 * decide nada: manda el token y espera el resultado (§61).
 */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  let body: { submissionId?: string; uploadToken?: string };
  try {
    body = await request.json();
  } catch {
    return fail('image_invalid', 'body is not valid json');
  }
  if (!body.submissionId || !body.uploadToken) {
    return fail('upload_token_invalid', 'submissionId and uploadToken are required');
  }

  const db = adminClient();

  try {
    // 1. El token es de un solo uso y tiene que corresponder a esta publicación.
    const { data: consumed, error: tokenError } = await db.rpc('consume_upload_token', {
      p_token: body.uploadToken,
      p_submission_id: body.submissionId,
    });
    if (tokenError) throw new Error(tokenError.message);
    if (consumed !== true) return fail('upload_token_invalid', 'token expired, reused or mismatched');

    // 2. Cargar la publicación y su desafío.
    const { data: submission, error: subError } = await db
      .from('submissions')
      .select('id, user_id, photo_path, was_late, daily_challenge_id, challenge_date')
      .eq('id', body.submissionId)
      .single();
    if (subError) throw new Error(subError.message);
    if (submission.user_id !== auth.userId) return fail('forbidden', 'submission belongs to another user');

    const { data: challenge, error: chError } = await db
      .from('daily_challenges')
      .select('challenge_objects(object_name, display_name, aliases, visual_criteria)')
      .eq('id', submission.daily_challenge_id)
      .single();
    if (chError) throw new Error(chError.message);

    const object = (challenge as unknown as {
      challenge_objects: { object_name: string; display_name: string; aliases: string[]; visual_criteria: string[] };
    }).challenge_objects;

    // 3. Descargar lo que el cliente subió. Nunca se confía en los metadatos
    //    que el cliente declaró: se miden sobre el archivo real (§62).
    const { data: blob, error: dlError } = await db.storage.from(BUCKET).download(submission.photo_path);
    if (dlError || !blob) return fail('image_invalid', 'uploaded file not found');

    const original = Buffer.from(await blob.arrayBuffer());
    const image = await processImage(original);

    // 4. Pipeline.
    const thresholds = await loadThresholds(db);
    const primaryModel = process.env.VISION_MODEL_PRIMARY ?? 'claude-haiku-4-5';
    const escalationModel = process.env.VISION_MODEL_ESCALATION ?? 'claude-opus-5';
    const escalationEnabled = await loadFlag(db, 'ai_escalation_enabled', true);

    const outcome = await runPipeline(image, {
      objectName: object.object_name,
      displayName: object.display_name,
      aliases: object.aliases ?? [],
      visualCriteria: object.visual_criteria ?? [],
    }, {
      primary: new ClaudeVisionProvider(primaryModel),
      escalation: escalationEnabled ? new ClaudeVisionProvider(escalationModel) : null,
      moderation: new ClaudeModerationProvider(primaryModel),
      thresholds,
      findDuplicate: async (hash) => {
        const { data } = await db.rpc('find_duplicate_photo', {
          p_hash: `\\x${hash.toString('hex')}`,
          p_exclude: submission.id,
          p_max_distance: 8,
        });
        return (data as string | null) ?? null;
      },
    });

    // 5. Guardar la traza: es lo que permite auditar, calibrar umbrales y saber
    //    cuánto cuesta esto de verdad (§48, §75).
    for (const call of outcome.visionCalls) {
      await db.from('ai_validations').insert({
        submission_id: submission.id,
        provider: call.response.metadata.provider,
        model: call.response.metadata.model,
        stage: call.stage,
        expected_object: object.object_name,
        detected_object: call.response.result.detectedObject,
        valid: call.response.result.valid,
        confidence: call.response.result.confidence,
        reason: call.response.result.reason,
        needs_manual_review: call.response.result.needsManualReview,
        input_tokens: call.response.metadata.inputTokens,
        output_tokens: call.response.metadata.outputTokens,
        latency_ms: call.response.metadata.latencyMs,
      });
    }

    await db.from('moderation_results').insert({
      submission_id: submission.id,
      provider: 'anthropic',
      status: outcome.moderation.allowed ? 'passed' : 'blocked',
      categories: outcome.moderation.categories,
      max_score: outcome.moderation.maxScore,
      safe_for_human_review: outcome.moderation.safeForHumanReview,
    });

    // 6. Variantes. Sólo si la foto va a ser visible: no tiene sentido pagar
    //    storage por miniaturas de algo bloqueado.
    const status = toSubmissionStatus(outcome.decision.outcome);
    if (status === 'accepted' || status === 'in_review') {
      await Promise.all([
        db.storage.from(BUCKET).upload(
          submission.photo_path.replace(/\.webp$/, '_thumb.webp'), image.thumbnail,
          { contentType: 'image/webp', upsert: true }),
        db.storage.from(BUCKET).upload(
          submission.photo_path.replace(/\.webp$/, '_medium.webp'), image.medium,
          { contentType: 'image/webp', upsert: true }),
      ]);
      await db.from('submissions').update({
        thumbnail_path: submission.photo_path.replace(/\.webp$/, '_thumb.webp'),
        medium_path: submission.photo_path.replace(/\.webp$/, '_medium.webp'),
        width: image.width, height: image.height, bytes: image.bytes,
      }).eq('id', submission.id);
    }

    // 7. Veredicto y racha, en una transacción.
    const { data: applied, error: applyError } = await db.rpc('apply_submission_result', {
      p_submission_id: submission.id,
      p_status: status,
      p_ai_decision: toAiDecision(outcome.decision.outcome),
      p_confidence: 'confidence' in outcome.decision ? outcome.decision.confidence : null,
      p_moderation: outcome.moderation.allowed ? 'passed' : 'blocked',
      p_perceptual_hash: `\\x${image.perceptualHash.toString('hex')}`,
      p_file_sha256: `\\x${image.sha256.toString('hex')}`,
    });
    if (applyError) throw new Error(applyError.message);

    const result = applied as { status: string; streak: number; counted_for_streak: boolean; was_late: boolean };

    return ok({
      status,
      streak: { current: result.streak, increasedBy: result.counted_for_streak ? 1 : 0 },
      wasLate: result.was_late,
      reason: outcome.decision.reason,
      detectedObject: outcome.visionCalls.at(-1)?.response.result.detectedObject ?? null,
    });
  } catch (error) {
    return failFromError(error, 'vision_unavailable');
  }
}

function toSubmissionStatus(outcome: string): 'accepted' | 'rejected' | 'in_review' | 'blocked' {
  if (outcome === 'accepted') return 'accepted';
  if (outcome === 'rejected') return 'rejected';
  if (outcome === 'blocked') return 'blocked';
  return 'in_review';
}

function toAiDecision(outcome: string): 'accepted' | 'rejected' | 'review' | 'error' {
  if (outcome === 'accepted') return 'accepted';
  if (outcome === 'rejected') return 'rejected';
  if (outcome === 'blocked') return 'rejected';
  return 'review';
}

async function loadThresholds(db: ReturnType<typeof adminClient>) {
  const { data } = await db.from('app_config').select('key, value')
    .in('key', ['ai_confidence_accept', 'ai_confidence_reject']);
  const map = new Map((data ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    accept: map.get('ai_confidence_accept') ?? 0.8,
    reject: map.get('ai_confidence_reject') ?? 0.4,
  };
}

async function loadFlag(db: ReturnType<typeof adminClient>, key: string, fallback: boolean) {
  const { data } = await db.from('app_config').select('value').eq('key', key).maybeSingle();
  if (!data) return fallback;
  return data.value === true || data.value === 'true';
}
