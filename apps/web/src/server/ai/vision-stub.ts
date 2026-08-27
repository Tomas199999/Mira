import type { VisionProvider, VisionRequest, VisionResponse } from '@mira/shared';

/**
 * Proveedor de visión FALSO, sólo para probar el recorrido en local.
 *
 * No mira la foto: acepta cualquier cosa. Existe para poder recorrer el bucle
 * completo sin credenciales de Anthropic, y nada más.
 *
 * Se niega a cargarse fuera de local. Si esto llegara a producción, la
 * validación de fotos sería una mentira, así que el módulo prefiere romper el
 * despliegue antes que funcionar donde no debe.
 */
export class StubVisionProvider implements VisionProvider {
  readonly name = 'stub';
  readonly model = 'stub-no-mira-la-foto';

  constructor() {
    if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error(
        'StubVisionProvider no puede usarse en producción. Es un doble de prueba: acepta cualquier foto.',
      );
    }
  }

  async analyze(request: VisionRequest): Promise<VisionResponse> {
    console.warn(
      `[VISIÓN SIMULADA] aceptando sin mirar la foto (objeto pedido: ${request.expectedObject})`,
    );
    return {
      result: {
        valid: true,
        confidence: 0.99,
        detectedObject: request.expectedObject,
        reason: 'Doble de prueba: no se analizó la imagen.',
        needsManualReview: false,
      },
      metadata: {
        provider: this.name, model: this.model,
        inputTokens: 0, outputTokens: 0, latencyMs: 1,
      },
      raw: { stub: true },
    };
  }
}

/** Moderación falsa: deja pasar todo. Mismas reglas y mismo motivo. */
export class StubModerationProvider {
  readonly name = 'stub';

  constructor() {
    if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
      throw new Error('StubModerationProvider no puede usarse en producción.');
    }
  }

  async check() {
    console.warn('[MODERACIÓN SIMULADA] dejando pasar sin analizar');
    return { allowed: true, safeForHumanReview: true, categories: {}, maxScore: 0 };
  }
}
