'use client';

import * as THREE from 'three';
import { trayLayout, type TrayLayout } from './SlabSpec';
import { squircle } from './geometry';

/* ------------------------------------------------------------------ *
 * Seeded RNG so the wear maps look identical every load (and match
 * between the Forge and the pit).
 * ------------------------------------------------------------------ */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

/** Blend two #rrggbb colours; t = 0 keeps `a`, t = 1 returns `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const s = h.replace('#', '');
    const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

function toTexture(canvas: HTMLCanvasElement, { srgb = false } = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ *
 * Silhouette
 * ------------------------------------------------------------------ */

/**
 * Clip to the very outline the geometry is extruded from, so the drawn face
 * and the card body share one silhouette: no dark corners peeking past the
 * rounded edges, and the alpha-tested edge lines up to the pixel.
 */
export function clipSquircle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  radius: number,
  power: number,
  segs = 24
) {
  const pts = squircle(w, h, radius, power, segs).getPoints();
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = w / 2 + p.x;
    const y = h / 2 - p.y; // shape space is y-up, canvas is y-down
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
}

/* ------------------------------------------------------------------ *
 * Wear maps: roughness / bump for the moulded plastic
 * ------------------------------------------------------------------ */

export interface WearMaps {
  /** roughness map: smudges and scuffs read as matte patches */
  roughness: THREE.CanvasTexture;
  /** bump map: the same features, so they catch the strip lights */
  bump: THREE.CanvasTexture;
  /** plain 1x1 white, for slabs that want no wear */
  none: THREE.Texture;
}

let wearCache: WearMaps | null = null;

