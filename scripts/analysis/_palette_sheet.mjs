/**
 * Contact sheet for the dynamic palette: one row per artwork — the art, its
 * derived environmental family and the tonal hierarchy the slab is painted
 * with, plus the shader's linear stops as sRGB chips.
 *
 *   npm i --no-save @napi-rs/canvas
 *   node scripts/analysis/_palette_sheet.mjs [out.png]
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.argv[2] || '/tmp/palette-sheet.png';

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? createCanvas(2, 2) : { style: {}, nodeName: String(tag).toUpperCase() }),
  createElementNS: () => createCanvas(2, 2),
};
globalThis.Image = (await import('@napi-rs/canvas')).Image;
globalThis.HTMLImageElement = globalThis.Image;
globalThis.window = globalThis.window || { devicePixelRatio: 1 };

const jiti = createJiti(import.meta.url, { moduleCache: false });
const P = await jiti.import(root + 'src/lib/palette.ts');
const S = await jiti.import(root + 'src/components/canvas/slab/slabPalette.ts');

const ARTS = [
  ['reference (measured)', 'public/cards/Gjw0CRRXoAMjU8i.jpg'],
  ['red azuki', 'public/cards/Gfq0PT6W8AEZ1qU.jpg'],
  ['green pudgy', 'public/cards/card_26.jpg'],
  ['tan punk', 'public/cards/card_30.jpg'],
  ['blue doodle', 'public/cards/IMG_20261007_124052.jpg'],
  ['pastel ape', 'public/cards/Gpo4KaoWUAAhtXw.jpg'],
  ['violet clone', 'public/cards/card_07.jpg'],
  ['grey captainz', 'public/cards/card_29.jpg'],
];

const TH = 84;            // art thumb height
const ROW = 132;          // row height
const W = 1180;
const H = ARTS.length * ROW + 46;
const sheet = createCanvas(W, H);
const ctx = sheet.getContext('2d');
ctx.fillStyle = '#0b0b0d';
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = '#F5F3EF';
ctx.font = '600 15px monospace';
ctx.fillText('dynamic palette — artwork atmosphere -> tonal hierarchy (void dark/glow/pale | scene | field/ink | face mid/top | tray | plate | shell | foil B/C/D + ice + gold)', 14, 26);

const chip = (x, y, w, h, hex, label) => {
  ctx.fillStyle = hex;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (label) {
    ctx.fillStyle = 'rgba(245,243,239,0.55)';
    ctx.font = '9px monospace';
    ctx.fillText(label, x + 3, y + h + 11);
  }
};

let y = 46;
for (const [label, rel] of ARTS) {
  const img = await loadImage(path.join(root, rel));
  const w = 112;
  const h = Math.max(8, Math.round((img.height / img.width) * w));
  const cv = createCanvas(w, h);
  const c2 = cv.getContext('2d');
  c2.drawImage(img, 0, 0, w, h);
  const sample = P.sampleArtwork(c2.getImageData(0, 0, w, h).data, w, h, 4);
  const pal = S.deriveSlabPalette(sample, P.deriveAnchors(sample));

  // thumb
  const k = Math.min(TH / h, TH / w);
  ctx.drawImage(cv, 14, y + (ROW - 24) / 2 - (h * k) / 2, w * k, h * k);

  ctx.fillStyle = '#F5F3EF';
  ctx.font = '600 12px monospace';
  ctx.fillText(label, 128, y + 22);
  ctx.fillStyle = 'rgba(245,243,239,0.5)';
  ctx.font = '10px monospace';
  ctx.fillText(
    `${pal.mood}  hue ${pal.hue.toFixed(0)}°  C ${pal.chroma.toFixed(3)}  artL ${sample.meanL.toFixed(2)}  sd ${sample.sdL.toFixed(2)}`,
    128,
    y + 38
  );

  const x0 = 128;
  const cw = 62;
  const ch = 30;
  const cy = y + 52;
  const groups = [
    [pal.voidDark, 'void dark'],
    [pal.voidGlow, 'void glow'],
    [pal.voidPale, 'void pale'],
    [pal.sceneBg, 'scene bg'],
    [pal.field, 'card field'],
    [pal.ink, 'ink'],
    [pal.faceMid, 'face mid'],
    [pal.faceTop, 'face top'],
    [pal.tray, 'tray'],
    [pal.plate, 'plate'],
    [pal.glassBody, 'shell'],
  ];
  groups.forEach(([hex, lab], i) => chip(x0 + i * (cw + 4), cy, cw, ch, hex, lab));
  // shader stops are LINEAR: show them through the sRGB transfer
  const lin = (t) => S.linearTripleToHex(pal.shader[t]);
  [['foilB', 'foil B'], ['foilC', 'foil C'], ['foilD', 'foil D'], ['ice', 'ice'], ['goldA', 'gold']].forEach(([t, lab], i) =>
    chip(x0 + (groups.length + i) * (cw + 4), cy, cw, ch, lin(t), lab)
  );
  y += ROW;
}

fs.writeFileSync(out, sheet.toBuffer('image/png'));
console.log(out);
