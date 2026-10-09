/**
 * CPU evaluation of the foil overlay's fragment math, in the exact pose
 * `reference-image.jpg` holds: camera front-on (n = v = +z), pointer at rest in
 * the card's centre, t = 0, finish = holo (the store's default).
 *
 * There is no GPU in this sandbox, so the overlay branch of HoloMaterial's
 * fragment shader is ported here 1:1 — same hash, same value noise, same
 * grating, same per-finish weights — and evaluated over the card's own art at
 * 734 x 1016. It renders the shader's output for the PREVIOUS revision
 * (`git show HEAD:src/components/canvas/HoloMaterial.tsx`) and the current one,
 * composited over the art, next to the reference's card region:
 *
 *   node scripts/analysis/_foil_cpu.mjs
 *
 * Writes /home/user/.scratch/foil_compare.png (old | new | reference card).
 * The reference's cover is flat print (luma 233, no orders), so the correct
 * rest-state output is "the art, unchanged": any colour the old column shows
 * over the cover is a parity error the new column must not have.
 */
import sharp from 'sharp';

const W = 734, H = 1016;
const art = await sharp('/home/user/riris/public/cards/rainbow-zine.jpg').resize(W, H).removeAlpha().raw().toBuffer();
const ref = await sharp('/home/user/riris/reference-image.jpg')
  .extract({ left: 592, top: 562, width: 734, height: 1016 }).removeAlpha().raw().toBuffer();

const fract = (x) => x - Math.floor(x);
const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const random = (x, y) => fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = random(ix, iy), b = random(ix + 1, iy), c = random(ix, iy + 1), d = random(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux * (1 - uy) + (c - a) * uy * (1 - ux) + (d - b) * ux * uy;
}
function holoGradient(t) {
  const c1 = [1.0, 0.42, 0.12], c2 = [0.22, 0.88, 1.0], c3 = [1.0, 0.92, 0.36], c4 = [1.0, 0.24, 0.82];
  const t2 = fract(t);
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  let c = t2 < 0.33 ? mix(c1, c2, t2 / 0.33) : t2 < 0.66 ? mix(c2, c3, (t2 - 0.33) / 0.33) : mix(c3, c4, (t2 - 0.66) / 0.34);
  const l = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  c = c.map((v) => v + (l - v) * 0.22);
  return c;
}

/* the reference's pose, as the shader sees it */
const N = [0, 0, 1], V = [0, 0, 1];
const Ld = [0.35, 0.6, 0.72];
const hv = [Ld[0] + V[0], Ld[1] + V[1], Ld[2] + V[2]];
const hl = Math.hypot(...hv);
const HV = hv.map((v) => v / hl);
const ndv = 1, ndh = HV[2];
const fresnel = Math.pow(1 - ndv, 3);
const spec = Math.pow(ndh, 34);
const viewShift = (1 - Math.abs(ndv)) * 0.6 + spec * 0.5;

