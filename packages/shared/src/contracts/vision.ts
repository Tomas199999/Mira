/**
 * Contrato del proveedor de visión.
 *
 * La app y el backend hablan con la IA a través de esta interfaz, nunca contra
 * un SDK concreto (§2: "la arquitectura debe ser independiente del proveedor").
 * Cambiar de modelo o de proveedor es escribir otra implementación de
 * `VisionProvider`, no tocar el pipeline.
 */

/** Lo que se le pide al modelo mirar. */
export interface VisionRequest {
  /** Imagen ya comprimida, en base64. */
  imageBase64: string;
  imageMediaType: 'image/jpeg' | 'image/webp' | 'image/png';
  /** Clave canónica en inglés, p.ej. 'mug'. */
  expectedObject: string;
  /** Cómo lo llama el usuario, p.ej. 'una taza'. */
  expectedObjectDisplayName: string;
  /** Sinónimos aceptados: evita depender de una sola palabra (§10). */
  aliases: string[];
  /** Criterios en lenguaje natural que definen qué cuenta y qué no. */
  visualCriteria: string[];
}

/** La forma exacta que pide la especificación en §2 y §10. */
export interface VisionResult {
  valid: boolean;
  /** 0 a 1. */
  confidence: number;
  detectedObject: string | null;
  reason: string;
  needsManualReview: boolean;
}

/** Metadatos de la llamada, para auditoría y control de costos (§48, §75). */
export interface VisionCallMetadata {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

export interface VisionResponse {
  result: VisionResult;
  metadata: VisionCallMetadata;
  raw: unknown;
}

export interface VisionProvider {
  readonly name: string;
  readonly model: string;
  analyze(request: VisionRequest): Promise<VisionResponse>;
}

/** Categorías de la moderación de contenido (§24). */
export interface ModerationResult {
  /** `false` bloquea la publicación, sin excepciones. */
  allowed: boolean;
  /**
   * Si es `false`, la imagen NO puede llegar a un revisor humano.
   * Ver docs/SECURITY.md § Moderación.
   */
  safeForHumanReview: boolean;
  categories: Partial<Record<ModerationCategory, number>>;
  maxScore: number;
}

export type ModerationCategory =
  | 'nudity' | 'sexual' | 'minor_safety' | 'violence' | 'gore'
  | 'weapons' | 'drugs' | 'hate_symbols' | 'self_harm' | 'illegal';

export interface ModerationProvider {
  readonly name: string;
  check(imageBase64: string, mediaType: string): Promise<ModerationResult>;
}

/**
 * Decisión final del pipeline (§74). No es "si la IA dice taza, aceptar":
 * la confianza se compara contra umbrales configurables y el caso ambiguo va
 * a revisión en lugar de castigar al usuario.
 */
export type PipelineDecision =
  | { outcome: 'accepted'; confidence: number; reason: string }
  | { outcome: 'rejected'; confidence: number; reason: string }
  | { outcome: 'review'; confidence: number; reason: string }
  | { outcome: 'blocked'; category: ModerationCategory; reason: string };

export interface ConfidenceThresholds {
  /** Igual o mayor: se acepta solo. */
  accept: number;
  /** Igual o menor: se rechaza solo. */
  reject: number;
}

export function decideFromConfidence(
  result: VisionResult,
  thresholds: ConfidenceThresholds,
): PipelineDecision {
  const { confidence, reason } = result;

  if (result.needsManualReview) return { outcome: 'review', confidence, reason };

  if (result.valid && confidence >= thresholds.accept) {
    return { outcome: 'accepted', confidence, reason };
  }
  if (!result.valid && confidence >= thresholds.accept) {
    return { outcome: 'rejected', confidence, reason };
  }
  if (confidence <= thresholds.reject) {
    // Poca confianza en cualquier dirección: el modelo no vio bien la imagen.
    // Ante la duda no se castiga al usuario — va a revisión.
    return { outcome: 'review', confidence, reason };
  }
  return { outcome: 'review', confidence, reason };
}
