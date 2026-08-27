#!/usr/bin/env node
/**
 * Mira — verificación del procesamiento de imagen y del pipeline de decisión.
 *
 * No llama a ningún modelo: usa dobles de prueba para los proveedores. Lo que
 * comprueba es lo que SÍ es nuestro — que la huella perceptual detecte la misma
 * foto re-exportada, que la moderación corte antes de gastar un token, y que
 * sólo lo ambiguo escale al modelo caro.
 *
 *   npm run verify:pipeline
 */
import sharp from 'sharp';
import { processImage, hashDistance } from '../apps/web/src/server/images/process.ts';
import { runPipeline } from '../apps/web/src/server/ai/pipeline.ts';

const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(n + (ok || !d ? '' : ` — ${d}`));

/** Genera una imagen con formas, para que el dHash tenga estructura que medir. */
async function makeImage({ hue = 200, size = 800, shift = 0 } = {}) {
  const svg = `<svg width="${size}" height="${size}">
    <rect width="100%" height="100%" fill="hsl(${hue},40%,85%)"/>
    <circle cx="${240 + shift}" cy="300" r="150" fill="hsl(${hue},70%,35%)"/>
    <rect x="${420 + shift}" y="420" width="260" height="200" fill="hsl(${(hue + 60) % 360},60%,45%)"/>
    <rect x="90" y="600" width="500" height="70" fill="hsl(${(hue + 180) % 360},50%,25%)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

try {
  const original = await makeImage();
  const a = await processImage(original);

  check('processImage devuelve dimensiones y variantes',
    a.width === 800 && a.height === 800 && a.thumbnail.length > 0 && a.medium.length > 0,
    JSON.stringify({ w: a.width, h: a.height, thumb: a.thumbnail.length }));

  check('la huella perceptual son 64 bits', a.perceptualHash.length === 8);

  // La misma foto re-exportada con otra calidad y otro tamaño: el sha256 cambia,
  // el dHash no debería. Es lo que hace que el dedupe sirva de algo (§8).
  const reexported = await sharp(original).resize(640).jpeg({ quality: 55 }).toBuffer();
  const b = await processImage(reexported);

  check('re-exportar la imagen cambia el sha256',
    !a.sha256.equals(b.sha256));
  const sameDistance = hashDistance(a.perceptualHash, b.perceptualHash);
  check('…pero la huella perceptual la sigue reconociendo',
    sameDistance <= 8, `distancia ${sameDistance} bits`);

  // Una imagen distinta tiene que quedar claramente lejos.
  const other = await makeImage({ hue: 20, shift: 120 });
  const c = await processImage(other);
  const otherDistance = hashDistance(a.perceptualHash, c.perceptualHash);
  check('una imagen distinta queda lejos en la huella',
    otherDistance >= 12, `distancia ${otherDistance} bits`);

  // --- pipeline con dobles de prueba ------------------------------------------
  const challenge = {
    objectName: 'mug', displayName: 'una taza',
    aliases: ['taza', 'mug'], visualCriteria: ['Se ve un recipiente para beber.'],
  };
  const thresholds = { accept: 0.8, reject: 0.4 };

  const stubVision = (name, result) => ({
    name, model: name, calls: 0,
    async analyze() {
      this.calls += 1;
      return {
        result,
        metadata: { provider: name, model: name, inputTokens: 1600, outputTokens: 40, latencyMs: 1 },
        raw: {},
      };
    },
  });
  const allowAll = { name: 'stub', async check() {
    return { allowed: true, safeForHumanReview: true, categories: {}, maxScore: 0 };
  }};

  // Confianza alta y objeto presente → se acepta sin escalar.
  const primaryOk = stubVision('primary', {
    valid: true, confidence: 0.95, detectedObject: 'cup', reason: 'ok', needsManualReview: false,
  });
  const escalationOk = stubVision('escalation', {
    valid: true, confidence: 0.99, detectedObject: 'cup', reason: 'ok', needsManualReview: false,
  });
  const accepted = await runPipeline(a, challenge, {
    primary: primaryOk, escalation: escalationOk, moderation: allowAll,
    thresholds, findDuplicate: async () => null,
  });
  check('con confianza alta se acepta sin escalar',
    accepted.decision.outcome === 'accepted' && escalationOk.calls === 0,
    `${accepted.decision.outcome}, escalados: ${escalationOk.calls}`);

  // Zona ambigua → escala al modelo caro.
  const primaryDoubt = stubVision('primary', {
    valid: true, confidence: 0.6, detectedObject: 'cup', reason: 'unsure', needsManualReview: false,
  });
  const escalationDecides = stubVision('escalation', {
    valid: true, confidence: 0.93, detectedObject: 'cup', reason: 'yes', needsManualReview: false,
  });
  const escalated = await runPipeline(a, challenge, {
    primary: primaryDoubt, escalation: escalationDecides, moderation: allowAll,
    thresholds, findDuplicate: async () => null,
  });
  check('lo ambiguo escala al modelo más capaz y se resuelve',
    escalationDecides.calls === 1 && escalated.decision.outcome === 'accepted',
    `${escalated.decision.outcome}, escalados: ${escalationDecides.calls}`);

  // Duplicado: se corta antes de llamar a ningún modelo.
  const neverCalled = stubVision('primary', {
    valid: true, confidence: 1, detectedObject: 'cup', reason: 'x', needsManualReview: false,
  });
  const dup = await runPipeline(a, challenge, {
    primary: neverCalled, escalation: null, moderation: allowAll,
    thresholds, findDuplicate: async () => 'otra-publicacion',
  });
  check('un duplicado se rechaza sin gastar una llamada al modelo',
    dup.decision.outcome === 'rejected' && neverCalled.calls === 0,
    `${dup.decision.outcome}, llamadas: ${neverCalled.calls}`);

  // Moderación: corta antes de la detección del objeto.
  const notCalledEither = stubVision('primary', {
    valid: true, confidence: 1, detectedObject: 'cup', reason: 'x', needsManualReview: false,
  });
  const blocked = await runPipeline(a, challenge, {
    primary: notCalledEither, escalation: null,
    moderation: { name: 'stub', async check() {
      return { allowed: false, safeForHumanReview: false, categories: { nudity: 0.9 }, maxScore: 0.9 };
    }},
    thresholds, findDuplicate: async () => null,
  });
  check('la moderación corta antes de la detección del objeto',
    blocked.decision.outcome === 'blocked' && notCalledEither.calls === 0,
    `${blocked.decision.outcome}, llamadas: ${notCalledEither.calls}`);
  check('lo bloqueado por menores o desnudez no va a revisión humana',
    blocked.moderation.safeForHumanReview === false);

  // Objeto ausente con confianza alta → rechazo, no revisión.
  const absent = stubVision('primary', {
    valid: false, confidence: 0.93, detectedObject: 'phone', reason: 'no cup', needsManualReview: false,
  });
  const rejected = await runPipeline(a, challenge, {
    primary: absent, escalation: null, moderation: allowAll,
    thresholds, findDuplicate: async () => null,
  });
  check('objeto ausente con confianza alta se rechaza',
    rejected.decision.outcome === 'rejected', rejected.decision.outcome);

  // Confianza muy baja → revisión, nunca rechazo. Ante la duda gana el usuario.
  const clueless = stubVision('primary', {
    valid: false, confidence: 0.2, detectedObject: null, reason: 'blurry', needsManualReview: false,
  });
  const review = await runPipeline(a, challenge, {
    primary: clueless, escalation: null, moderation: allowAll,
    thresholds, findDuplicate: async () => null,
  });
  check('ante poca confianza se manda a revisión, no se rechaza',
    review.decision.outcome === 'review', review.decision.outcome);

  // El doble de prueba tiene que negarse a existir en producción. Si alguna vez
  // se colara, la validación de fotos sería una mentira.
  const { StubVisionProvider } = await import('../apps/web/src/server/ai/vision-stub.ts');
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let refused = false;
  try { new StubVisionProvider(); } catch { refused = true; }
  process.env.NODE_ENV = previous;
  check('el proveedor de visión simulado se niega a cargarse en producción', refused);

} catch (err) {
  fail.push(`la verificación se cortó: ${err.message}`);
  console.error(err.stack);
}

console.log('\n' + '─'.repeat(64));
for (const p of pass) console.log(`  ✓ ${p}`);
for (const f of fail) console.log(`  ✗ ${f}`);
console.log('─'.repeat(64));
console.log(`${pass.length} pasaron, ${fail.length} fallaron\n`);
process.exit(fail.length ? 1 : 0);