function overlay(u, v, variant) {
  // u,v in card UV; pointer at rest in the centre
  const dist = Math.hypot(u - 0.5, v - 0.5);
  const pointerGlow = 1 - sstep(0, 0.75, dist);
  const grating = (u * 0.72 + v * 0.28) * 34.0 + viewShift * 5.5 + dist * 3.2 + 0 * 0.06;
  let bands = Math.sin(grating) * 0.5 + 0.5;
  bands = bands + (Math.sin(grating * 0.37 + 1.7) * 0.5 + 0.5 - bands) * 0.35;
  const foil = holoGradient(bands + viewShift * 0.5 + 0.5 * 0.25);
  const n1 = noise(u * 12 + 3.1, v * 12 + 3.1);
  const n2 = noise(u * 27 + 11, v * 27 + 11);
  const crack = 1 - Math.min(1, Math.max(0, Math.abs(n1 - n2) / 0.16));
  void crack;
  const mask = { x0: 0.02, y0: 0.02, x1: 0.98, y1: 0.98 };
  const dx = Math.max(Math.max(mask.x0 - u, u - mask.x1), 0);
  const dy = Math.max(Math.max(mask.y0 - v, v - mask.y1), 0);
  const d = Math.hypot(dx, dy);
  const feather = 0.035;
  const m = 1 - sstep(0, Math.max(feather, 0.001), d);
  const outside = variant === 'old' ? 0.015 : 0;

  let foilMask, holoAmt, baseAmt;
  if (variant === 'old') {
    foilMask = Math.min(1, Math.max(0, fresnel * 0.72 + pointerGlow * 0.45 + 0.06));
    foilMask *= 0.62 + noise(u * 8, v * 8) * 0.38;
    baseAmt = 0.02 + fresnel * 0.04;
    holoAmt = Math.min(0.7, Math.max(0, foilMask * 0.7 + spec * 0.35 + fresnel * 0.2));
  } else {
    const motion = Math.min(1, Math.max(0, fresnel * 1.15 + spec * 0.6));
    foilMask = Math.min(1, Math.max(0, motion * 0.72 + pointerGlow * 0.45)) * 0; // uHover = 0 at rest
    foilMask *= 0.62 + noise(u * 8, v * 8) * 0.38;
    baseAmt = fresnel * 0.05 * 0;
    holoAmt = Math.min(0.7, Math.max(0, foilMask * 0.7 + spec * 0.35 + fresnel * 0.2)) * 0;
  }
  // finish = holo (the store default): w1 = 1
  const effectColor = foil.map((c) => c * holoAmt);
  const effectAmt = holoAmt + baseAmt * 0; // w0 = 0 for holo
  const alpha = Math.min(1, Math.max(0, effectAmt * (outside + (1 - outside) * m) * 1.15));
  const col = effectAmt > 1e-4 ? effectColor.map((c) => Math.min(c / effectAmt, 1.6)) : [0, 0, 0];
  return { col, alpha };
}

function render(variant) {
  const out = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W, v = 1 - (y + 0.5) / H;
      const { col, alpha } = overlay(u, v, variant);
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) {
        const srgb = art[i + k] / 255;
        out[i + k] = Math.round(255 * Math.min(1, col[k] * alpha + srgb * (1 - alpha)));
      }
    }
  }
  return out;
}

const oldBuf = render('old');
const newBuf = render('new');

/* mean saturation of the foil wash over the cover's flat paper, per column */
const sat = (buf) => {
  let s = 0, n = 0;
  for (let y = Math.floor(H * 0.2); y < H * 0.4; y++) for (let x = Math.floor(W * 0.3); x < W * 0.7; x++) {
    const i = (y * W + x) * 3;
    const mx = Math.max(buf[i], buf[i + 1], buf[i + 2]), mn = Math.min(buf[i], buf[i + 1], buf[i + 2]);
    s += mx > 0 ? (mx - mn) / mx : 0; n++;
  }
  return s / n;
};
console.log('mean saturation over the cover paper (reference print is ~0.03):');
console.log('  old shader at rest:', sat(oldBuf).toFixed(3));
console.log('  new shader at rest:', sat(newBuf).toFixed(3));
console.log('  reference card    :', sat(ref).toFixed(3));

const label = async (text) =>
  Buffer.from(
    `<svg width="${W}" height="34"><rect width="100%" height="100%" fill="#111"/><text x="8" y="22" font-family="monospace" font-size="15" fill="#eee">${text}</text></svg>`
  );
const strip = await sharp({
  create: { width: W * 3 + 24, height: H + 34, channels: 3, background: '#111' },
})
  .composite([
    { input: await label('OLD shader, rest, holo'), left: 0, top: 0 },
    { input: await label('NEW shader, rest, holo'), left: W + 12, top: 0 },
    { input: await label('reference-image.jpg card'), left: W * 2 + 24, top: 0 },
    { input: await sharp(oldBuf, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), left: 0, top: 34 },
    { input: await sharp(newBuf, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), left: W + 12, top: 34 },
    { input: await sharp(ref, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), left: W * 2 + 24, top: 34 },
  ])
  .png()
  .toBuffer();
await sharp(strip).resize({ width: 1180 }).toFile('/home/user/.scratch/foil_compare.png');
console.log('wrote /home/user/.scratch/foil_compare.png');
