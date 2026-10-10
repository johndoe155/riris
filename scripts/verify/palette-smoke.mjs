/**
 * Dynamic palette checks.
 *
 *   npm run verify:palette
 *
 * 1. IDENTITY  — the reference palette must paint exactly what the painters
 *    paint with no palette at all: every canvas texture built with
 *    `pal = REFERENCE_PALETTE` is byte-identical to the `pal = null` build
 *    (needs @napi-rs/canvas, `npm i --no-save @napi-rs/canvas`; skipped
 *    without it), and a slab with no driver is untouched by the system.
 * 2. DERIVATION — synthetic artworks (saturated red, neutral grey, pastel,
 *    cyan, warm tan, dark high-contrast) must land in the environmental
 *    families the design prescribes, with the tonal hierarchy intact, the
 *    contrast rule obeyed, every tone in gamut, and the brand accent fixed.
 * 3. FLUIDITY  — the engine's glide converges, and the per-texture repaint
 *    gating fires while moving and repaints exactly at settle.
 * 4. REAL ART  — when @napi-rs/canvas is present, the preset artworks are
 *    sampled and derived, and the reference artwork must reproduce the
 *    measured reference family (the calibration point of the whole system).
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const problems = [];
const fail = (msg) => problems.push(msg);

/* optional pixel backend: the identity + real-art checks use it */
let napi = null;
try {
  napi = await import('@napi-rs/canvas');
} catch {
  napi = null;
}
if (napi) {
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? napi.createCanvas(2, 2) : { style: {}, nodeName: String(tag).toUpperCase() }),
    createElementNS: () => napi.createCanvas(2, 2),
  };
  globalThis.Image = napi.Image;
  globalThis.HTMLImageElement = napi.Image;
  globalThis.window = globalThis.window || { devicePixelRatio: 1 };
}

const jiti = createJiti(import.meta.url, { moduleCache: false });
const P = await jiti.import(root + 'src/lib/palette.ts');
const S = await jiti.import(root + 'src/components/canvas/slab/slabPalette.ts');
const E = await jiti.import(root + 'src/components/canvas/slab/paletteEngine.ts');

/* ---------------------------------------------------------------- *
 * helpers
 * ---------------------------------------------------------------- */

const hexOk = (h) => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
function slots(pal) {
  const out = [];
  for (const [k, v] of Object.entries(pal)) {
    if (k === 'shader') continue;
    if (typeof v === 'string' && v.startsWith('#')) out.push([k, v]);
    else if (Array.isArray(v) && typeof v[0] === 'string') v.forEach((h, i) => out.push([`${k}[${i}]`, h]));
  }
  return out;
}
const L = (hex) => P.hexToLch(hex).L;
const C = (hex) => P.hexToLch(hex).C;

/** a flat synthetic artwork: backdrop + a subject blob + optional sparkles */
function synth(w, h, backdrop, subject, opts = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, rgb) => {
    const i = (y * w + x) * 4;
    data[i] = rgb.r * 255; data[i + 1] = rgb.g * 255; data[i + 2] = rgb.b * 255; data[i + 3] = 255;
  };
  const bg = P.hexToRgb(backdrop);
  const fg = P.hexToRgb(subject);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - w * 0.5) / (w * 0.22);
      const dy = (y - h * 0.52) / (h * 0.26);
      put(x, y, dx * dx + dy * dy < 1 ? fg : bg);
    }
  }
  if (opts.sparkle) {
    // tiny bright details: must NOT move the palette
    const sp = P.hexToRgb(opts.sparkle);
    for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) put(x, y, sp);
    for (let y = h - 9; y < h - 5; y++) for (let x = w - 9; x < w - 5; x++) put(x, y, sp);
  }
  return data;
}

const derive = (data, w, h) => {
  const sample = P.sampleArtwork(data, w, h, 4);
  return { sample, pal: S.deriveSlabPalette(sample, P.deriveAnchors(sample)) };
};

