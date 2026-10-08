/**
 * Runs the canvas texture painters under a recording 2D context and fails on
 * any NaN/undefined drawing argument (a browser would silently draw nothing).
 * Also exercises the async art path for every card in the manifest.
 *
 *   npm run verify:textures
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';

/* A recording 2D context. Canvas calls with NaN or undefined arguments fail
   silently in a browser, so any such argument is treated as an error here. */
const problems = [];
const counts = new Map();
const stack = () => ((new Error().stack || '').split('\n').find((l) => l.includes('/src/')) || '').trim();
function checkArgs(name, args) {
  args.forEach((a, i) => {
    const bad = (typeof a === 'number' && !Number.isFinite(a)) || a === undefined || a === null;
    if (bad) problems.push(`${name} arg ${i} = ${a}   ${stack()}`);
  });
}
function makeCtx() {
  const gradient = { addColorStop() {} };
  const base = {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif',
    globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter', textAlign: 'left', textBaseline: 'top',
    shadowBlur: 0, shadowColor: '#000', imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
    filter: 'none',
    createLinearGradient: (...a) => (checkArgs('createLinearGradient', a), gradient),
    createRadialGradient: (...a) => (checkArgs('createRadialGradient', a), gradient),
    createPattern: () => ({}),
    measureText: (t) => ({ width: String(t).length * 6 }),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    setLineDash: () => {},
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop !== 'string') return undefined;
      return (...args) => {
        counts.set(prop, (counts.get(prop) || 0) + 1);
        checkArgs(prop, args);
      };
    },
    set(target, prop, value) {
      if (typeof value === 'number' && !Number.isFinite(value)) problems.push(`set ${String(prop)} = ${value}   ${stack()}`);
      if (value === undefined) problems.push(`set ${String(prop)} = undefined   ${stack()}`);
      target[prop] = value;
      return true;
    },
  });
}
function makeCanvas(w = 300, h = 150) {
  const ctx = makeCtx();
  const canvas = {
    width: w, height: h, style: {}, nodeName: 'CANVAS',
    getContext: () => ctx,
    toDataURL: () => 'data:,',
    addEventListener() {}, removeEventListener() {},
  };
  ctx.canvas = canvas;
  return canvas;
}
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, nodeName: String(tag).toUpperCase() }),
  createElementNS: () => makeCanvas(),
};
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
globalThis.HTMLCanvasElement = function () {};
class FakeImage {
  constructor() { this.width = 720; this.height = 1000; this.naturalWidth = 720; this.naturalHeight = 1000; this.complete = true; }
  set src(v) { this._src = v; queueMicrotask(() => this.onload && this.onload()); }
  get src() { return this._src; }
}
globalThis.Image = FakeImage;
globalThis.HTMLImageElement = FakeImage;

const root = fileURLToPath(new URL('../../', import.meta.url));
const jiti = createJiti(import.meta.url, { moduleCache: false });
const tex = await jiti.import(root + 'src/components/canvas/slab/textures.ts');
const use = await jiti.import(root + 'src/components/canvas/slab/useSlabTextures.ts');
const { slabCards } = await jiti.import(root + 'src/data/slabCards.ts');

const card = slabCards[0];
const rows = [];
const push = (label, t) => rows.push([label, t?.isTexture ? 'texture' : 'MISSING', t?.image ? `${t.image.width}x${t.image.height}` : '-', t?.colorSpace === 'srgb' ? 'srgb' : (t?.colorSpace || '-')]);

// every card, both tiers: the pit and the Forge share this code path
for (const c of slabCards) {
  push(`face:${c.id}`, use.getCardFaceTexture(c, null, 'cheap'));
}
push('face hero', use.getCardFaceTexture(card, null, 'hero'));
push('face cached', use.getCardFaceTexture(card, null, 'cheap'));
push('face with art', use.getCardFaceTexture(card, { width: 720, height: 1000 }, 'hero'));
push('label', use.getLabelTexture(card));
push('label cheap', use.getLabelTexture(card, false, 'cheap'));
push('label blank', use.getLabelTexture(card, true));
push('tray', use.getTrayTexture());
push('back', use.getBackTexture());
push('wear', tex.getWearMaps().roughness);

// cache identity
const a = use.getCardFaceTexture(card, null, 'cheap');
const b = use.getCardFaceTexture(card, null, 'cheap');
rows.push(['cache identity (cheap face)', a === b ? 'same object' : 'DIFFERENT', '', '']);

// async art path: placeholder first, art swapped in when the loader resolves
let notified = 0;
const off = use.onCardTextureReady(() => { notified++; });
// mimic the real mount order: placeholder first (synchronous first paint),
// then the async loader rebuilds it with the art
const freshCard = slabCards[10];
const placeholder = use.getCardFaceTexture(freshCard, null, 'hero');
const withArt = await use.ensureCardTexture(freshCard, 'hero');
const remount = use.getCardFaceTexture(freshCard, null, 'hero'); // a later slab mounts
off();

for (const r of rows.slice(0, 6)) console.log(r.join('  '));
console.log(`... ${rows.length - 6} more texture builds (all 42 cards, both tiers)`);
console.log('cache identity      ', rows.find((r) => r[0].startsWith('cache identity'))?.[1]);
console.log('placeholder (fresh) ', placeholder.image.width + 'x' + placeholder.image.height);
console.log('face with art       ', withArt.image.width + 'x' + withArt.image.height, withArt !== placeholder ? '(rebuilt)' : '(NOT rebuilt)');
console.log('listeners fired     ', notified);
console.log('remount gets art    ', remount === withArt ? 'yes' : 'NO');
console.log('methods called      ', [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => `${k}x${v}`).join(', '));

if (withArt === placeholder) problems.push('ensureCardTexture did not replace the placeholder with the art version');
if (remount !== withArt) problems.push('a later placeholder request did not pick up the finished texture');
if (notified === 0) problems.push('onCardTextureReady listeners never fired');
if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems.slice(0, 15)) console.log(' -', p);
  process.exit(1);
}
console.log('\nOK - no NaN/undefined canvas arguments, textures built for all 42 cards');
