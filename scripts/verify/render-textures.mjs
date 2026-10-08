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
const geometry = await jiti.import(root + 'src/components/canvas/slab/geometry.ts');
const { Path2D } = await import('@napi-rs/canvas');

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

/* ---- window mock-up: what you see through the window, orthographic ---- */
const WN = 420;
const HN = Math.round((WN * SLAB_SPEC.windowH) / SLAB_SPEC.windowW);
const win = createCanvas(WN, HN);
const wctx = win.getContext('2d');
const wx = (v) => WN / 2 + (v / SLAB_SPEC.windowW) * WN;
const wy = (v) => HN / 2 - ((v - L.windowY) / SLAB_SPEC.windowH) * HN;
wctx.fillStyle = '#0b0b0e';
wctx.fillRect(0, 0, WN, HN);
// tray plate, with the card cutout as a hole
const plateShape = geometry.squircle(WN, HN, (SLAB_SPEC.windowRadius / SLAB_SPEC.windowW) * WN, SLAB_SPEC.cornerPower, 24);
const platePath = new Path2D();
plateShape.getPoints().forEach((p, i) => {
  const x = WN / 2 + p.x;
  const y = HN / 2 - p.y;
  if (i === 0) platePath.moveTo(x, y);
  else platePath.lineTo(x, y);
});
platePath.closePath();
const cutW = (L.trayW / SLAB_SPEC.windowW) * WN;
const cutH = (L.trayH / SLAB_SPEC.windowH) * HN;
const cutShape = geometry.squircle(cutW, cutH, (L.trayRadius / SLAB_SPEC.windowW) * WN, SLAB_SPEC.cornerPower, 24);
platePath.moveTo(wx(0) + cutShape.getPoints()[0].x, wy(SLAB_SPEC.cardY) - cutShape.getPoints()[0].y);
cutShape.getPoints().slice(1).forEach((p) => platePath.lineTo(wx(0) + p.x, wy(SLAB_SPEC.cardY) - p.y));
platePath.closePath();
wctx.save();
wctx.clip(platePath, 'evenodd');
wctx.drawImage(use.getTrayTexture().image, 0, 0, WN, HN);
wctx.restore();
// the card, sitting in its cutout
wctx.drawImage(
  face.image,
  wx(0) - (SLAB_SPEC.cardW / SLAB_SPEC.windowW) * (WN / 2),
  wy(SLAB_SPEC.cardY) - (SLAB_SPEC.cardH / SLAB_SPEC.windowH) * (HN / 2),
  (SLAB_SPEC.cardW / SLAB_SPEC.windowW) * WN,
  (SLAB_SPEC.cardH / SLAB_SPEC.windowH) * HN
);
// and the retaining wells, in front of the tray as the meshes are
for (const slot of trayLayout().slots) {
  wctx.fillStyle = 'rgba(0,0,0,0.6)';
  wctx.fillRect(slot.x * WN, slot.y * HN, slot.w * WN, slot.h * HN);
  wctx.fillStyle = 'rgba(200,210,224,0.35)';
  wctx.fillRect(slot.x * WN + slot.w * WN * 0.5, slot.y * HN + 1, Math.max(1, slot.w * WN * 0.32), slot.h * HN - 2);
}
const winFile = path.join(outDir, 'window-mockup.png');
fs.writeFileSync(winFile, win.toBuffer('image/png'));
console.log(`${'window-mockup'.padEnd(22)} ${WN}x${HN}  ${winFile}`);

const mockFile = path.join(outDir, 'slab-mockup.png');
fs.writeFileSync(mockFile, mock.toBuffer('image/png'));
console.log(`${'slab-mockup'.padEnd(22)} ${W}x${H}  ${mockFile}`);
console.log('\nreference photo box in the original is 664x1103 - same width, so proportions line up.');
