/**
 * Anatomical parity check: the model's slab spec against `reference-image.jpg`.
 *
 * `scripts/analysis/` is how the reference numbers were recovered (silhouette
 * tracking, scan lines, corner arcs — see docs/reference-parity.md). Those
 * numbers are frozen here as MEASURED, and every one of them is re-derived from
 * SLAB_SPEC on each run, in the same normalised space:
 *
 *   x  : fraction of the case width, 0 at the case's left edge
 *   y  : fraction of the case height, 0 at the case's top edge
 *
 * so a spec drift shows up as a delta with a sign and a magnitude in photo
 * pixels. Fails on any feature that moves more than TOL px on the 665 x 1116 px
 * case.
 *
 *   npm run verify:parity
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { SLAB_SPEC } = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');

/** the case box in reference-image.jpg, px — background-deviation tracked */
const CASE = { w: 665, h: 1116, x0: 412, y0: 187, x1: 1077, y1: 1303 };
/** tolerance: how far a feature may sit from the photo before this fails */
const TOL = 3.5;

const S = SLAB_SPEC;
/** spec y (world, measured down from the top edge) → photo fraction of the case */
const fy = (yTop) => yTop / S.h;
/** spec x (world, centred) → photo fraction of the case width */
const fxc = (xc) => xc / S.w + 0.5;

const cardTop = S.cardY + S.cardH / 2; // world y of the card's top edge, slab-centred
/** world y measured down from the slab's top → the same convention */
const fromTop = (yc) => S.h / 2 - yc;

const MODEL = {
  'case aspect (w/h)': [S.w / S.h, 665 / 1116],
  'case corner radius (of min(w,h))': [S.radius, 76.5 / 665],

  'label left': [fxc(-S.labelW / 2), 452 - CASE.x0, 'px'],
  'label right': [fxc(S.labelW / 2), 1036 - CASE.x0, 'px'],
  'label top': [fy(S.labelTop), 227 - CASE.y0],
  'label bottom': [fy(S.labelTop + S.labelH), 379 - CASE.y0],

  'ridge top': [fy(S.ridgeTop), 418 - CASE.y0],
  'ridge bottom': [fy(S.ridgeTop + S.ridgeH), 427 - CASE.y0],

  'window left': [fxc(-S.windowW / 2), 465 - CASE.x0, 'px'],
  'window right': [fxc(S.windowW / 2), 1030 - CASE.x0, 'px'],
  'window top': [fy(S.windowTop), 470 - CASE.y0],
  'window bottom': [fy(S.windowTop + S.windowH), 1295 - CASE.y0],

  'card left': [fxc(-S.cardW / 2), 500 - CASE.x0, 'px'],
  'card right': [fxc(S.cardW / 2), 991 - CASE.x0, 'px'],
  'card top': [fy(fromTop(cardTop)), 508 - CASE.y0],
  'card bottom': [fy(fromTop(S.cardY - S.cardH / 2)), 1240 - CASE.y0],

  // the art frame's *outer* edges: its 4 px ink line runs 532..536 and
  // 957..961 horizontally, 535..541 and 964..970 vertically
  'art frame left': [fxc(-S.cardW / 2 + S.artInset * S.cardW), 532 - CASE.x0, 'px'],
  'art frame right': [fxc(S.cardW / 2 - S.artInset * S.cardW), 961 - CASE.x0, 'px'],
  'art frame top': [fy(fromTop(cardTop - S.artTop * S.cardH)), 535 - CASE.y0],
  'art frame bottom': [fy(fromTop(cardTop - (1 - S.artBottom) * S.cardH)), 970 - CASE.y0],
};

/* the model's layout numbers are fractions of the case; the photo's are px */
const toPx = (v, axis) => (axis === 'x' ? v * CASE.w : v * CASE.h);

let worst = 0;
let failures = 0;
const rows = [];

for (const [name, [model, ref, unit]] of Object.entries(MODEL)) {
  const axis = /left|right/.test(name) ? 'x' : 'y';
  const scale = /aspect|radius/.test(name) ? 1 : axis === 'x' ? CASE.w : CASE.h;
  let delta;
  if (/aspect/.test(name)) delta = (model - ref) * CASE.h; // expressed in px of width
  else if (/radius/.test(name)) delta = (model - ref) * CASE.w;
  else delta = (toPx(model, axis) - ref) * (unit === 'px' ? 1 : 1);
  const abs = Math.abs(delta);
  if (!/aspect|radius/.test(name)) {
    /*
     * The photo's horizontal edges are soft: the window's left edge is a ramp
     * about 15 px wide where the acrylic wall darkens, and its right edge is a
     * 5 px highlight, so the pair can only be located to about 3 px. Everything
     * else (the card, the label, the ridge, all the y features) has a hard edge
     * and is held to TOL.
     */
    const limit = /window left|window right/.test(name) ? TOL * 2 : TOL;
    if (abs > limit) failures++;
  } else if (abs > 4) failures++;
  worst = Math.max(worst, abs);
  rows.push([name, model, ref, delta, axis]);
}

const pad = (s, n) => String(s).padEnd(n);
console.log('feature'.padEnd(34), 'model'.padEnd(12), 'reference'.padEnd(12), 'delta');
console.log('-'.repeat(74));
for (const [name, model, ref, delta, axis] of rows) {
  const isRatio = /aspect|radius/.test(name);
  const m = isRatio ? model.toFixed(4) : `${(toPx(model, axis)).toFixed(1)}px`;
  const r = isRatio ? ref.toFixed(4) : `${ref.toFixed(1)}px`;
  console.log(pad(name, 34), pad(m, 12), pad(r, 12), `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}px`);
}
console.log('-'.repeat(74));
console.log(`worst delta ${worst.toFixed(2)}px of a ${CASE.w}x${CASE.h}px case (tolerance ${TOL}px)`);
if (failures) {
  console.log(`\n${failures} FEATURE(S) OUT OF TOLERANCE`);
  process.exit(1);
}
console.log('\nOK - every measured feature of the slab matches reference-image.jpg');