/* ---------------------------------------------------------------- *
 * 1. identity: palette = REFERENCE_PALETTE paints the null palette
 * ---------------------------------------------------------------- */

if (napi) {
  const tex = await jiti.import(root + 'src/components/canvas/slab/textures.ts');
  const use = await jiti.import(root + 'src/components/canvas/slab/useSlabTextures.ts');
  const { slabCards } = await jiti.import(root + 'src/data/slabCards.ts');
  const { trayLayout } = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');
  const R = S.REFERENCE_PALETTE;
  const card = slabCards[0];

  const pair = (name, draw) => {
    const a = napi.createCanvas(512, 768);
    const b = napi.createCanvas(512, 768);
    draw(a.getContext('2d'), null);
    draw(b.getContext('2d'), R);
    const eq = a.toBuffer('image/png').equals(b.toBuffer('image/png'));
    if (!eq) fail(`identity: ${name} differs between pal=null and pal=REFERENCE_PALETTE`);
    return eq;
  };
  pair('tray', (ctx, pal) => tex.drawTray(ctx, 512, 768, trayLayout(), pal));
  pair('face map', (ctx, pal) => tex.drawFaceMap(ctx, 512, 870, pal));
  pair('label', (ctx, pal) => tex.drawLabel(ctx, use.labelText(card, 512, pal, null)));
  pair('card face', (ctx, pal) => {
    const o = use.cardFaceText(card, 512, pal);
    tex.drawCardFace(ctx, o, null, tex.innerArtBox(o));
  });
  console.log('identity     4 painters byte-identical at the reference palette');
} else {
  console.log('identity     skipped (@napi-rs/canvas not installed)');
}

/* the reference palette is its own fixed point under lerp */
{
  const out = S.clonePalette(S.REFERENCE_PALETTE);
  S.lerpPaletteInto(out, S.REFERENCE_PALETTE, S.REFERENCE_PALETTE, 0.37);
  for (const [k, v] of slots(out)) {
    if (k === 'faceGrid') continue; // rows compared below
    if (v !== S.REFERENCE_PALETTE[k]) fail(`identity: lerp(ref, ref, t) moved ${k}: ${S.REFERENCE_PALETTE[k]} -> ${v}`);
  }
  out.faceGrid.forEach((row, r) =>
    row.forEach((hex, c) => {
      if (hex !== S.REFERENCE_PALETTE.faceGrid[r][c]) {
        fail(`identity: lerp(ref, ref, t) moved faceGrid[${r}][${c}]: ${S.REFERENCE_PALETTE.faceGrid[r][c]} -> ${hex}`);
      }
    })
  );
}

/* ---------------------------------------------------------------- *
 * 2. derivation: the prescribed environmental families
 * ---------------------------------------------------------------- */

const hue = (hex) => P.hexToLch(hex).H;
const near = (a, b, tol) => Math.abs(P.hueDelta(a, b)) <= tol;

