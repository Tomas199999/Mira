import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import type { ModerationCategory, ModerationProvider, ModerationResult } from '@mira/shared';

/**
 * Moderación de contenido, primera línea.
 *
 * LIMITACIÓN IMPORTANTE, no un detalle: un modelo de lenguaje NO puede hacer
 * hash-matching contra bases conocidas de material de abuso infantil. Esto
 * filtra lo que se ve en la imagen; no reemplaza a un proveedor especializado,
 * que hay que contratar antes de abrir el registro al público.
 * Ver docs/SECURITY.md § Moderación.
 */

const ScoreSchema = z.object({
  nudity: z.number().min(0).max(1),
  sexual: z.number().min(0).max(1),
  minor_safety: z.number().min(0).max(1)
    .describe('Risk that this image involves a minor in an unsafe or sexualised way.'),
  violence: z.number().min(0).max(1),
  gore: z.number().min(0).max(1),
  weapons: z.number().min(0).max(1),
  drugs: z.number().min(0).max(1),
  hate_symbols: z.number().min(0).max(1),
  self_harm: z.number().min(0).max(1),
  illegal: z.number().min(0).max(1),
  summary: z.string().describe('One short sentence about anything concerning.'),
});

const SYSTEM = `You are a content safety classifier for a photo app used by people
aged 13 and over.

Score each category from 0 (clearly absent) to 1 (clearly present). Most photos
of everyday objects score near 0 everywhere — do not inflate scores for ordinary
household scenes. A kitchen knife on a counter is not "weapons"; a glass of wine
is not "drugs".

Be decisive about genuine harm. Answer only through the structured output.`;

/** Por encima de esto se bloquea la publicación. */
const BLOCK_AT: Record<ModerationCategory, number> = {
  nudity: 0.6, sexual: 0.5, minor_safety: 0.25, violence: 0.75, gore: 0.6,
  weapons: 0.85, drugs: 0.85, hate_symbols: 0.5, self_harm: 0.4, illegal: 0.6,
};

/**
 * Categorías que, si saltan, hacen que la imagen NO pueda llegar a un revisor
 * humano. En una app con menores, una cola de revisión sin este filtro expone
 * al equipo a contenido que no debe ver.
 */
const NEVER_SHOW_A_HUMAN: ModerationCategory[] = ['minor_safety', 'nudity', 'sexual'];

export class ClaudeModerationProvider implements ModerationProvider {
  readonly name = 'anthropic';

  constructor(
    private readonly model: string,
    private readonly client: Anthropic = new Anthropic(),
  ) {}

  async check(imageBase64: string, mediaType: string): Promise<ModerationResult> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 512,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp',
              data: imageBase64,
            },
          },
          { type: 'text', text: 'Score this image.' },
        ],
      }],
      output_config: { format: zodOutputFormat(ScoreSchema) },
    });

    const parsed = response.parsed_output;

    // Sin puntajes no se asume que la imagen es segura: se bloquea y se revisa.
    if (!parsed) {
      return {
        allowed: false, safeForHumanReview: true,
        categories: {}, maxScore: 1,
      };
    }

    const categories = Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => typeof v === 'number'),
    ) as Partial<Record<ModerationCategory, number>>;

    const blocked = (Object.keys(BLOCK_AT) as ModerationCategory[])
      .filter((key) => (categories[key] ?? 0) >= BLOCK_AT[key]);

    const unsafeForHumans = NEVER_SHOW_A_HUMAN.some(
      (key) => (categories[key] ?? 0) >= BLOCK_AT[key],
    );

    return {
      allowed: blocked.length === 0,
      safeForHumanReview: !unsafeForHumans,
      categories,
      maxScore: Math.max(0, ...Object.values(categories)),
    };
  }
}
