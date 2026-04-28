// One-off: measure the transparent padding around the artwork in logo.svg.
// Renders the SVG to a high-res PNG, scans pixel-by-pixel to find the
// non-transparent bounding box, and reports the padding in viewBox units.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const svg = readFileSync(resolve(import.meta.dirname, '../public/logo.svg'));

const SIZE = 1200;
const buffer = await sharp(svg)
  .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .raw()
  .toBuffer();

let minX = SIZE;
let minY = SIZE;
let maxX = -1;
let maxY = -1;
const stride = SIZE * 4; // RGBA
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const a = buffer[y * stride + x * 4 + 3];
    if (a > 8) { // ignore near-transparent
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

if (maxX < 0) {
  console.log('No non-transparent pixels found');
  process.exit(0);
}

const w = maxX - minX + 1;
const h = maxY - minY + 1;
const padLeft = minX;
const padRight = SIZE - 1 - maxX;
const padTop = minY;
const padBottom = SIZE - 1 - maxY;

console.log(`SVG renders at ${SIZE}×${SIZE} (matches viewBox 0 0 1200 1200)`);
console.log(`Artwork bbox     : x=${minX} y=${minY} w=${w} h=${h}`);
console.log(`Padding (px)     : left=${padLeft} right=${padRight} top=${padTop} bottom=${padBottom}`);
console.log(`Padding ratio    : left=${(padLeft / SIZE).toFixed(4)} right=${(padRight / SIZE).toFixed(4)} top=${(padTop / SIZE).toFixed(4)} bottom=${(padBottom / SIZE).toFixed(4)}`);
console.log(`Tight viewBox    : ${minX} ${minY} ${w} ${h}`);
