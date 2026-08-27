import {
  decideFromConfidence,
  type ConfidenceThresholds,
  type ModerationProvider,
  type PipelineDecision,
  type VisionProvider,
  type VisionResponse,
} from '@mira/shared';
import type { ProcessedImage } from '../images/process';

/**
 * Pipeline de validación (§74).
 *
 * El orden importa y es la estrategia de costos: los pasos baratos descartan
 * antes de llegar al modelo. La moderación corre siempre, incluso si la foto
 * va a ser rechazada por no tener el objeto: una imagen prohibida no puede
 * quedar guardada como "rechazada" y visible para un moderador.
 */

export interface ChallengeSpec {
  objectName: string;
  displayName: string;
  aliases: string[];
  visualCriteria: string[];
}

export interface PipelineDeps {
  primary: VisionProvider;
  /** Modelo más capaz para los casos ambiguos. `null` desactiva el escalado. */
  escalation: VisionProvider | null;
  moderation: ModerationProvider;
  thresholds: ConfidenceThresholds;
  /** Devuelve el id de una publicación con la misma huella, si existe. */
  findDuplicate: (hash: Buffer) => Promise<string | null>;
}

export interface PipelineOutcome {
  decision: PipelineDecision;
  moderation: Awaited<ReturnType<ModerationProvider['check']>>;
  /** Una entrada por llamada al modelo, para auditar y medir el costo. */
  visionCalls: Array<{ stage: 'primary' | 'escalation'; response: VisionResponse }>;
}

export async function runPipeline(
  image: ProcessedImage,
  challenge: ChallengeSpec,
  deps: PipelineDeps,
): Promise<PipelineOutcome> {
  const visionCalls: PipelineOutcome['visionCalls'] = [];

  // 1. Duplicado: la misma foto ya subida. Gratis comparado con un modelo.
  const duplicate = await deps.findDuplicate(image.perceptualHash);
  if (duplicate) {
    const moderation = { allowed: true, safeForHumanReview: true, categories: {}, maxScore: 0 };
    return {
      decision: { outcome: 'rejected', confidence: 1, reason: 'duplicate_photo' },
      moderation,
      visionCalls,
    };
  }

  // 2. Moderación. Siempre, y antes que la detección del objeto: si la imagen
  //    está prohibida, no importa si la taza está o no.
  const moderation = await deps.moderation.check(image.analysisBase64, image.analysisMediaType);
  if (!moderation.allowed) {
    const worst = (Object.entries(moderation.categories)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? 'illegal') as never;
    return {
      decision: { outcome: 'blocked', category: worst, reason: 'moderation_blocked' },
      moderation,
      visionCalls,
    };
  }

  // 3. Detección con el modelo barato.
  const first = await deps.primary.analyze({
    imageBase64: image.analysisBase64,
    imageMediaType: image.analysisMediaType,
    expectedObject: challenge.objectName,
    expectedObjectDisplayName: challenge.displayName,
    aliases: challenge.aliases,
    visualCriteria: challenge.visualCriteria,
  });
  visionCalls.push({ stage: 'primary', response: first });

  let decision = decideFromConfidence(first.result, deps.thresholds);

  // 4. Sólo lo ambiguo escala al modelo caro. Con ~5% de escalado, cien mil
  //    usuarios diarios cuestan del orden de $260 en vez de $1.050 (docs/AI.md).
  if (decision.outcome === 'review' && deps.escalation) {
    const second = await deps.escalation.analyze({
      imageBase64: image.analysisBase64,
      imageMediaType: image.analysisMediaType,
      expectedObject: challenge.objectName,
      expectedObjectDisplayName: challenge.displayName,
      aliases: challenge.aliases,
      visualCriteria: challenge.visualCriteria,
    });
    visionCalls.push({ stage: 'escalation', response: second });
    decision = decideFromConfidence(second.result, deps.thresholds);
  }

  return { decision, moderation, visionCalls };
}
