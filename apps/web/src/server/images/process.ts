import sharp from 'sharp';
import { createHash } from 'node:crypto';

/**
 * Validación, variantes y huellas de la imagen.
 *
 * Todo esto corre ANTES de llamar a un modelo, que es el paso caro: formato
 * inválido, imagen minúscula o duplicado exacto se descartan sin gastar un
 * token (§48).
 */

export interface ProcessedImage {
  /** Huella exacta: detecta el mismo archivo subido de nuevo. */
  sha256: Buffer;
  /**
   * Huella perceptual (dHash de 64 bits). Sobrevive a recortes suaves,
   * recompresión y cambios de tamaño, así que detecta la misma foto
   * re-exportada, cosa que el sha256 no ve.
   */
  perceptualHash: Buffer;
  width: number;
  height: number;
  bytes: number;
  /** Imagen normalizada que se le manda al modelo. */
  analysisBase64: string;
  analysisMediaType: 'image/jpeg';
  thumbnail: Buffer;
  medium: Buffer;
}

const MIN_DIMENSION = 320;
const MAX_BYTES = 10 * 1024 * 1024;

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.byteLength > MAX_BYTES) throw new Error('image_invalid: too large');
  if (input.byteLength < 1024) throw new Error('image_invalid: too small');

  const image = sharp(input, { failOn: 'error' });
  const meta = await image.metadata();

  if (!meta.width || !meta.height) throw new Error('image_invalid: undecodable');
  if (meta.width < MIN_DIMENSION || meta.height < MIN_DIMENSION) {
    throw new Error('image_invalid: dimensions too small');
  }

  // Al modelo se le manda una versión acotada: más allá de ~1024px no mejora la
  // detección y sí encarece la llamada.
  const analysis = await sharp(input)
    .rotate()                       // respeta la orientación EXIF antes de descartarla
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const [thumbnail, medium] = await Promise.all([
    sharp(input).rotate().resize(320, 320, { fit: 'cover' }).webp({ quality: 72 }).toBuffer(),
    sharp(input).rotate().resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 }).toBuffer(),
  ]);

  return {
    sha256: createHash('sha256').update(input).digest(),
    perceptualHash: await differenceHash(input),
    width: meta.width,
    height: meta.height,
    bytes: input.byteLength,
    analysisBase64: analysis.toString('base64'),
    analysisMediaType: 'image/jpeg',
    thumbnail,
    medium,
  };
}

/**
 * dHash: se reduce la imagen a 9×8 en escala de grises y se compara cada píxel
 * con el de su derecha. El resultado son 64 bits que describen la estructura de
 * la imagen, no sus píxeles exactos, así que dos exportaciones distintas de la
 * misma foto dan el mismo hash o uno muy cercano.
 */
async function differenceHash(input: Buffer): Promise<Buffer> {
  const pixels = await sharp(input)
    .rotate()
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();

  const bits = Buffer.alloc(8);
  for (let row = 0; row < 8; row += 1) {
    let byte = 0;
    for (let col = 0; col < 8; col += 1) {
      const left = pixels[row * 9 + col] ?? 0;
      const right = pixels[row * 9 + col + 1] ?? 0;
      byte = (byte << 1) | (left > right ? 1 : 0);
    }
    bits[row] = byte;
  }
  return bits;
}

/** Distancia de Hamming entre dos dHash. Menos de ~10 bits es "la misma foto". */
export function hashDistance(a: Buffer, b: Buffer): number {
  let distance = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    let xor = (a[i] ?? 0) ^ (b[i] ?? 0);
    while (xor) { distance += xor & 1; xor >>= 1; }
  }
  return distance;
}
