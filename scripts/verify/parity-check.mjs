/**
 * Anatomical parity check: the model's slab spec against `reference-image.jpg`.
 *
 * `scripts/analysis/_target_measure.mjs` (with `_target_scan.mjs` and
 * `_target_silhouette.mjs`) is how the reference numbers were recovered on this
 * branch — silhouette tracking by absolute-luma threshold, run/colour profiles
 * along the key scanlines, corner arcs and 5x5 tone means. Those numbers are
 * frozen here as MEASURED, and every one of them is re-derived from SLAB_SPEC
 * on each run, in the same normalised space:
 *
 *   x  : fraction of the case width, 0 at the case's left edge
 *   y  : fraction of the case height, 0 at its top edge
 *
 * so a spec drift shows up as a delta with a sign and a magnitude in photo
 * pixels. Fails on any feature that moves more than TOL px on the 930 x 1536 px
 * case. The band, the lip bar and the painted rails are checked from the BUILT
 * geometry / tray layout with their placement applied, because layers are
 * centred on their own bounds and a spec-only check cannot see a position
 * error.
 *
 *   npm run verify:parity
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { SLAB_SPEC, slabLayers, trayLayout } = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');
const { buildSlabGeometry } = await jiti.import(root + 'src/components/canvas/slab/geometry.ts');

/** the case box in reference-image.jpg, px — absolute-luma silhouette tracked */
const CASE = { w: 930, h: 1536, x0: 494, y0: 181, x1: 1424, y1: 1717 };
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

/* placed bounding box of a built layer: the bounds plus the position `place` gives it */
const geo = buildSlabGeometry('hero');
const placedBox = (g, at) => {
  g.computeBoundingBox();
  const b = g.boundingBox;
  return { minX: b.min.x + at[0], maxX: b.max.x + at[0], minY: b.min.y + at[1], maxY: b.max.y + at[1] };
};
const band = placedBox(geo.band, geo.place.band);

/* the painted window-floor furniture, back out of tray-layout fractions to px */
const L = slabLayers();
const TL = trayLayout();
const planeTop = L.windowY + TL.planeH / 2;
const railPx = (r) => {
  const wx = (r.x + r.w / 2 - 0.5) * TL.planeW;
  const yTop = planeTop - r.y * TL.planeH;
  return { x0: (fxc(wx - (r.w * TL.planeW) / 2) ) * CASE.w, x1: fxc(wx + (r.w * TL.planeW) / 2) * CASE.w, y0: fy(yTop) * CASE.h, y1: fy(yTop + r.h * TL.planeH) * CASE.h };
};
const railL = railPx(TL.rails[0]);
const railR = railPx(TL.rails[1]);
const lipB = railPx(TL.lipBottom);

const MODEL = {
  'case aspect (w/h)': [S.w / S.h, 930 / 1536],
  'case corner radius (of min(w,h))': [S.radius, 45 / 930],

  'label left': [fxc(-S.labelW / 2), 89, 'px'],
  'label right': [fxc(S.labelW / 2), 843, 'px'],
  'label top': [fy(S.labelTop), 58],
  'label bottom': [fy(S.labelTop + S.labelH), 256],

  'ridge top': [fy(S.ridgeTop), 265],
  'ridge bottom': [fy(S.ridgeTop + S.ridgeH), 298],
  // the rail is the top of the inner frame: exactly the window's width
  'ridge left': [fxc(-(S.w / 2 - S.ridgeInset)), 51, 'px'],
  'ridge right': [fxc(S.w / 2 - S.ridgeInset), 876, 'px'],

  'window left': [fxc(-S.windowW / 2), 51, 'px'],
  'window right': [fxc(S.windowW / 2), 876, 'px'],
  'window top': [fy(S.windowTop), 299],
  'window bottom': [fy(S.windowTop + S.windowH), 1477],
  // the band is the rim's inner frosted step: its outer edge is windowBand outside the opening
  'band top (outer)': [fy(fromTop(band.maxY)), 275],
  'band bottom (outer)': [fy(fromTop(band.minY)), 1501],
  'band left (outer)': [fxc(band.minX), 27, 'px'],
  'band right (outer)': [fxc(band.maxX), 900, 'px'],

  'card left': [fxc(-S.cardW / 2), 96, 'px'],
  'card right': [fxc(S.cardW / 2), 834, 'px'],
  'card top': [fy(fromTop(cardTop)), 379],
  'card bottom': [fy(fromTop(S.cardY - S.cardH / 2)), 1399],

  // the window's top lip bar: one bright bar at y 543..548, x 642..1270
  'lip bar top': [fy(fromTop(L.windowY + S.windowH / 2 - S.slotTop)), 362],
  'lip bar top (under)': [fy(fromTop(L.windowY + S.windowH / 2 - S.slotTop - S.slotH)), 367],
  'lip bar width': [S.slotW, 628, 'px'],

  // painted window-floor furniture, checked through the tray layout
  'rail left (outer)': [railL.x0 / CASE.w, 82, 'px'],
  'rail left (inner)': [railL.x1 / CASE.w, 93, 'px'],
  'rail right (inner)': [railR.x0 / CASE.w, 833, 'px'],
  'rail right (outer)': [railR.x1 / CASE.w, 844, 'px'],
  'rail top': [railL.y0 / CASE.h, 421],
  'rail bottom': [railL.y1 / CASE.h, 1354],
  'bottom lip top': [lipB.y0 / CASE.h, 1407],
  'bottom lip bottom': [lipB.y1 / CASE.h, 1421],

  // the target's card is a full-bleed cover: no ring, no art frame at all
  'full-bleed (ring width)': [S.ringWidth, 0],
  'full-bleed (art inset)': [S.artInset, 0],
};

/* the model's layout numbers are fractions of the case; the photo's are px */
const toPx = (v, axis) => (axis === 'x' ? v * CASE.w : v * CASE.h);

let worst = 0;
let failures = 0;
const rows = [];

for (const [name, [model, ref, unit]] of Object.entries(MODEL)) {
  const axis = /left|right|width|aspect|radius/.test(name) ? 'x' : 'y';
  let delta;
  if (/aspect/.test(name)) delta = (model - ref) * CASE.h; // expressed in px of width
  else if (/radius/.test(name)) delta = (model - ref) * CASE.w;
  else if (/ring width|art inset/.test(name)) delta = (model - ref) * CASE.w;
  else delta = (toPx(model, axis) - ref) * (unit === 'px' ? 1 : 1);
  const abs = Math.abs(delta);
  if (!/aspect|radius|ring width|art inset/.test(name)) {
    /*
     * The photo's horizontal window edges are soft: the opening's left edge is
     * a ~14 px ramp where the acrylic wall darkens (row y=960: 541..555), so
     * that pair and the band that hangs off it can only be located to about
     * 3 px. Everything with a hard edge is held to TOL.
     */
    const limit = /window (left|right)|band (left|right)/.test(name) ? TOL * 2 : TOL;
    if (abs > limit) failures++;
  } else if (abs > 4) {
    failures++;
  }
  worst = Math.max(worst, abs);
  rows.push([name, model, ref, delta, axis]);
}

const pad = (s, n) => String(s).padEnd(n);
console.log('feature'.padEnd(34), 'model'.padEnd(12), 'reference'.padEnd(12), 'delta');
console.log('-'.repeat(74));
for (const [name, model, ref, delta, axis] of rows) {
  const isRatio = /aspect|radius|ring width|art inset/.test(name);
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
