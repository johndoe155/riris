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
  /* ---- face layout, straight from SLAB_SPEC ---- */
  ringInset: number;
  ringWidth: number;
  ringRadius: number;
  artInset: number;
  artWidth: number;
  artTop: number;
  artHeight: number;
}

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
  const ink = o.dark ? '#F7F5F2' : '#141414';
  const paper = o.dark ? '#101014' : '#F4F2EE';

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  clipSquircle(ctx, W, H, bodyRadius, power);

  // ---- card body (the dark/light panel inside the frame)
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // ---- ring frame
  const rx = ring.inset * W;
  const ry = ring.inset * H;
  const rw = W - rx * 2;
  const rh = H - ry * 2;
  const rRad = Math.max(2, ring.radius * W);
  ctx.lineWidth = Math.max(1.5, ring.width * W);
  ctx.strokeStyle = ink;
  roundRect(ctx, rx, ry, rw, rh, rRad);
  ctx.stroke();

  // ---- art window with a thin border
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
  ctx.lineWidth = Math.max(1, W * 0.0035);
  ctx.strokeStyle = ink;
  ctx.strokeRect(ax, ay, aw, ah);

  /* ---- furniture below the art window -----------------------------------
   * The art takes 0.036..0.664 of the card height, so everything else has to
   * live in the bottom third. The positions below are walked down from the art
   * in fractions of that band, which is why nothing can overlap. */
  const bandTop = ay + ah;
  const band = H - bandTop;

  // ---- title under the art
  const titleSize = Math.max(11, Math.min(W * 0.048, band * 0.11));
  ctx.fillStyle = ink;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = `700 ${titleSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(o.title, ax, bandTop + band * 0.05);

  // ---- attribute grid (2 columns x 3 rows), hairline rules like the photo
  const gridTop = bandTop + band * 0.2;
  const rowH = (band * 0.44) / 3;
  const colW = (aw - W * 0.03) / 2;
  const attrSize = Math.max(7, W * 0.021);
  const valSize = Math.max(7, W * 0.0195);
  const traits = o.traits ?? [];
  for (let i = 0; i < 6; i++) {
    const cx = ax + (i % 2) * (colW + W * 0.03);
    const cy = gridTop + Math.floor(i / 2) * rowH;
    const [label, value] = traits[i] ?? ['—', '—'];
    // rule
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(cx, cy, Math.max(1, W * 0.002), valSize * 3.1);
    ctx.globalAlpha = 1;
    ctx.font = `700 ${attrSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(label.toUpperCase(), cx + W * 0.012, cy);
    ctx.font = `400 ${valSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.globalAlpha = 0.78;
    ctx.fillText(value, cx + W * 0.012, cy + attrSize * 1.5);
    ctx.globalAlpha = 1;
  }

  // ---- bottom rows: contract / token id / standard / chain + owner bar
  const footTop = gridTop + rowH * 3 + band * 0.04;
  const footSize = Math.max(7, W * 0.0195);
  ctx.font = `400 ${footSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.globalAlpha = 0.72;
  ctx.fillText(`COLLECTION: ${o.collection}`, ax, footTop);
  ctx.fillText(`TOKEN ID: ${String(o.serial).split('/')[0]}`, ax, footTop + footSize * 1.5);
  ctx.fillText(`STANDARD: ERC-721`, ax + colW + W * 0.03, footTop);
  ctx.fillText(`CHAIN: Ethereum`, ax + colW + W * 0.03, footTop + footSize * 1.5);
  ctx.globalAlpha = 1;

  // owner strip along the bottom edge
  const barY = H - band * 0.13;
  ctx.font = `700 ${Math.max(8, W * 0.022)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(`OWNED BY: ${o.handle}`, ax, barY);
  ctx.textAlign = 'right';
  ctx.fillText(o.serial, ax + aw, barY);
  ctx.textAlign = 'left';

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

  // thin inner border, mirroring the moulded ridge: a pale line, not a
  // coloured one — the reference's frame is white/neutral and the colour in
  // the header comes from the mark at the right
  // the line hugs the plate, the way the reference's highlight does, and its
  // radius has to be the plate's own (SLAB_SPEC.labelRadius is a fraction of
  // min(w, h), i.e. H*0.055 in this texture)
  const inset = W * 0.008;
  ctx.strokeStyle = 'rgba(234,240,248,0.5)';
  ctx.lineWidth = Math.max(1, W * 0.0036);
  roundRect(ctx, inset, inset, W - inset * 2, H - inset * 2, Math.max(2, H * 0.055 - inset));
  ctx.stroke();
  ctx.globalAlpha = 1;

  const pad = W * 0.065;
  const centreY = H / 2;

  /* ---- right: the QR block, with the grade and serial stacked to its left */
  const q = H * 0.56;
  const qx = W - pad - q;
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

  /* ---- zones: title | grade + serial | mark, so nothing can collide ---- */
  // the reference's widest title line runs to 0.55 of the plate; our titles are
  // longer words, so the zone ends just short of the divider and the fit loop
  // scales the type down when it has to
  const titleZone = W * 0.52;
  const markRight = W * 0.79;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.ink;
  ctx.globalAlpha = 0.92;
  ctx.font = `800 ${H * 0.26}px "Arial Black", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(o.grade, markRight, centreY - H * 0.1);
  ctx.globalAlpha = 0.55;
  ctx.font = `600 ${H * 0.14}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(o.serial, markRight, centreY + H * 0.2);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';

  // hairline divider between the title and the marks — neutral, like the inner
  // border, so the plate stays dark and only the mark carries colour
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = o.ink;
  ctx.fillRect(W * 0.53, H * 0.22, Math.max(1, W * 0.0014), H * 0.56);
  ctx.globalAlpha = 1;

  /* ---- left: a two-line heavy title, shrunk and then trimmed to fit ---- */
  const heavy = (px: number) =>
    `800 ${px}px "Arial Black", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const lines = o.title
    .split('\n')
    .slice(0, 2)
    .map((l) => l.toUpperCase());
  const avail = titleZone - pad;
  let size = H * 0.31;
  for (; size > H * 0.12; size -= 2) {
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

  // the reference stacks its two lines tight: cap 0.224 of the plate, 1.26 caps
  // of leading, so the block spans half the plate and sits centred
  const lead = size * 0.92;
  const blockTop = centreY - ((fitted.length - 1) * lead) / 2;
  ctx.fillStyle = o.ink;
  fitted.forEach((line, i) => {
    ctx.globalAlpha = i === 0 ? 1 : 0.9;
    ctx.fillText(line, pad, blockTop + i * lead);
  });
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
  // smoky plate, tuned to the window floor tone sampled off the reference: the
  // case is translucent, so the floor never goes black under the card — it
  // stays a mauve-smoke that is lighter at the top where the window is open
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#57494f');
  g.addColorStop(0.45, '#463a44');
  g.addColorStop(1, '#3b3139');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // retaining wells above the card, with their own baked shadow and lip
  for (const slot of layout.slots) {
    const sw = Math.max(2, slot.w * w);
    const sh = slot.h * h;
    const sx = slot.x * w;
    const sy = slot.y * h;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = 'rgba(196,206,222,0.34)';
    ctx.fillRect(sx + sw * 0.5, sy + sh * 0.03, Math.max(1, sw * 0.32), sh * 0.94);
    const sg = ctx.createLinearGradient(0, sy + sh, 0, sy + sh + h * 0.035);
    sg.addColorStop(0, 'rgba(0,0,0,0.4)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - sw * 2, sy + sh, sw * 5, h * 0.035);
  }

  // baked AO around the card cutout: a contact shadow that grows with the lip
  const cw = layout.card.w * w;
  const ch = layout.card.h * h;
  const cx = layout.card.x * w;
  const cy = layout.card.y * h;
  const pad = Math.max(6, w * 0.028);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.78)';
  ctx.shadowBlur = pad * 1.5;
  ctx.shadowOffsetY = pad * 0.22;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, cx, cy, cw, ch, w * 0.05);
  ctx.fill();
  ctx.restore();

  // inner lip: a light line hugging the cutout, then a dark line just inside it
  ctx.strokeStyle = 'rgba(226,233,244,0.20)';
  ctx.lineWidth = Math.max(1, w * 0.0045);
  roundRect(ctx, cx - pad * 0.42, cy - pad * 0.42, cw + pad * 0.84, ch + pad * 0.84, w * 0.055);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(1, w * 0.006);
  roundRect(ctx, cx + pad * 0.1, cy + pad * 0.1, cw - pad * 0.2, ch - pad * 0.2, w * 0.045);
  ctx.stroke();

  // ambient occlusion under the label ridge: a thin band, because most of the
  // apron above the card is lit by the open window, not shadowed
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.055);
  top.addColorStop(0, 'rgba(0,0,0,0.6)');
  top.addColorStop(0.5, 'rgba(0,0,0,0.22)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.055);

  // frosted wash over the apron between the ridge and the card: light comes
  // through the open window and the moulded lip picks it up. Measured off the
  // reference (apron centre ~#887b85 vs a black tray at ~#5c4e5b) — centre
  // weighted, because the rails beside it stay dark.
  const apron = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, w * 0.82);
  apron.addColorStop(0, 'rgba(220,228,244,0.42)');
  apron.addColorStop(0.5, 'rgba(210,218,236,0.26)');
  apron.addColorStop(1, 'rgba(200,208,226,0)');
  ctx.save();
  ctx.fillStyle = apron;
  ctx.fillRect(0, 0, w, h * 0.16);
  ctx.restore();

  // ...and one along the bottom wall the card leans on. Kept light: the
  // reference reads this ledge at ~#43374 1, well above the side troughs, so the
  // card's contact shadow is a thin line rather than a wide well.
  const bottom = ctx.createLinearGradient(0, h, 0, h * 0.94);
  bottom.addColorStop(0, 'rgba(0,0,0,0.07)');
  bottom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
  // the bottom wall still catches some light through the acrylic
  const bottomLight = ctx.createLinearGradient(0, h, 0, h * 0.96);
  bottomLight.addColorStop(0, 'rgba(196,206,224,0.16)');
  bottomLight.addColorStop(1, 'rgba(196,206,224,0)');
  ctx.fillStyle = bottomLight;
  ctx.fillRect(0, h * 0.96, w, h * 0.04);

  // side walls: a thin lit rail, then the tray falls away into shadow — the
  // reference reads the rails *darker* than the plate, not brighter
  const sideL = ctx.createLinearGradient(0, 0, w * 0.075, 0);
  sideL.addColorStop(0, 'rgba(198,208,226,0.16)');
  sideL.addColorStop(0.3, 'rgba(0,0,0,0.12)');
  sideL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideL;
  ctx.fillRect(0, 0, w * 0.075, h);
  // light piped down the acrylic wall, just inside each rail — the streaks the
  // reference shows running the height of the window
  const streakL = ctx.createLinearGradient(w * 0.04, 0, w * 0.115, 0);
  streakL.addColorStop(0, 'rgba(210,220,238,0)');
  streakL.addColorStop(0.45, 'rgba(214,224,242,0.2)');
  streakL.addColorStop(1, 'rgba(210,220,238,0)');
  ctx.fillStyle = streakL;
  ctx.fillRect(w * 0.04, 0, w * 0.075, h);
  // the right rail runs brighter than the left all the way to the moulding —
  // the reference's key light is off to that side
  const streakR = ctx.createLinearGradient(w * 0.885, 0, w, 0);
  streakR.addColorStop(0, 'rgba(210,220,238,0)');
  streakR.addColorStop(0.45, 'rgba(218,228,244,0.22)');
  streakR.addColorStop(0.85, 'rgba(222,232,248,0.2)');
  streakR.addColorStop(1, 'rgba(222,232,248,0.22)');
  ctx.fillStyle = streakR;
  ctx.fillRect(w * 0.885, 0, w * 0.115, h);

  const sideR = ctx.createLinearGradient(w, 0, w * 0.925, 0);
  sideR.addColorStop(0, 'rgba(212,222,238,0.26)');
  sideR.addColorStop(0.3, 'rgba(0,0,0,0.04)');
  sideR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideR;
  ctx.fillRect(w * 0.925, 0, w * 0.075, h);
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