const cases = [
  {
    name: 'saturated red', bg: '#8e1f2f', fg: '#c23a44', sparkle: '#ff8a00',
    check: (pal) => {
      if (!near(hue(pal.voidGlow), 10, 45) && !near(hue(pal.voidGlow), 355, 45)) fail('red art: family is not red-magenta');
      if (L(pal.voidDark) > 0.34) fail(`red art: environment not deep (voidDark L ${L(pal.voidDark).toFixed(2)})`);
      if (C(pal.faceMid) < 0.02) fail('red art: family chroma collapsed');
    },
  },
  {
    name: 'neutral grey', bg: '#6f6f72', fg: '#8b8b8e',
    check: (pal) => {
      if (C(pal.faceMid) > 0.012) fail(`grey art: not a charcoal environment (C ${C(pal.faceMid).toFixed(3)})`);
      if (pal.mood !== 'neutral') fail(`grey art: mood ${pal.mood}, expected neutral`);
    },
  },
  {
    name: 'pastel pink', bg: '#f3d3da', fg: '#f7e3e7',
    check: (pal) => {
      if (pal.mood !== 'pastel') fail(`pastel art: mood ${pal.mood}, expected pastel`);
      if (L(pal.voidPale) < 0.78) fail(`pastel art: void not pale/hazy (pale L ${L(pal.voidPale).toFixed(2)})`);
      if (L(pal.voidDark) < 0.4) fail('pastel art: dark stop not lifted (should be hazy)');
      if (C(pal.faceMid) > 0.05) fail('pastel art: not desaturated enough');
    },
  },
  {
    name: 'mint cyan', bg: '#9fd8d2', fg: '#c9ece7',
    check: (pal) => {
      if (!near(hue(pal.voidGlow), 190, 40)) fail(`cyan art: family hue ${hue(pal.voidGlow).toFixed(0)}, expected light airy cyan`);
      if (L(pal.voidPale) < L(S.REFERENCE_PALETTE.voidPale)) fail('cyan art: environment not lighter than the reference');
    },
  },
  {
    name: 'warm tan', bg: '#c8a061', fg: '#e0be85',
    check: (pal) => {
      if (!near(hue(pal.voidGlow), 70, 40)) fail(`tan art: family hue ${hue(pal.voidGlow).toFixed(0)}, expected golden ochre`);
    },
  },
  {
    name: 'dark violet', bg: '#241a33', fg: '#3a2b52',
    check: (pal) => {
      if (!near(hue(pal.voidGlow), 300, 45)) fail(`violet art: family hue ${hue(pal.voidGlow).toFixed(0)}, expected plum/violet`);
      if (L(pal.voidDark) > 0.31) fail(`violet art: not cinematic (voidDark L ${L(pal.voidDark).toFixed(2)})`);
    },
  },
];

for (const c of cases) {
  const { sample, pal } = derive(synth(96, 96, c.bg, c.fg, c), 96, 96);
  c.check(pal, sample);
  /* hierarchy + gamut + contrast rule, for every case */
  if (!(L(pal.voidDark) < L(pal.voidGlow) && L(pal.voidGlow) < L(pal.voidPale))) fail(`${c.name}: void ramp not ordered`);
  if (!(L(pal.field) < L(pal.faceMid) && L(pal.faceMid) < L(pal.faceTop))) fail(`${c.name}: card hierarchy not ordered`);
  if (!(L(pal.tray) < L(pal.windowWall))) fail(`${c.name}: image-panel framing not darker than its wall`);
  const inkL = L(pal.ink);
  if (L(pal.field) < 0.55 ? inkL < 0.8 : inkL > 0.3) {
    fail(`${c.name}: typography contrast rule broken (field ${L(pal.field).toFixed(2)}, ink ${inkL.toFixed(2)})`);
  }
  for (const [k, v] of slots(pal)) {
    if (!hexOk(v)) fail(`${c.name}: slot ${k} is not a hex colour: ${v}`);
    const l = P.hexToLch(v).L;
    if (!(l >= 0 && l <= 1)) fail(`${c.name}: slot ${k} out of gamut lightness ${l}`);
  }
  if (pal.accent !== '#FF4D00') fail(`${c.name}: brand accent moved`);
}

/* small bright details must not determine the palette */
{
  const plain = derive(synth(96, 96, '#6f5c6b', '#8c7b87'), 96, 96);
  const sparkly = derive(synth(96, 96, '#6f5c6b', '#8c7b87', { sparkle: '#ff5a00' }), 96, 96);
  if (Math.abs(P.hueDelta(plain.pal.hue, sparkly.pal.hue)) > 6) fail('sparkles moved the family hue');
  if (Math.abs(plain.pal.chroma - sparkly.pal.chroma) > 0.004) fail('sparkles moved the family chroma');
}

/* ---------------------------------------------------------------- *
 * 3. fluidity: the glide converges and repaint gating behaves
 * ---------------------------------------------------------------- */

