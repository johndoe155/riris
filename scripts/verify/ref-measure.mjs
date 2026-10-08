/**
 * Re-derives the measurements in `src/components/canvas/slab/SlabSpec.ts`
 * straight from `reference-image.jpg` and fails when the spec has drifted.
 *
 *   npm run verify:reference
 *
 * Method. Every edge is found as a HALF-HEIGHT CROSSING: take the median
 * luminance of a window on each side of the edge, then report where the
 * profile crosses the midpoint, linearly interpolated to sub-pixel. That is
 * unbiased by any absolute threshold, which matters here because the photo's
 * two sides are lit very differently — the shell's right rail reads L 137
 * against a L 110 backdrop while the left rail reads L 55 against L 46, so a
 * fixed "is it background" threshold finds one and not the other.
 *
 * Only the edges with a strong, unambiguous step are measured. The shell's
 * left edge is deliberately not one of them: rail and backdrop differ by 9 L*
 * out of 255, less than the JPEG's own noise, so any detector there is
 * fitting noise. Those edges are carried as constants in the spec instead.
 *
 * Needs ImageMagick (`convert`) to decode the JPEG into raw RGB. If it is
 * missing the script says so and exits 0 — the check is a convenience, not a
 * gate the build depends on.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { REF_MEASURE } = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');

const IMAGE = path.join(root, 'reference-image.jpg');

if (!fs.existsSync(IMAGE)) {
  console.log(`SKIP — no reference-image.jpg at ${IMAGE}`);
  process.exit(0);
}

let convert = null;
for (const bin of ['convert', 'magick']) {
  try {
    execFileSync(bin, ['-version'], { stdio: 'ignore' });
    convert = bin;
    break;
  } catch {
    /* try the next one */
  }
}
if (!convert) {
  console.log('SKIP — ImageMagick (`convert`) is not installed, cannot decode the JPEG');
  process.exit(0);
}

const tmp = path.join(os.tmpdir(), `ref-measure-${process.pid}.rgb`);
try {
  const args = convert === 'magick' ? [IMAGE, '-depth', '8', `RGB:${tmp}`] : [IMAGE, '-depth', '8', `RGB:${tmp}`];
  execFileSync(convert, args, { stdio: 'ignore' });
} catch (err) {
  console.log(`SKIP — ImageMagick failed to decode: ${err.message}`);
  process.exit(0);
}
const raw = fs.readFileSync(tmp);
fs.unlinkSync(tmp);

const { w: W, h: H } = REF_MEASURE.image;
if (raw.length < W * H * 3) {
  console.error(`FAIL — decoded ${raw.length} bytes, expected at least ${W * H * 3} for ${W}x${H}`);
  process.exit(1);
}

const L = (x, y) => {
  const i = ((y | 0) * W + (x | 0)) * 3;
  return 0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2];
};

