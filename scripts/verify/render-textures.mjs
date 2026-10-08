/**
 * Rasterises the slab's canvas textures to PNGs so they can be looked at
 * without a browser. Uses @napi-rs/canvas (a prebuilt binding, no toolchain):
 *
 *   npm i --no-save @napi-rs/canvas
 *   node scripts/verify/render-textures.mjs [outDir]
 *
 * Writes card-face, label, tray, back and wear maps for a few cards, plus a
 * flat mock-up of the whole slab face assembled in the right proportions.
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = process.argv[2] || '/tmp/slab-textures';
fs.mkdirSync(outDir, { recursive: true });

// the painters only need document.createElement('canvas')
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? createCanvas(2, 2) : { style: {}, nodeName: String(tag).toUpperCase() }),
  createElementNS: () => createCanvas(2, 2),
};
class NodeImage extends (await import('@napi-rs/canvas')).Image {}
globalThis.Image = NodeImage;
globalThis.HTMLImageElement = NodeImage;
globalThis.window = globalThis.window || { devicePixelRatio: 1 };

const jiti = createJiti(import.meta.url, { moduleCache: false });
const textures = await jiti.import(root + 'src/components/canvas/slab/textures.ts');
const use = await jiti.import(root + 'src/components/canvas/slab/useSlabTextures.ts');
const { slabCards } = await jiti.import(root + 'src/data/slabCards.ts');
const { SLAB_SPEC, slabLayers, trayLayout } = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');

const write = (name, texture) => {
  const file = path.join(outDir, `${name}.png`);
  fs.writeFileSync(file, texture.image.toBuffer('image/png'));
  console.log(`${name.padEnd(22)} ${texture.image.width}x${texture.image.height}  ${file}`);
};

/* ---- one card, with its real art ---- */
const card = slabCards.find((c) => c.back === 'rainbow') ?? slabCards[0];
const art = await loadImage(path.join(root, 'public', card.art.replace(/^\//, '')));
const face = use.getCardFaceTexture(card, art, 'hero');
write('card-face', face);
write('label', use.getLabelTexture(card, false, 'hero'));
write('label-blank', use.getLabelTexture(card, true, 'hero'));
write('card-back-drawn', use.getBackTexture());
write('card-back-branded', await use.ensureBackTexture(card.back));
write('tray', use.getTrayTexture());
const wear = textures.getWearMaps(512);
write('wear-roughness', wear.roughness);

/* ---- a flat mock-up: the slab face assembled at reference proportions ---- */
const W = 664;
const H = Math.round(W / (SLAB_SPEC.w / SLAB_SPEC.h));
const L = slabLayers();
const mock = createCanvas(W, H);
const ctx = mock.getContext('2d');
const px = (v) => v * W; // world x -> px
const py = (v) => H / 2 - (v / SLAB_SPEC.h) * H; // world y -> px

const grad = ctx.createLinearGradient(0, 0, 0, H);
grad.addColorStop(0, '#2c2430');
grad.addColorStop(0.5, '#4F3A49');
grad.addColorStop(1, '#1a1319');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, W, H);

// shell silhouette (same squircle the geometry uses)
const shellPts = textures.clipSquircle;
ctx.save();
shellPts(ctx, W, H, (SLAB_SPEC.radius / SLAB_SPEC.w) * W, SLAB_SPEC.cornerPower);
ctx.fillStyle = 'rgba(150,140,155,0.35)';
ctx.fillRect(0, 0, W, H);
ctx.restore();

// window recess
ctx.save();
ctx.translate(W / 2, py(L.windowY));
shellPts(ctx, px(SLAB_SPEC.windowW), px(SLAB_SPEC.windowH), (SLAB_SPEC.windowRadius / SLAB_SPEC.w) * W, SLAB_SPEC.cornerPower, 4);
ctx.translate(-W / 2, 0);
ctx.drawImage(use.getTrayTexture().image, px(-SLAB_SPEC.windowW / 2), px(-SLAB_SPEC.windowH / 2), px(SLAB_SPEC.windowW), px(SLAB_SPEC.windowH));
ctx.restore();

// card
ctx.save();
ctx.translate(W / 2, py(SLAB_SPEC.cardY));
ctx.drawImage(face.image, px(-SLAB_SPEC.cardW / 2), px(-SLAB_SPEC.cardH / 2), px(SLAB_SPEC.cardW), px(SLAB_SPEC.cardH));
ctx.restore();

// label plate + printed face
ctx.save();
ctx.translate(W / 2, py(L.labelY));
const label = use.getLabelTexture(card, false, 'hero');
ctx.drawImage(label.image, px(-SLAB_SPEC.labelW / 2), px(-SLAB_SPEC.labelH / 2), px(SLAB_SPEC.labelW), px(SLAB_SPEC.labelH));
ctx.restore();

const mockFile = path.join(outDir, 'slab-mockup.png');
fs.writeFileSync(mockFile, mock.toBuffer('image/png'));
console.log(`${'slab-mockup'.padEnd(22)} ${W}x${H}  ${mockFile}`);
console.log('\nreference photo box in the original is 664x1103 - same width, so proportions line up.');
