/**
 * Side-by-side parity sheet: the reference photo's card / label / case regions
 * against the repo's own painted textures at the same pixel size, so layout
 * drift is visible without a browser.
 *
 *   node scripts/analysis/_parity_sheet.mjs [out.png]
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.argv[2] ?? '/home/user/.scratch/parity_sheet.png';

globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? createCanvas(2, 2) : { style: {}, nodeName: String(tag).toUpperCase() }),
  createElementNS: () => createCanvas(2, 2),
};
class NodeImage extends (await import('@napi-rs/canvas')).Image {}
globalThis.Image = NodeImage;
globalThis.HTMLImageElement = NodeImage;
globalThis.window = globalThis.window || { devicePixelRatio: 1 };

const jiti = createJiti(import.meta.url, { moduleCache: false });
const use = await jiti.import(root + 'src/components/canvas/slab/useSlabTextures.ts');
const { slabCards } = await jiti.import(root + 'src/data/slabCards.ts');

const card = slabCards.find((c) => c.art === '/cards/Gjw0CRRXoAMjU8i.jpg') ?? slabCards[0];
const refCard = { ...card, id: 'reference', title: 'GHOST LAB #7389', serial: '7389/8900', handle: '@jeremyRysnyder' };
const art = await loadImage(path.join(root, 'public/cards/Gjw0CRRXoAMjU8i.jpg'));
const logo = await loadImage(path.join(root, 'public/logo-reference.png'));
const face = use.getCardFaceTexture(refCard, art, 'hero');
const label = use.getLabelTexture(refCard, false, 'hero', logo);
const facemap = use.getFaceMapTexture();
const tray = use.getTrayTexture();

const buf = (t) => t.image.toBuffer('image/png');
fs.mkdirSync('/home/user/.scratch', { recursive: true });

// reference regions (photo px)
const CARD = { left: 500, top: 508, width: 491, height: 697 };
const LABEL = { left: 452, top: 227, width: 584, height: 152 };
const CASE = { left: 412, top: 187, width: 665, height: 1116 };

const refCardPng = await sharp(path.join(root, 'public/reference.jpg')).extract(CARD).png().toBuffer();
const refLabelPng = await sharp(path.join(root, 'public/reference.jpg')).extract(LABEL).png().toBuffer();
const refCasePng = await sharp(path.join(root, 'public/reference.jpg')).extract(CASE).resize({ width: 400 }).png().toBuffer();

const facePng = await sharp(buf(face)).resize(CARD.width, CARD.height).png().toBuffer();
const labelPng = await sharp(buf(label)).resize(LABEL.width, LABEL.height).png().toBuffer();
const facemapPng = await sharp(buf(facemap)).resize({ width: 400 }).png().toBuffer();
const trayPng = await sharp(buf(tray)).resize({ width: 300 }).png().toBuffer();

const PAD = 20;
const rowH = CARD.height + PAD;
const W = PAD * 3 + CARD.width * 2 + 420;
const H = PAD * 4 + rowH + LABEL.height + 40 + Math.max(700, 673) + 40;

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0b0b0d"/>
  <text x="${PAD}" y="${PAD - 6}" fill="#f5f3ef" font-family="monospace" font-size="13">reference card 491x697</text>
  <text x="${PAD * 2 + CARD.width}" y="${PAD - 6}" fill="#f5f3ef" font-family="monospace" font-size="13">painted face texture</text>
  <text x="${PAD}" y="${rowH + PAD + 8}" fill="#f5f3ef" font-family="monospace" font-size="13">reference label 584x152</text>
  <text x="${PAD * 2 + CARD.width}" y="${rowH + PAD + 8}" fill="#f5f3ef" font-family="monospace" font-size="13">painted label</text>
  <text x="${PAD}" y="${rowH + LABEL.height + PAD * 2 + 22}" fill="#f5f3ef" font-family="monospace" font-size="13">reference case</text>
  <text x="${PAD * 2 + 400}" y="${rowH + LABEL.height + PAD * 2 + 22}" fill="#f5f3ef" font-family="monospace" font-size="13">face map (case UV)</text>
  <text x="${PAD * 3 + 400 + 400}" y="${rowH + LABEL.height + PAD * 2 + 22}" fill="#f5f3ef" font-family="monospace" font-size="13">tray</text>
</svg>`;

await sharp(Buffer.from(svg))
  .composite([
    { input: refCardPng, left: PAD, top: PAD },
    { input: facePng, left: PAD * 2 + CARD.width, top: PAD },
    { input: refLabelPng, left: PAD, top: rowH + PAD + 14 },
    { input: labelPng, left: PAD * 2 + CARD.width, top: rowH + PAD + 14 },
    { input: refCasePng, left: PAD, top: rowH + LABEL.height + PAD * 2 + 28 },
    { input: facemapPng, left: PAD * 2 + 400, top: rowH + LABEL.height + PAD * 2 + 28 },
    { input: trayPng, left: PAD * 3 + 800, top: rowH + LABEL.height + PAD * 2 + 28 },
  ])
  .png()
  .toFile(out);
console.log('wrote', out);
