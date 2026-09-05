#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (name) => join(root, name);

const ICON = 0.72;
const TAB  = 0.82;
const SAFE = 0.58;

const SLOPE = 3 / 11;
const PITCH = 242.5;
const WIDTH = 176;
const LIFT  = { x: 10, y: 8 };

const MID_Y = 512;
const BARS = [
  { cx: 0 * PITCH, half: 264, tone: 'Blk' },
  { cx: 1 * PITCH, half: 330, tone: 'Red' },
  { cx: 2 * PITCH, half: 330, tone: 'Blk' },
  { cx: 3 * PITCH, half: 264, tone: 'Red' },
];

const ends = (b) => ({
  x1: b.cx + SLOPE * b.half, y1: MID_Y - b.half,
  x2: b.cx - SLOPE * b.half, y2: MID_Y + b.half,
});

const inked = (() => {
  const r = WIDTH / 2;
  const xs = BARS.flatMap((b) => { const e = ends(b); return [e.x1, e.x2]; });
  const ys = BARS.flatMap((b) => { const e = ends(b); return [e.y1, e.y2]; });
  const minX = Math.min(...xs) - r,  maxX = Math.max(...xs) + r + LIFT.x;
  const minY = Math.min(...ys) - r,  maxY = Math.max(...ys) + r + LIFT.y;
  return {
    minX, maxX, minY, maxY,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    radius: Math.hypot((maxX - minX) / 2, (maxY - minY) / 2),
  };
})();
const CX = inked.cx;
const CY = inked.cy;

if (SAFE * inked.radius > 409.6) {
  throw new Error(`SAFE ${SAFE} puts the mark ${(SAFE * inked.radius).toFixed(1)} units ` +
    `from centre; the maskable safe circle is 409.6. Lower SAFE to ` +
    `${(409.6 / inked.radius).toFixed(3)} or less.`);
}

const TONES = {
  Red: { face: [[0, '#ff4d3f'], [0.35, '#ee1111'], [0.72, '#cc0000'],
                [1, '#8e0000']],
         side: [[0, '#7a0000'], [1, '#340000']],
         gloss: 0.18 },
  Blk: { face: [[0, '#4a4a4a'], [0.35, '#242424'], [0.72, '#111111'],
                [1, '#050505']],
         side: [[0, '#171717'], [1, '#000000']],
         gloss: 0.1 },
};

const stops = (list) =>
  list.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');

const n = (v) => String(Math.round(v * 100) / 100);

const GLOSS_RUN = 0.3;
const defs = BARS.map((b, i) => {
  const e = ends(b);
  const t = TONES[b.tone];
  return `
    <linearGradient id="dzFace${i}" gradientUnits="userSpaceOnUse" x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}">
      ${stops(t.face)}
    </linearGradient>
    <linearGradient id="dzSide${i}" gradientUnits="userSpaceOnUse" x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}">
      ${stops(t.side)}
    </linearGradient>
    <linearGradient id="dzGloss${i}" gradientUnits="userSpaceOnUse" x1="0" y1="${n(e.y1)}" x2="0" y2="${n(e.y1 + (e.y2 - e.y1) * GLOSS_RUN)}">
      <stop offset="0" stop-color="#ffffff" stop-opacity="${t.gloss}"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>`;
}).join('');