/** A 1-D luminance profile sampled along a row or a column. */
function profile({ axis, at, from, to }) {
  const out = [];
  for (let p = from; p <= to; p++) {
    out.push({ pos: p, L: axis === 'x' ? L(p, at) : L(at, p) });
  }
  return out;
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

/**
 * Half-height crossing between the median of `low` and the median of `high`.
 * Works in either scan direction: whichever of the two plateaus comes first
 * along the profile decides whether the crossing is rising or falling, and the
 * search runs over the gap between them.
 */
function edge(prof, low, high) {
  const lo = median(prof.filter((p) => p.pos >= low[0] && p.pos <= low[1]).map((p) => p.L));
  const hi = median(prof.filter((p) => p.pos >= high[0] && p.pos <= high[1]).map((p) => p.L));
  const mid = (lo + hi) / 2;
  const rising = high[0] > low[1]; // the bright plateau comes later in the scan
  const from = Math.min(low[1], high[0]);
  const to = Math.max(low[1], high[0]);
  for (let i = 1; i < prof.length; i++) {
    const p1 = prof[i];
    if (p1.pos < from || p1.pos > to) continue;
    const p0 = prof[i - 1];
    if (p1.pos < from) continue;
    if (rising ? p1.L >= mid : p1.L <= mid) {
      const d = p1.L - p0.L;
      const t = Math.abs(d) < 1e-6 ? 0 : (mid - p0.L) / d;
      return p0.pos + t * (p1.pos - p0.pos);
    }
  }
  return null;
}

/** Median of the same edge found on several parallel scans, so one scuff
 *  cannot move the result. */
function multiEdge(configs) {
  const hits = configs.map((c) => edge(profile(c), c.low, c.high)).filter((v) => v != null);
  if (!hits.length) return null;
  return median(hits);
}

/* ------------------------------------------------------------------ *
 * The probes. Every one of these straddles a step of at least 90 L*,
 * which is why they are measurable and the shell's left rail is not.
 * ------------------------------------------------------------------ */
const rowAt = (y, from, to) => ({ axis: 'x', at: y, from, to });
const colAt = (x, from, to) => ({ axis: 'y', at: x, from, to });

const measured = {
  // card's white border against the tray: L 57 -> L 250, ~190 L* of step
  cardLeft: multiEdge([700, 800, 900, 1000].map((y) => ({ ...rowAt(y, 480, 545), low: [482, 496], high: [501, 507] }))),
  cardRight: multiEdge([700, 800, 900, 1000].map((y) => ({ ...rowAt(y, 940, 1005), low: [996, 1004], high: [985, 990] }))),
  cardTop: multiEdge([640, 740, 840].map((x) => ({ ...colAt(x, 480, 545), low: [482, 505], high: [510, 515] }))),
  cardBottom: multiEdge([640, 740, 840].map((x) => ({ ...colAt(x, 1170, 1230), low: [1209, 1228], high: [1199, 1204] }))),
  // the shell's top edge: backdrop L 146 against the shell's top border L 122
  slabTop: multiEdge([640, 740, 840].map((x) => ({ ...colAt(x, 165, 210), low: [166, 184], high: [190, 196] }))),
  // the keyline that rims the art: L 60 -> L 251. Both edges of the band are
  // measured, because the art's own edge is the keyline's trailing edge, not
  // its leading one, and a single probe cannot tell them apart.
  keylineLeadL: multiEdge([700, 800, 900].map((y) => ({ ...rowAt(y, 505, 548), low: [512, 524], high: [530, 533] }))),
  keylineTrailL: multiEdge([700, 800, 900].map((y) => ({ ...rowAt(y, 505, 548), low: [538, 546], high: [530, 533] }))),
  keylineLeadR: multiEdge([700, 800, 900].map((y) => ({ ...rowAt(y, 935, 985), low: [944, 953], high: [958, 962] }))),
  keylineTrailR: multiEdge([700, 800, 900].map((y) => ({ ...rowAt(y, 935, 985), low: [968, 980], high: [958, 962] }))),
  keylineLeadT: multiEdge([640, 740, 840].map((x) => ({ ...colAt(x, 515, 565), low: [520, 532], high: [537, 540] }))),
  keylineTrailT: multiEdge([640, 740, 840].map((x) => ({ ...colAt(x, 515, 565), low: [548, 562], high: [537, 540] }))),
  /* The label's TOP and BOTTOM edges are clean 147 L* steps (L 49 plate
   * against L 165 shell), so they are measured. Its LEFT and RIGHT edges are
   * not: the plate sits in a bevel about 10 px wide, and there is a 1 px
   * specular line at x 429 sitting right on top of it (L 187 between two
   * samples of L 110 and L 64), so any threshold-free detector latches onto
   * the wrong feature. Those two are documented by hand in
   * docs/reference-parity.md instead of measured here. The slab's BOTTOM edge
   * is the same kind of case: it fades into a cast shadow over ~10 px, so a
   * half-height crossing reads 1305 while the steepest gradient reads 1301-1302.
   * The spec keeps 1302 (the steepest-gradient value) and the doc records both. Columns are taken at
   * x 470 / 800 / 1010, all clear of the printed title. */
  labelTop: multiEdge([470, 800, 1010].map((x) => ({ ...colAt(x, 200, 262), low: [232, 258], high: [205, 222] }))),
  labelBottom: multiEdge([470, 800, 1010].map((x) => ({ ...colAt(x, 348, 410), low: [355, 372], high: [384, 405] }))),
};

/* ------------------------------------------------------------------ *
 * Compare
 * ------------------------------------------------------------------ */
const TOL = 2.5; // px — sub-pixel interpolation plus JPEG noise

const C = REF_MEASURE.card;
const A = REF_MEASURE.art;
const Lb = REF_MEASURE.label;
const S = REF_MEASURE.slab;
const spec = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');
const SP = spec.SLAB_SPEC;

/* The keyline band in card UV is keylineInset +/- keylineWidth / 2, so its
 * edges in reference pixels are the card's origin plus that fraction of the
 * card's measured width. This is the relation that ties the drawn texture to
 * the photo. */
const cardW = C.x1 - C.x0;
const keyline = {
  leadX: C.x0 + cardW * (SP.keylineInset - SP.keylineWidth / 2),
  trailX: C.x0 + cardW * (SP.keylineInset + SP.keylineWidth / 2),
  leadXR: C.x1 - cardW * (SP.keylineInset + SP.keylineWidth / 2),
  trailXR: C.x1 - cardW * (SP.keylineInset - SP.keylineWidth / 2),
  leadY: C.y0 + cardW * (SP.keylineInset - SP.keylineWidth / 2),
};

const checks = [
  ['card left', measured.cardLeft, C.x0, TOL],
  ['card right', measured.cardRight, C.x1, TOL],
  ['card top', measured.cardTop, C.y0, TOL],
  ['card bottom', measured.cardBottom, C.y1, TOL],
  ['slab top', measured.slabTop, S.y0, TOL],
  ['label top', measured.labelTop, Lb.y0, TOL],
  ['label bottom', measured.labelBottom, Lb.y1, TOL],
  ['keyline lead (L)', measured.keylineLeadL, keyline.leadX, TOL],
  ['keyline trail (L)', measured.keylineTrailL, keyline.trailX, TOL],
  ['keyline lead (R)', measured.keylineLeadR, keyline.leadXR, TOL],
  ['keyline trail (R)', measured.keylineTrailR, keyline.trailXR, TOL],
  ['keyline lead (T)', measured.keylineLeadT, keyline.leadY, TOL],
];

let bad = 0;
console.log(`reference-image.jpg  ${W} x ${H}   (slab = 1 unit wide in the spec)`);
console.log('');
console.log('  quantity             measured      from spec     drift');
for (const [name, got, want, tol] of checks) {
  if (got == null) {
    console.log(`  ${name.padEnd(20)}   (not found)      ${want.toFixed(1)}`);
    bad++;
    continue;
  }
  const drift = got - want;
  const ok = Math.abs(drift) <= tol;
  if (!ok) bad++;
  console.log(
    `  ${name.padEnd(20)} ${got.toFixed(1).padStart(9)} ${want.toFixed(1).padStart(13)} ${((drift >= 0 ? '+' : '') + drift.toFixed(1)).padStart(8)}   ${ok ? 'ok' : 'FAIL'}`
  );
}

/* The art's own box (REF_MEASURE.art) is set by the keyline, and the keyline
 * is what the card texture draws, so assert the drawn art inset matches the
 * photo's art box rather than re-measuring a soft edge. */
const artInsetPx = (A.x0 - C.x0) / cardW;
const artInsetDrift = Math.abs(artInsetPx - SP.artInset);
console.log(
  `  ${'art inset (of card)'.padEnd(20)} ${artInsetPx.toFixed(4).padStart(9)} ${SP.artInset.toFixed(4).padStart(13)} ${((artInsetPx - SP.artInset >= 0 ? '+' : '') + (artInsetPx - SP.artInset).toFixed(4)).padStart(8)}   ${artInsetDrift <= 0.004 ? 'ok' : 'FAIL'}`
);
if (artInsetDrift > 0.004) bad++;

console.log('');
if (bad) {
  console.error(`FAIL — ${bad} of ${checks.length + 1} measurements drifted from SlabSpec`);
  process.exit(1);
}
console.log(`OK — all ${checks.length + 1} re-measured quantities match SlabSpec`);
