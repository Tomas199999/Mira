import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { VisionProvider, VisionRequest, VisionResponse } from '@mira/shared';

/**
 * Proveedor de visión sobre Claude.
 *
 * Implementa la interfaz `VisionProvider` de @mira/shared: el pipeline nunca
 * habla con este SDK directamente, así que cambiar de proveedor es escribir
 * otro archivo, no tocar la lógica (§2).
 */

const VerdictSchema = z.object({
  valid: z.boolean()
    .describe('True if the requested object is genuinely visible in the photo.'),
  confidence: z.number().min(0).max(1)
    .describe('How certain you are about the verdict, from 0 to 1.'),
  detected_object: z.string()
    .describe('The most prominent object you actually see, in English.'),
  reason: z.string()
    .describe('One short sentence explaining the verdict.'),
  needs_manual_review: z.boolean()
    .describe('True when the image is ambiguous, damaged, or you cannot decide.'),
  looks_like_a_screen: z.boolean()
    .describe('True if this appears to be a photo of a screen, monitor or printed picture rather than a real scene.'),
});

/**
 * El prompt es deliberadamente permisivo con el usuario honesto y estricto con
 * la trampa. Un falso negativo le rompe a alguien una racha de sesenta días;
 * un falso positivo deja pasar una foto de más. La asimetría es intencional
 * (ver docs/AI.md § Falsos negativos).
 */
const SYSTEM = `You verify photos for a daily photo challenge.

The user was asked to photograph a specific everyday object. Decide whether that
object is genuinely present in the photo.

Rules:
- Judge against the provided visual criteria, not against the exact wording of
  the object's name. Synonyms and regional variants count.
- The object does not need to be centred, well lit, or the only thing visible.
  A cluttered, dark or badly framed photo still counts if the object is there.
- Be generous with honest attempts and strict about absence. If the object is
  simply not in the frame, say so plainly.
- If you genuinely cannot tell, set needs_manual_review to true rather than
  guessing. A wrong rejection costs a real person their streak.
- Flag looks_like_a_screen when the image shows a monitor, phone screen or a
  printed photograph instead of a real scene.

Answer only through the structured output.`;

export class ClaudeVisionProvider implements VisionProvider {
  readonly name = 'anthropic';

  constructor(
    readonly model: string,
    private readonly client: Anthropic = new Anthropic(),
  ) {}

  async analyze(request: VisionRequest): Promise<VisionResponse> {
    const started = Date.now();

    const criteria = request.visualCriteria.map((c) => `- ${c}`).join('\n');
    const aliases = request.aliases.length ? request.aliases.join(', ') : request.expectedObject;

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: request.imageMediaType,
                data: request.imageBase64,
              },
            },
            {
              type: 'text',
              text: [
                `Requested object: ${request.expectedObject} (${request.expectedObjectDisplayName})`,
                `Also acceptable: ${aliases}`,
                '',
                'Visual criteria:',
                criteria,
              ].join('\n'),
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(VerdictSchema) },
    });

    const parsed = response.parsed_output;
    const latencyMs = Date.now() - started;

    if (!parsed) {
      // Sin veredicto estructurado no se inventa uno: se manda a revisión.
      return {
        result: {
          valid: false,
          confidence: 0,
          detectedObject: null,
          reason: 'The model did not return a structured verdict.',
          needsManualReview: true,
        },
        metadata: {
          provider: this.name, model: this.model,
          inputTokens: response.usage?.input_tokens ?? null,
          outputTokens: response.usage?.output_tokens ?? null,
          latencyMs,
        },
        raw: response,
      };
    }

    // Una foto de una pantalla se manda a revisión aunque el objeto se vea:
    // es la señal más barata contra fotografiar la foto de otro (§8).
    const needsReview = parsed.needs_manual_review || parsed.looks_like_a_screen;

    return {
      result: {
        valid: parsed.valid,
        confidence: parsed.confidence,
        detectedObject: parsed.detected_object,
        reason: parsed.reason,
        needsManualReview: needsReview,
      },
      metadata: {
        provider: this.name, model: this.model,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        latencyMs,
      },
      raw: response,
    };
  }
}