export function getWearMaps(size = 1024): WearMaps {
  if (wearCache) return wearCache;
  const { canvas, ctx } = makeCanvas(size, size);
  const r = rng(0x51ab);
  const W = size;
  const H = size;

  // base: mid-rough plastic with a faint vertical moulding sheen
  const base = ctx.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#8a8a8a');
  base.addColorStop(0.35, '#7d7d7d');
  base.addColorStop(1, '#8f8f8f');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // fingerprints: soft elongated smudges, slightly *smoother* than the base
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 26; i++) {
    const cx = r() * W;
    const cy = r() * H;
    const rx = (0.02 + r() * 0.07) * W;
    const ry = rx * (0.35 + r() * 0.5);
    const rot = r() * Math.PI;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    const v = 26 + r() * 22;
    g.addColorStop(0, `rgba(${128 - v},${128 - v},${128 - v},0.55)`);
    g.addColorStop(0.65, `rgba(${128 - v},${128 - v},${128 - v},0.18)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(1, ry / rx);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // micro scratches: short bright hairlines
  for (let i = 0; i < 260; i++) {
    const x = r() * W;
    const y = r() * H;
    const len = (0.004 + r() * 0.05) * W;
    const ang = (r() - 0.5) * 0.9 + (r() < 0.5 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.4;
    const bright = 150 + r() * 90;
    ctx.strokeStyle = `rgba(${bright},${bright},${bright},${0.12 + r() * 0.22})`;
    ctx.lineWidth = r() < 0.8 ? 0.7 : 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
    // occasional scuff pairs
    if (r() < 0.22) {
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 2);
      ctx.lineTo(x + 2 + Math.cos(ang) * len * 0.7, y + 2 + Math.sin(ang) * len * 0.7);
      ctx.stroke();
    }
  }

  // edge wear: darken (rougher) a soft vignette toward the silhouette
  const edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.56);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(0.72, 'rgba(24,24,24,0.22)');
  edge.addColorStop(1, 'rgba(40,40,40,0.5)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);

  const roughness = toTexture(canvas);

  // bump: reuse the same drawing inverted and blurred a touch
  const { canvas: bc, ctx: bctx } = makeCanvas(size, size);
  bctx.filter = 'blur(1.2px)';
  bctx.drawImage(canvas, 0, 0);
  bctx.filter = 'none';
  bctx.globalCompositeOperation = 'difference';
  bctx.fillStyle = '#ffffff';
  bctx.fillRect(0, 0, W, H);
  const bump = toTexture(bc);

  const none = new THREE.Texture();
  none.needsUpdate = true;

  wearCache = { roughness, bump, none };
  return wearCache;
}

/* ------------------------------------------------------------------ *
 * Card face: frame, title, art window, attribute rows, name banner.
 * The art itself is drawn separately (the caller passes the loaded image),
 * and the card carries no CSS — everything is vector, so it scales.
 * ------------------------------------------------------------------ */

export interface CardFaceText {
  title: string;
  collection: string;
  serial: string;
  handle: string;
  grade: string;
  /** attribute chips: [label, value] */
  traits: [string, string][];
  dark: boolean;
  tint: string;
  /** card face px */
  width: number;
  height: number;
  /** corner radius as a fraction of the width - matches the card geometry */
  bodyRadius: number;
  /** squircle power, from SLAB_SPEC */
  cornerPower: number;
  /* ---- face layout, straight from SLAB_SPEC ----
   * `ringInset`/`ringWidth` and `keylineWidth` are fractions of the card
   * *width* but are applied as the same number of pixels on both axes: the
   * reference's border is 8 px on the sides and 8-9 px top and bottom, i.e.
   * isotropic. Scaling them by H as well, which the old code did, made the
   * top and bottom bands 1.4x too thick. */
  ringInset: number;
  ringWidth: number;
  ringRadius: number;
  /** the thin white line that rims the art window, in card widths */
  keylineWidth: number;
  artInset: number;
  artWidth: number;
  artTop: number;
  artHeight: number;
  /** measured ink/paper, sampled off the reference photo */
  paperColour: string;
  inkColour: string;
}

/**
 * Measured furniture of the band below the art window, as fractions of that
 * band. Read off the reference: the band runs y 963..1198 (235 px) and the
 * light rows sit at 986-1000 (title), 1016-1037 / 1052-1073 / 1090-1111
 * (a 2-column x 3-row grid), a full-width white rule at 1122-1124, two footer
 * lines at 1130-1138 and 1150-1157, another rule at 1166, and the owner line
 * at 1176-1185.
 */
const BAND = {
  title: 0.098,
  titleSize: 0.089,
  gridTop: 0.2,
  gridPitch: 0.164,
  gridRows: 3,
  labelSize: 0.049,
  valueSize: 0.055,
  ruleTop: 0.677,
  ruleWeight: 0.013,
  footA: 0.711,
  footB: 0.796,
  footSize: 0.055,
  rule2: 0.864,
  owner: 0.906,
  ownerSize: 0.062,
  colGap: 0.115,
};

export function drawCardFace(
  ctx: CanvasRenderingContext2D,
  o: CardFaceText,
  art: HTMLImageElement | null,
  artBox: { x: number; y: number; w: number; h: number },
  ring: { inset: number; width: number; radius: number }
) {
  const { width: W, height: H } = o;
  const bodyRadius = (o.bodyRadius ?? 0.0568) * W;
  const power = o.cornerPower ?? 4.6;
  const ink = o.inkColour ?? (o.dark ? '#F7F5F2' : '#141414');
  const paper = o.paperColour ?? (o.dark ? '#101014' : '#F4F2EE');
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  clipSquircle(ctx, W, H, bodyRadius, power);

  // ---- card body (the dark/light panel inside the frame)
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  /* ---- white border. Measured at 8 px on the sides, 8-9 px top and bottom,
   * starting ~1 px inside the card's silhouette, so it is a stroke centred
   * ringInset*W from the edge and it is the SAME pixel width on both axes. */
  const ringPx = Math.max(1.5, ring.width * W);
  const ringOff = ring.inset * W;
  const rRad = Math.max(2, ring.radius * W);
  ctx.lineWidth = ringPx;
  ctx.strokeStyle = ink;
  roundRect(ctx, ringOff, ringOff, W - ringOff * 2, H - ringOff * 2, rRad);
  ctx.stroke();

  // ---- art window
  const { x: ax, y: ay, w: aw, h: ah } = artBox;
  ctx.fillStyle = o.tint;
  ctx.fillRect(ax, ay, aw, ah);
  if (art) {
    // cover-fit into the window
    const ir = art.width / art.height;
    const wr = aw / ah;
    let sx = 0, sy = 0, sw = art.width, sh = art.height;
    if (ir > wr) { sw = art.height * wr; sx = (art.width - sw) / 2; }
    else { sh = art.width / wr; sy = (art.height - sh) / 2; }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art, sx, sy, sw, sh, ax, ay, aw, ah);
  }

  /* ---- the keyline: a second, thinner white line that rims the art window
   * on the outside. The photo shows it clearly (8 px, x 528..535 / 957..964)
   * and the old painter did not draw it at all, which is why the art looked
   * like it was floating straight on the panel. Stroking a rect inflated by
   * half the line width puts the stroke's inner edge exactly on the art. */
  const key = Math.max(1, (o.keylineWidth ?? 0.0163) * W);
  ctx.lineWidth = key;
  ctx.strokeStyle = ink;
  roundRect(ctx, ax - key / 2, ay - key / 2, aw + key, ah + key, key * 0.6);
  ctx.stroke();

  /* ---- furniture below the art window -----------------------------------
   * The art takes artTop..1-artBottom of the card height (measured
   * 0.0488..0.6528), so everything else lives in the band under it. The band
   * stops at the top of the bottom border, not at the card's edge. */
  const bandTop = ay + ah;
  const band = (H - ringOff - ringPx / 2) - bandTop;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  // ---- title
  const titleSize = Math.max(9, band * BAND.titleSize);
  ctx.fillStyle = ink;
  ctx.font = `700 ${titleSize}px ${sans}`;
  ctx.fillText(o.title, ax, bandTop + band * BAND.title);

  // ---- attribute grid: 2 columns x 3 rows, hairline rule down each column
  const colGap = aw * BAND.colGap;
  const colW = (aw - colGap) / 2;
  const labelSize = Math.max(6, band * BAND.labelSize);
  const valueSize = Math.max(6, band * BAND.valueSize);
  const ruleW = Math.max(1, W * 0.0022);
  const traits = o.traits ?? [];
  for (let i = 0; i < BAND.gridRows * 2; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = ax + col * (colW + colGap);
    const cy = bandTop + band * (BAND.gridTop + row * BAND.gridPitch);
    const [label, value] = traits[i] ?? ['—', '—'];
    // the vertical hairline: one continuous rule per column, as in the photo
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(cx, cy, ruleW, valueSize * 2.6);
    ctx.globalAlpha = 1;
    ctx.font = `700 ${labelSize}px ${sans}`;
    ctx.globalAlpha = 0.62;
    ctx.fillText(label.toUpperCase(), cx + W * 0.014, cy);
    ctx.font = `400 ${valueSize}px ${sans}`;
    ctx.globalAlpha = 0.9;
    ctx.fillText(value, cx + W * 0.014, cy + labelSize * 1.45);
    ctx.globalAlpha = 1;
  }

  // ---- a full-width white rule between the grid and the footer
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = ink;
  ctx.fillRect(ax, bandTop + band * BAND.ruleTop, aw, Math.max(1, band * BAND.ruleWeight));
  ctx.globalAlpha = 1;

  // ---- two footer lines
  const footSize = Math.max(6, band * BAND.footSize);
  ctx.font = `400 ${footSize}px ${sans}`;
  ctx.globalAlpha = 0.72;
  ctx.fillText(`COLLECTION: ${o.collection}`, ax, bandTop + band * BAND.footA);
  ctx.fillText(`TOKEN ID: ${String(o.serial).split('/')[0]}`, ax + colW + colGap, bandTop + band * BAND.footA);
  ctx.fillText(`STANDARD: ERC-721`, ax, bandTop + band * BAND.footB);
  ctx.fillText(`CHAIN: Ethereum`, ax + colW + colGap, bandTop + band * BAND.footB);
  ctx.globalAlpha = 1;

  // ---- second rule, then the owner strip
  ctx.globalAlpha = 0.8;
  ctx.fillRect(ax, bandTop + band * BAND.rule2, aw, Math.max(1, band * BAND.ruleWeight * 0.8));
  ctx.globalAlpha = 1;
  ctx.font = `700 ${Math.max(7, band * BAND.ownerSize)}px ${sans}`;
  ctx.fillText(`OWNED BY: ${o.handle}`, ax, bandTop + band * BAND.owner);
  ctx.textAlign = 'right';
  ctx.fillText(o.serial, ax + aw, bandTop + band * BAND.owner);
  ctx.textAlign = 'left';

  ctx.restore();
}

/** Canvas facing the card's front: face text + art. */
export function buildCardFace(o: CardFaceText, art: HTMLImageElement | null): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(o.width, o.height);
  const M = o.width; // face pixel width
  drawCardFace(
    ctx,
    o,
    art,
    { x: M * o.artInset, y: o.height * o.artTop, w: M * o.artWidth, h: o.height * o.artHeight },
    { inset: o.ringInset, width: o.ringWidth, radius: o.ringRadius }
  );
  return toTexture(canvas, { srgb: true });
}

/** Card back: real branded backs where available, else a drawn spine. */
/** Draw an image filling a box, cropping the long side (the cover fit). */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const ir = img.width / img.height;
  const br = w / h;
  let sw = img.width;
  let sh = img.height;
  let sx = 0;
  let sy = 0;
  if (ir > br) {
    sw = img.height * br;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / br;
    sy = (img.height - sh) / 2;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/**
 * Card back. With a photo (a real branded back from the set) it is cover-fit
 * inside the card's silhouette; without one it draws a night-sky fallback so
 * the plane is never blank while the image loads.
 */
export function drawCardBack(
  ctx: CanvasRenderingContext2D,
  style: 'generic' | 'photo',
  w: number,
  h: number,
  bodyRadius = w * 0.0568,
  power = 4.6,
  photo: HTMLImageElement | null = null
) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  clipSquircle(ctx, w, h, bodyRadius, power);
  if (style === 'photo' && photo) {
    drawCover(ctx, photo, 0, 0, w, h);
    // a little vignette so the photo sits in the card rather than on it
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }
  if (style === 'generic' || !photo) {
    ctx.fillStyle = '#141418';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#F5F3EF';
    ctx.lineWidth = w * 0.02;
    roundRect(ctx, w * 0.06, h * 0.05, w * 0.88, h * 0.9, w * 0.05);
    ctx.stroke();
    ctx.fillStyle = '#F5F3EF';
    ctx.textAlign = 'center';
    ctx.font = `700 ${w * 0.1}px system-ui, sans-serif`;
    ctx.fillText('NEMO', w / 2, h * 0.48);
    ctx.font = `400 ${w * 0.05}px system-ui, sans-serif`;
    ctx.fillText('GRADED SLAB', w / 2, h * 0.56);
  }
  ctx.restore();
}

export function buildCardBack(style: 'generic', w = 512, h = 722): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(w, h);
  drawCardBack(ctx, style, w, h);
  return toTexture(canvas, { srgb: true });
}

/* ------------------------------------------------------------------ *
 * Label plate: title, grade, serial, logo mark, and the QR block
 * ------------------------------------------------------------------ */

export interface LabelText {
  title: string;
  grade: string;
  serial: string;
  width: number;
  height: number;
  /** inner border colour */
  accent: string;
  /** plate colour */
  plate: string;
  ink: string;
  /** draw the QR block on the right (blank variant skips it) */
  qr: boolean;
  blank?: boolean;
}

export function drawLabel(ctx: CanvasRenderingContext2D, o: LabelText) {
  const { width: W, height: H } = o;
  ctx.fillStyle = o.blank ? '#FFFFFF' : o.plate;
  ctx.fillRect(0, 0, W, H);

  if (o.blank) {
    // blank variant: just the recessed frame, ready for the upload path
    ctx.strokeStyle = '#D8D5D0';
    ctx.lineWidth = W * 0.012;
    roundRect(ctx, W * 0.03, H * 0.09, W * 0.94, H * 0.82, H * 0.12);
    ctx.stroke();
    return;
  }

  // the plate is moulded, so it is a shade lighter along the top than the
  // bottom — the reference reads a touch of that even in flat light
  const plateGrad = ctx.createLinearGradient(0, 0, 0, H);
  plateGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
  plateGrad.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = plateGrad;
  ctx.fillRect(0, 0, W, H);

  /* Thin inner border, mirroring the moulded rim. Measured: the plate is
   * 578 px wide and the bright rim runs 4 px in from its edge (x 450..453 sits
   * just outside the plate body at 455), so inset ~0.007 W and ~0.0035 W
   * thick. It is a pale line, not a coloured one: in the reference the only
   * colour on the plate is inside the mark. */
  const inset = W * 0.007;
  ctx.strokeStyle = 'rgba(234,240,248,0.42)';
  ctx.lineWidth = Math.max(1, W * 0.0035);
  roundRect(ctx, inset, inset, W - inset * 2, H - inset * 2, Math.max(2, H * 0.055 - inset));
  ctx.stroke();
  ctx.globalAlpha = 1;

  /* Measured label anatomy (plate 578 x 150 px at x 455..1033, y 228..378):
   *   title line 1   x 495..751   y 265..295   (cap 31 px)
   *   title line 2   x 487..767   y 307..337   (cap 31 px, pitch 42 px)
   *   mark block     x 898..986   y 265..345   (~88 x 80, orange + white)
   *   nothing else — the strip between the title and the mark is bare plate. */
  const pad = W * 0.062; // title inset: 36 px / 578
  const markPad = W * 0.087; // mark inset: 50 px / 578
  const centreY = H / 2;

  /* ---- right: the QR block, orange finders on a dark tile ---- */
  const q = H * 0.55;
  const qx = W - markPad - q;
  const qy = centreY - q / 2;
  // the mark: a QR-style tile whose three finder squares carry the card's own
  // colour, which is where the label's accent lives (the reference puts its
  // coloured logo glyph in exactly this corner of the plate)
  ctx.fillStyle = mixHex(o.plate, '#000000', 0.42);
  ctx.fillRect(qx, qy, q, q);
  ctx.strokeStyle = 'rgba(233,239,247,0.22)';
  ctx.lineWidth = Math.max(1, W * 0.0018);
  ctx.strokeRect(qx, qy, q, q);
  const n = 9;
  const cell = q / n;
  const r = rng(0x9e37);
  ctx.fillStyle = o.ink;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const finder = (x < 3 && y < 3) || (x > n - 4 && y < 3) || (x < 3 && y > n - 4);
      if (finder) continue;
      if (r() > 0.58) {
        ctx.globalAlpha = 0.62;
        ctx.fillRect(qx + x * cell, qy + y * cell, cell * 0.84, cell * 0.84);
      }
    }
  }
  ctx.globalAlpha = 1;
  const finderAt = (fx: number, fy: number) => {
    ctx.fillStyle = o.accent;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(qx + fx * cell, qy + fy * cell, cell * 3, cell * 3);
    ctx.fillStyle = mixHex(o.plate, '#000000', 0.42);
    ctx.fillRect(qx + (fx + 1) * cell, qy + (fy + 1) * cell, cell, cell);
    ctx.globalAlpha = 1;
  };
  finderAt(0, 0);
  finderAt(n - 3, 0);
  finderAt(0, n - 3);

  /* ---- left: a two-line heavy title, shrunk and then trimmed to fit ----
   * Measured: the widest line runs to 0.540 of the plate (x 767 of 578) and
   * the block is centred, leaving 37 px of bare plate above and 41 px below. */
  const heavy = (px: number) =>
    `800 ${px}px "Arial Black", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const lines = o.title
    .split('\n')
    .slice(0, 2)
    .map((l) => l.toUpperCase());
  const avail = W * 0.545 - pad;
  let size = H * 0.3;
  for (; size > H * 0.135; size -= 1) {
    ctx.font = heavy(size);
    if (Math.max(...lines.map((l) => ctx.measureText(l).width)) <= avail) break;
  }
  ctx.font = heavy(size);
  const fitted = lines.map((l) => {
    if (ctx.measureText(l).width <= avail) return l;
    let cut = l;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > avail) cut = cut.slice(0, -1);
    return `${cut}…`;
  });

  // the reference stacks its two lines on a 42 px pitch with a 31 px cap, i.e.
  // a leading of ~0.98 em, and centres the block on the plate
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lead = size * 0.98;
  const blockTop = centreY - ((fitted.length - 1) * lead) / 2;
  ctx.fillStyle = o.ink;
  fitted.forEach((line, i) => {
    ctx.globalAlpha = i === 0 ? 1 : 0.92;
    ctx.fillText(line, pad, blockTop + i * lead);
  });
  ctx.globalAlpha = 1;

  /* ---- grade + serial. The reference leaves the band under the title bare,
   * but a slab card has to carry them somewhere and the mark block is the only
   * other furniture, so they go here at a size the photo would read as plate
   * tone rather than type. Drop this block to match a blank plate exactly. */
  const foot = Math.max(5, H * 0.085);
  ctx.font = `600 ${foot}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.46;
  ctx.fillText(`GRADE ${o.grade}`, pad, centreY + lead * 0.5 + foot * 1.5);
  ctx.globalAlpha = 0.3;
  ctx.fillText(o.serial, pad + ctx.measureText(`GRADE ${o.grade}  `).width, centreY + lead * 0.5 + foot * 1.5);
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'top';
}

export function buildLabelTexture(o: LabelText): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(o.width, o.height);
  drawLabel(ctx, o);
  return toTexture(canvas, { srgb: true });
}

/* ------------------------------------------------------------------ *
 * Tray / window textures with baked ambient occlusion
 * ------------------------------------------------------------------ */

export function drawTray(ctx: CanvasRenderingContext2D, w: number, h: number, layout: TrayLayout) {
  /* The photo's window floor is almost perfectly flat. Sampled in four places
   * round the card it reads #433640 / #483c46 / #463a44 / #453942 - a spread of
   * 1.4 L* over 1000 px, sd 0.7-1.4 inside each patch. The old gradient ran
   * #57494f -> #3b3139, a 28-point swing that never appears in the reference,
   * so the base is now flat and everything else is a few L* on top. */
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#453a42');
  g.addColorStop(0.45, '#443943');
  g.addColorStop(1, '#413643');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // the key light is off the upper right: the whole floor lifts a couple of
  // points toward that corner, and only a couple
  const key = ctx.createLinearGradient(0, 0, w, h * 0.35);
  key.addColorStop(0, 'rgba(0,0,0,0.05)');
  key.addColorStop(0.55, 'rgba(0,0,0,0)');
  key.addColorStop(1, 'rgba(214,224,242,0.05)');
  ctx.fillStyle = key;
  ctx.fillRect(0, 0, w, h);

  /* retaining wells. The reference's apron is only 23 px tall (0.035 of the
   * slab) and shows no pockets at all, so SLAB_SPEC carries `slots: 0` and
   * this loop is a no-op — it stays here so a well can be switched back on. */
  for (const slot of layout.slots) {
    const sw = Math.max(2, slot.w * w);
    const sh = slot.h * h;
    const sx = slot.x * w;
    const sy = slot.y * h;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(sx, sy, sw, sh);
    const sg = ctx.createLinearGradient(0, sy + sh, 0, sy + sh + h * 0.02);
    sg.addColorStop(0, 'rgba(0,0,0,0.14)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - sw * 2, sy + sh, sw * 5, h * 0.02);
  }

  /* Contact shadow around the card cutout. There is essentially none in the
   * photo: the floor immediately left of the card reads #433640 and
   * immediately right of it #483c46, against #453a43 in the open apron — a
   * 1.4 L* difference that is entirely explained by the key light. The card
   * sits flush in its recess, so this is a hairline, not the wide well the
   * old texture painted. */
  const cw = layout.card.w * w;
  const ch = layout.card.h * h;
  const cx = layout.card.x * w;
  const cy = layout.card.y * h;
  const pad = Math.max(3, w * 0.012);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = pad * 0.7;
  ctx.shadowOffsetY = pad * 0.12;
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  roundRect(ctx, cx - pad * 0.15, cy - pad * 0.15, cw + pad * 0.3, ch + pad * 0.3, w * 0.05);
  ctx.fill();
  ctx.restore();

  // the lip: a single faint light line hugging the cutout, nothing more
  ctx.strokeStyle = 'rgba(226,233,244,0.055)';
  ctx.lineWidth = Math.max(1, w * 0.0035);
  roundRect(ctx, cx - pad * 0.5, cy - pad * 0.5, cw + pad, ch + pad, w * 0.055);
  ctx.stroke();

  /* Under the ridge the floor darkens for about 5% of the window height, then
   * the apron returns to the flat floor tone: the apron samples at #453942,
   * the same as the side strips. */
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.05);
  top.addColorStop(0, 'rgba(0,0,0,0.16)');
  top.addColorStop(0.6, 'rgba(0,0,0,0.05)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.05);

  // the bottom ledge: a couple of points down, then back up as it catches light
  const bottom = ctx.createLinearGradient(0, h, 0, h * 0.95);
  bottom.addColorStop(0, 'rgba(0,0,0,0.05)');
  bottom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.95, w, h * 0.05);
  const bottomLight = ctx.createLinearGradient(0, h, 0, h * 0.97);
  bottomLight.addColorStop(0, 'rgba(196,206,224,0.05)');
  bottomLight.addColorStop(1, 'rgba(196,206,224,0)');
  ctx.fillStyle = bottomLight;
  ctx.fillRect(0, h * 0.97, w, h * 0.03);

  /* Side walls. The left rail reads #433841 and the right #9e919b, but that
   * asymmetry lives on the SHELL, not the tray: inside the window the two
   * side strips are both ~#453a43. So the tray keeps a hair of light piped
   * down each acrylic wall and no more. */
  const sideL = ctx.createLinearGradient(0, 0, w * 0.06, 0);
  sideL.addColorStop(0, 'rgba(198,208,226,0.05)');
  sideL.addColorStop(0.35, 'rgba(0,0,0,0.03)');
  sideL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideL;
  ctx.fillRect(0, 0, w * 0.06, h);
  const streakL = ctx.createLinearGradient(w * 0.03, 0, w * 0.09, 0);
  streakL.addColorStop(0, 'rgba(210,220,238,0)');
  streakL.addColorStop(0.5, 'rgba(214,224,242,0.05)');
  streakL.addColorStop(1, 'rgba(210,220,238,0)');
  ctx.fillStyle = streakL;
  ctx.fillRect(w * 0.03, 0, w * 0.06, h);

  const streakR = ctx.createLinearGradient(w * 0.91, 0, w, 0);
  streakR.addColorStop(0, 'rgba(210,220,238,0)');
  streakR.addColorStop(0.5, 'rgba(218,228,244,0.055)');
  streakR.addColorStop(1, 'rgba(222,232,248,0.06)');
  ctx.fillStyle = streakR;
  ctx.fillRect(w * 0.91, 0, w * 0.09, h);
  const sideR = ctx.createLinearGradient(w, 0, w * 0.94, 0);
  sideR.addColorStop(0, 'rgba(212,222,238,0.07)');
  sideR.addColorStop(0.35, 'rgba(0,0,0,0.01)');
  sideR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideR;
  ctx.fillRect(w * 0.94, 0, w * 0.06, h);
}

export function buildTrayTexture(w = 512, h = 768, layout: TrayLayout = trayLayout()): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(w, h);
  drawTray(ctx, w, h, layout);
  return toTexture(canvas, { srgb: true });
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