{
  const { pal } = derive(synth(96, 96, '#8e1f2f', '#c23a44'), 96, 96);
  const Engine = Object.getPrototypeOf(E.paletteEngine).constructor;
  const engine = new Engine();
  engine.setTarget(pal);
  let steps = 0;
  while (engine.moving && steps < 600) {
    engine.step(1 / 60);
    steps++;
  }
  if (engine.moving) fail('engine did not settle within 10s of simulated frames');
  if (S.hexDistance(engine.current.voidGlow, pal.voidGlow) !== 0) fail('engine settled off-target');

  let settled = 0;
  const eng2 = new Engine();
  eng2.subscribe((reason) => {
    if (reason === 'settle') settled++;
  });
  eng2.setTarget(pal);
  for (let i = 0; i < 600 && eng2.moving; i++) eng2.step(1 / 60);
  if (settled !== 1) fail(`settle notification fired ${settled} times, expected 1`);

  const a = S.REFERENCE_PALETTE;
  const mid = S.clonePalette(a);
  S.lerpPaletteInto(mid, a, pal, 0.5);
  if (!S.groupChanged(a, mid, 'faceMap', 3)) fail('groupChanged missed a half-way palette at move tolerance');
  if (S.groupChanged(a, a, 'faceMap', 0)) fail('groupChanged sees change where there is none');
}

/* ---------------------------------------------------------------- *
 * 4. real artwork, incl. the calibration point
 * ---------------------------------------------------------------- */

if (napi) {
  const arts = [
    ['reference art', 'public/cards/Gjw0CRRXoAMjU8i.jpg'],
    ['red azuki', 'public/cards/Gfq0PT6W8AEZ1qU.jpg'],
    ['green pudgy', 'public/cards/card_26.jpg'],
    ['tan punk', 'public/cards/card_30.jpg'],
    ['blue doodle', 'public/cards/IMG_20261007_124052.jpg'],
    ['pastel ape', 'public/cards/Gpo4KaoWUAAhtXw.jpg'],
    ['violet clone', 'public/cards/card_07.jpg'],
  ];
  console.log('\n  artwork            mood         hue  chroma  voidDark voidPale field  faceMid  ink');
  for (const [label, rel] of arts) {
    const img = await napi.loadImage(path.join(root, rel));
    const w = 112;
    const h = Math.max(8, Math.round((img.height / img.width) * w));
    const cv = napi.createCanvas(w, h);
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const { pal } = derive(ctx.getImageData(0, 0, w, h).data, w, h);
    console.log(
      `  ${label.padEnd(18)} ${pal.mood.padEnd(12)} ${pal.hue.toFixed(0).padStart(4)}° ${pal.chroma.toFixed(4)} ` +
        `L${L(pal.voidDark).toFixed(2)}   L${L(pal.voidPale).toFixed(2)}   L${L(pal.field).toFixed(2)}  L${L(pal.faceMid).toFixed(2)}  ${pal.ink}`
    );
    for (const [k, v] of slots(pal)) if (!hexOk(v)) fail(`${label}: slot ${k} bad hex ${v}`);
    if (label === 'reference art') {
      const R = S.REFERENCE_PALETTE;
      if (Math.abs(P.hueDelta(pal.hue, R.hue)) > 30) fail(`calibration: reference art family hue ${pal.hue.toFixed(0)} vs ${R.hue}`);
      if (Math.abs(pal.chroma - R.chroma) / R.chroma > 0.45) fail(`calibration: reference art chroma ${pal.chroma.toFixed(4)} vs ${R.chroma}`);
      if (Math.abs(L(pal.faceMid) - L(R.faceMid)) > 0.12) fail(`calibration: face mid lightness ${L(pal.faceMid).toFixed(2)} vs ${L(R.faceMid).toFixed(2)}`);
      if (!pal.inkLight) fail('calibration: reference art should keep light ink');
    }
  }
} else {
  console.log('real art     skipped (@napi-rs/canvas not installed)');
}

/* ---------------------------------------------------------------- */

if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems.slice(0, 20)) console.log(' -', p);
  process.exit(1);
}
console.log('\nOK - palette identity, derivation, fluidity and calibration hold');