const BLUR = 13;
const CAST = { x: 7, y: 12 };
const region = (() => {
  const pad = BLUR * 3;
  const x = Math.floor(inked.minX - pad);
  const y = Math.floor(inked.minY - pad);
  return {
    x, y,
    w: Math.ceil(inked.maxX + CAST.x + pad - x),
    h: Math.ceil(inked.maxY + CAST.y + pad - y),
  };
})();
const shadow = `
    <filter id="dzShadow" filterUnits="userSpaceOnUse" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" color-interpolation-filters="sRGB">
      <feOffset in="SourceAlpha" dx="${CAST.x}" dy="${CAST.y}" result="dzOff"/>
      <feGaussianBlur in="dzOff" stdDeviation="${BLUR}" result="dzBlur"/>
      <feFlood flood-color="#000000" flood-opacity="0.2" result="dzInk"/>
      <feComposite in="dzInk" in2="dzBlur" operator="in" result="dzCast"/>
      <feMerge><feMergeNode in="dzCast"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;

const bars = BARS.map((b, i) => {
  const e = ends(b);
  return `
    <line x1="${n(e.x1 + LIFT.x)}" y1="${n(e.y1 + LIFT.y)}" x2="${n(e.x2 + LIFT.x)}" y2="${n(e.y2 + LIFT.y)}" stroke="url(#dzSide${i})" stroke-width="${WIDTH}"/>
    <line x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}" stroke="url(#dzFace${i})" stroke-width="${WIDTH}"/>
    <line x1="${n(e.x1)}" y1="${n(e.y1)}" x2="${n(e.x2)}" y2="${n(e.y2)}" stroke="url(#dzGloss${i})" stroke-width="${WIDTH}"/>`;
}).join('');

function svg({ size = 1024, scale = ICON, ground = 'square', shadowed = true, title }) {
  const half = size / 2;
  const bg =
    ground === 'none' ? ''
    : `<rect x="0" y="0" width="${size}" height="${size}" fill="#ffffff"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${title}" shape-rendering="geometricPrecision">
  <title>${title}</title>
  <defs>${defs}${shadowed ? shadow : ''}
  </defs>
  ${bg}
  <g transform="translate(${half},${half}) scale(${scale}) translate(${n(-CX)},${n(-CY)})"${shadowed ? ' filter="url(#dzShadow)"' : ''} stroke-linecap="round">${bars}
  </g>
</svg>
`;
}

const logoSvg = svg({ scale: ICON, ground: 'none', title: 'DigiArtz' });
const iconSvg = svg({ scale: ICON, title: 'DigiArtz' });
const tabSvg = svg({ scale: TAB, shadowed: false, title: 'DigiArtz' });
const maskSvg = svg({ scale: SAFE, title: 'DigiArtz' });

writeFileSync(out('logo.svg'), logoSvg);
writeFileSync(out('favicon.svg'), tabSvg);

const render = (source, px) =>
  sharp(Buffer.from(source), { density: Math.max(1, Math.round((96 * px) / 1024)) })
    .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false });

const flat = (source, px) => render(source, px).flatten({ background: '#ffffff' });

await flat(iconSvg, 192).toFile(out('icon-192.png'));
await flat(iconSvg, 512).toFile(out('icon-512.png'));
await flat(iconSvg, 180).toFile(out('apple-touch-icon.png'));
await flat(maskSvg, 512).toFile(out('icon-maskable-512.png'));

const ICO_SIZES = [16, 32, 48, 64, 128];
const frames = await Promise.all(
  ICO_SIZES.map((px) => flat(tabSvg, px).toBuffer())
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);

const dir = Buffer.alloc(16 * frames.length);
let offset = header.length + dir.length;
frames.forEach((png, i) => {
  const at = i * 16;
  dir.writeUInt8(ICO_SIZES[i] >= 256 ? 0 : ICO_SIZES[i], at);
  dir.writeUInt8(ICO_SIZES[i] >= 256 ? 0 : ICO_SIZES[i], at + 1);
  dir.writeUInt8(0, at + 2);
  dir.writeUInt8(0, at + 3);
  dir.writeUInt16LE(1, at + 4);
  dir.writeUInt16LE(32, at + 6);
  dir.writeUInt32LE(png.length, at + 8);
  dir.writeUInt32LE(offset, at + 12);
  offset += png.length;
});

writeFileSync(out('favicon.ico'), Buffer.concat([header, dir, ...frames]));

console.log('logo.svg, favicon.svg, favicon.ico (%s), icon-192, icon-512, icon-maskable-512, apple-touch-icon',
  ICO_SIZES.join('/'));
