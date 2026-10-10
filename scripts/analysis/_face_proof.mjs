import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
globalThis.document = { createElement: (t) => (t === 'canvas' ? createCanvas(2,2) : { style:{}, nodeName: t.toUpperCase() }), createElementNS: () => createCanvas(2,2) };
globalThis.Image = (await import('@napi-rs/canvas')).Image;
globalThis.HTMLImageElement = globalThis.Image;
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.argv[2] || '/tmp/face-proof.png';
const jiti = createJiti(import.meta.url, { moduleCache: false });
const P = await jiti.import(root + 'src/lib/palette.ts');
const S = await jiti.import(root + 'src/components/canvas/slab/slabPalette.ts');
const T = await jiti.import(root + 'src/components/canvas/slab/textures.ts');
const U = await jiti.import(root + 'src/components/canvas/slab/useSlabTextures.ts');
const { slabCards } = await jiti.import(root + 'src/data/slabCards.ts');

const picks = [
  ['dark: blue doodle', '003'],
  ['mid: red azuki', '002'],
  ['light: pastel ape', '001'],
  ['light: tan punk', '040'],
];
const W = 460, FH = Math.round(W * 1.0475 / 0.7383);
const sheet = createCanvas(picks.length * (W + 16) + 16, FH + 32);
const sx = sheet.getContext('2d');
sx.fillStyle = '#101013'; sx.fillRect(0, 0, sheet.width, sheet.height);
let x = 16;
for (const [label, id] of picks) {
  const card = slabCards.find((c) => c.id === id);
  const art = await loadImage(path.join(root, 'public', card.art.replace(/^\//, '')));
  const w = 112, h = Math.max(8, Math.round((art.height / art.width) * w));
  const cv = createCanvas(w, h); const c2 = cv.getContext('2d');
  c2.drawImage(art, 0, 0, w, h);
  const sample = P.sampleArtwork(c2.getImageData(0, 0, w, h).data, w, h, 4);
  const pal = S.deriveSlabPalette(sample, P.deriveAnchors(sample));
  const face = createCanvas(W, FH);
  const o = U.cardFaceText(card, W, pal);
  T.drawCardFace(face.getContext('2d'), o, art, T.innerArtBox(o));
  sx.drawImage(face, x, 24);
  sx.fillStyle = '#F5F3EF'; sx.font = '11px monospace';
  sx.fillText(`${label}  artL ${sample.meanL.toFixed(2)}  ink ${pal.ink}  paper L ${P.hexToLch(pal.field).L.toFixed(2)}`, x, 16);
  x += W + 16;
}
fs.writeFileSync(out, sheet.toBuffer('image/png'));
console.log(out);
