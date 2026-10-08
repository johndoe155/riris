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

  // ---- title under the art
  const titleY = ay + ah + ah * 0.08;
  ctx.fillStyle = ink;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const titleSize = W * 0.045;
  ctx.font = `700 ${titleSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(o.title, ax, titleY);

  // ---- attribute grid (2 columns x 3 rows), hairline rules like the photo
  const gridTop = titleY + titleSize * 1.6;
  const rowH = (H * 0.997 - gridTop) * 0.32;
  const colW = (aw - W * 0.03) / 2;
  const attrSize = W * 0.0225;
  const valSize = W * 0.021;
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
    ctx.fillText(value, cx + W * 0.012, cy + attrSize * 1.35);
    ctx.globalAlpha = 1;
  }

  // ---- bottom rows: contract / token id / standard / chain + owner bar
  const footTop = gridTop + rowH * 3 + H * 0.012;
  const footSize = W * 0.021;
  ctx.font = `400 ${footSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.globalAlpha = 0.72;
  ctx.fillText(`COLLECTION: ${o.collection}`, ax, footTop);
  ctx.fillText(`TOKEN ID: ${o.serial.split('/')[0]}`, ax, footTop + footSize * 1.5);
  ctx.fillText(`STANDARD: ERC-721`, ax + colW + W * 0.03, footTop);
  ctx.fillText(`CHAIN: Ethereum`, ax + colW + W * 0.03, footTop + footSize * 1.5);
  ctx.globalAlpha = 1;

  // owner strip along the bottom edge
  const barY = H * 0.955;
  ctx.font = `700 ${W * 0.0235}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(`OWNED BY: ${o.handle}`, ax, barY - W * 0.0235);
  ctx.textAlign = 'right';
  ctx.fillText(o.serial, ax + aw, barY - W * 0.0235);
  ctx.textAlign = 'left';

  // grade badge, top-right of the ring frame (like a real slab's grade sticker)
  const gR = W * 0.055;
  ctx.save();
  ctx.translate(rx + rw - gR * 1.1, ry + gR * 1.1);
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.92;
  ctx.beginPath();
  ctx.arc(0, 0, gR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = paper;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${gR * 0.85}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillText(o.grade, 0, gR * 0.06);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.restore();
  ctx.restore(); // silhouette clip
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
export function drawCardBack(
  ctx: CanvasRenderingContext2D,
  style: 'generic',
  w: number,
  h: number,
  bodyRadius = w * 0.0568,
  power = 4.6
) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  clipSquircle(ctx, w, h, bodyRadius, power);
  if (style === 'generic') {
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

  // thin inner border, mirroring the moulded ridge
  ctx.strokeStyle = o.accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(1, W * 0.0045);
  roundRect(ctx, W * 0.028, H * 0.11, W * 0.944, H * 0.78, H * 0.1);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // two-line heavy title, left aligned
  const lines = o.title.split('\n').slice(0, 2);
  const size = H * (lines.length > 1 ? 0.27 : 0.34);
  ctx.fillStyle = o.ink;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `800 ${size}px "Arial Black", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const blockH = lines.length * size * 1.06;
  const startY = H / 2 - blockH / 2 + size * 0.53;
  lines.forEach((line, i) => ctx.fillText(line.toUpperCase(), W * 0.065, startY + i * size * 1.06));

  // right side: grade + serial, and the QR block
  const rightX = W * (o.qr ? 0.7 : 0.94);
  if (o.qr) {
    const q = H * 0.52;
    const qx = W * 0.985 - q;
    const qy = H / 2 - q / 2;
    ctx.fillStyle = o.ink;
    ctx.fillRect(qx, qy, q, q);
    ctx.fillStyle = o.plate;
    ctx.fillRect(qx + q * 0.06, qy + q * 0.06, q * 0.88, q * 0.88);
    // a QR-ish hatch: deterministic blocks
    ctx.fillStyle = o.ink;
    const n = 9;
    const cell = (q * 0.88) / n;
    const r = rng(0x9e37);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const corner = (x < 3 && y < 3) || (x > n - 4 && y < 3) || (x < 3 && y > n - 4);
        if (corner ? !(x === 1 && y === 1) && !(x === 0 && y === 0) : r() > 0.52) {
          ctx.fillRect(qx + q * 0.06 + x * cell, qy + q * 0.06 + y * cell, cell * 0.92, cell * 0.92);
        }
      }
    }
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = o.ink;
  ctx.font = `800 ${H * 0.2}px "Arial Black", system-ui, sans-serif`;
  ctx.fillText(o.grade, rightX, H * 0.42);
  ctx.globalAlpha = 0.62;
  ctx.font = `400 ${H * 0.13}px system-ui, sans-serif`;
  ctx.fillText(o.serial, rightX, H * 0.66);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
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
  // smoky plate
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2b2b31');
  g.addColorStop(0.45, '#232329');
  g.addColorStop(1, '#1b1b20');
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

  // ambient occlusion under the label ridge, along the top of the window
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.16);
  top.addColorStop(0, 'rgba(0,0,0,0.62)');
  top.addColorStop(0.35, 'rgba(0,0,0,0.22)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.16);

  // ...and one along the bottom wall the card leans on
  const bottom = ctx.createLinearGradient(0, h, 0, h * 0.9);
  bottom.addColorStop(0, 'rgba(0,0,0,0.5)');
  bottom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.9, w, h * 0.1);

  // side walls catch a little light
  const sideL = ctx.createLinearGradient(0, 0, w * 0.06, 0);
  sideL.addColorStop(0, 'rgba(190,200,216,0.16)');
  sideL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sideL;
  ctx.fillRect(0, 0, w * 0.06, h);
  const sideR = ctx.createLinearGradient(w, 0, w * 0.94, 0);
  sideR.addColorStop(0, 'rgba(190,200,216,0.12)');
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

