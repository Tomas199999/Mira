#!/usr/bin/env node
/**
 * Mira — genera el juego de íconos a partir de geometría.
 *
 * La marca es el iris de un obturador: un disco con una apertura hexagonal y
 * seis cortes tangentes, que es lo que le da el giro. A 40 px se lee el hueco
 * central; a 1024 se leen las láminas.
 *
 * Se genera en vez de guardarse como archivo de diseño para poder rehacerlo en
 * cualquier tamaño, y para que cambiar el color de marca sea cambiar una línea.
 *
 *   node scripts/make-icons.mjs
 */
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/mobile/assets');

const INK = '#0C1112';   // theme.color.background
const MINT = '#3EE0C8';  // theme.color.accent

function shutter({ bg, size = 1024, inset = 0.14, blade = MINT }) {
  const c = size / 2;
  const R = size * (0.5 - inset);
  const r = R * 0.42;                       // apertura central
  const cut = R * 0.055;                    // grosor del corte entre láminas
  const n = 6;
  const gapColor = bg ?? '#000';

  const pt = (rad, ang) => [c + rad * Math.cos(ang), c + rad * Math.sin(ang)];
  const fmt = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;

  const hole = Array.from({ length: n }, (_, i) =>
    fmt(pt(r, (i / n) * Math.PI * 2 - Math.PI / 2))).join(' ');

  let cuts = '';
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const [x0, y0] = pt(r, a);
    const [x1, y1] = pt(R * 1.06, a + 0.62);   // desplazamiento tangencial
    cuts += `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" stroke="${gapColor}" stroke-width="${cut.toFixed(2)}" stroke-linecap="round"/>`;
  }

  // Sin fondo, los cortes tienen que ser transparentes y no de un color: se
  // recortan con una máscara.
  const mask = bg ? '' : `<mask id="m">
      <rect width="${size}" height="${size}" fill="black"/>
      <circle cx="${c}" cy="${c}" r="${R}" fill="white"/>
      <polygon points="${hole}" fill="black"/>
      ${cuts.replaceAll(gapColor, 'black')}
    </mask>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ''}
  ${mask}
  ${bg
    ? `<circle cx="${c}" cy="${c}" r="${R}" fill="${blade}"/>
       <polygon points="${hole}" fill="${bg}"/>
       ${cuts}`
    : `<rect width="${size}" height="${size}" fill="${blade}" mask="url(#m)"/>`}
</svg>`;
}

const files = [
  ['icon.png', shutter({ bg: INK })],
  // Android recorta el frente a un círculo o a una gota: necesita margen.
  ['adaptive-icon.png', shutter({ bg: null, inset: 0.24 })],
  ['splash-icon.png', shutter({ bg: null, inset: 0.06, size: 512 })],
  ['favicon.png', shutter({ bg: INK, size: 64, inset: 0.12 })],
];

for (const [name, svg] of files) {
  await sharp(Buffer.from(svg)).png().toFile(join(OUT, name));
  console.log(`  ✓ ${name}`);
}
