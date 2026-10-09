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
  /** stroke width of the art frame, as a fraction of the card width */
  artStroke?: number;
}

export function drawCardFace(
  ctx: CanvasRenderingContext2D,
  o: CardFaceText,
  art: HTMLImageElement | null,
  artBox: { x: number; y: number; w: number; h: number }
) {
  const { width: W, height: H } = o;
  const ink = '#fbf9fb';
  const paper = '#352334';
  const bodyRadius = Math.max(2, (o.bodyRadius ?? 0.03) * W);

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  clipSquircle(ctx, W, H, bodyRadius, Math.max(6, o.cornerPower ?? 8));
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // Thick rounded white keyline around the dark plum backing card.
  const frameInset = Math.max(5, W * 0.035);
  const frameW = Math.max(5, W * 0.018);
  ctx.strokeStyle = ink;
  ctx.lineWidth = frameW;
  roundRect(ctx, frameInset + frameW / 2, frameInset + frameW / 2,
    W - (frameInset + frameW / 2) * 2, H - (frameInset + frameW / 2) * 2,
    Math.max(8, bodyRadius * 0.72));
  ctx.stroke();

  // Nearly full-width art window with a thin square white keyline.
  const { x: ax, y: ay, w: aw, h: ah } = artBox;
  ctx.fillStyle = '#392638';
  ctx.fillRect(ax, ay, aw, ah);
  if (art) {
    const ir = art.width / art.height;
    const wr = aw / ah;
    let sx = 0, sy = 0, sw = art.width, sh = art.height;
    if (ir > wr) { sw = art.height * wr; sx = (art.width - sw) / 2; }
    else { sh = art.width / wr; sy = (art.height - sh) / 2; }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(art, sx, sy, sw, sh, ax, ay, aw, ah);
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, (o.artStroke ?? 0.007) * W);
  ctx.strokeRect(ax + ctx.lineWidth / 2, ay + ctx.lineWidth / 2, aw - ctx.lineWidth, ah - ctx.lineWidth);

  const bandTop = ay + ah;
  const band = H - bandTop;
  const heavy = (px: number) => `900 ${px}px Impact, "Arial Narrow", "Arial Black", sans-serif`;
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const titleSize = Math.max(18, Math.min(W * 0.052, band * 0.105));
  ctx.font = heavy(titleSize);
  ctx.fillText(o.title.toUpperCase(), ax, bandTop + band * 0.035);

  const labelSize = Math.max(12, W * 0.019);
  const valueSize = Math.max(11, W * 0.016);
  const traits = o.traits ?? [];
  const gridTop = bandTop + band * 0.19;
  const colW = aw / 3;
  const rows = traits.length >= 7 ? 3 : 2;
  const rowH = band * (rows === 3 ? 0.13 : 0.19);
  // Reference order is vertical by column: BACKGROUNDS/EYES/MOUTHS,
  // BASES/HANDS, BODYWEAR/HATS. No decorative horizontal strokes appear here.
  for (let i = 0; i < traits.length; i++) {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const cx = ax + col * colW + W * 0.014;
    const cy = gridTop + row * rowH;
    const [label, value] = traits[i] ?? ['—', '—'];
    ctx.font = heavy(labelSize);
    ctx.fillText(label.toUpperCase(), cx, cy);
    ctx.font = `500 ${valueSize}px Arial, sans-serif`;
    ctx.globalAlpha = 0.9;
    ctx.fillText(value, cx, cy + labelSize * 1.35);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = ink;
  for (let col = 1; col < 3; col++) {
    ctx.fillRect(ax + col * colW - W * 0.006, gridTop, Math.max(2, W * 0.004), rowH * rows * 0.92);
  }

  const metaY = gridTop + rowH * rows + band * 0.035;
  const metaSize = Math.max(10, W * 0.014);
  ctx.font = `600 ${metaSize}px Arial, sans-serif`;
  ctx.fillStyle = ink;
  ctx.fillRect(ax, metaY - W * 0.010, aw, Math.max(2, W * 0.003));
  ctx.textAlign = 'left';
  ctx.fillText(`CONTRACT ADDRESS: 0x375d...e306`, ax, metaY);
  ctx.fillText(`TOKEN ID: ${String(o.serial).split('/')[0]}`, ax, metaY + metaSize * 1.55);
  ctx.textAlign = 'right';
  ctx.fillText(`TOKEN STANDARD: ERC-721`, ax + aw, metaY);
  ctx.fillText(`CHAIN: Ethereum`, ax + aw, metaY + metaSize * 1.55);

  const footerRuleY = metaY + metaSize * 3.15;
  ctx.fillRect(ax, footerRuleY, aw, Math.max(2, W * 0.003));
  const footerY = footerRuleY + metaSize * 1.25;
  ctx.font = heavy(Math.max(11, W * 0.016));
  ctx.textAlign = 'left';
  ctx.fillText(`OWNED BY: ${o.handle}`, ax, footerY);
  ctx.textAlign = 'center';
  ctx.fillText('@NEMOSCARDSHOP', ax + aw / 2, footerY);
  ctx.textAlign = 'right';
  ctx.fillText(o.serial, ax + aw, footerY);
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
    { x: M * o.artInset, y: o.height * o.artTop, w: M * o.artWidth, h: o.height * o.artHeight }
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
  /** extracted transparent version of the uploaded reference logo */
  logo?: HTMLImageElement | null;
  blank?: boolean;
}

export function drawLabel(ctx: CanvasRenderingContext2D, o: LabelText) {
  const { width: W, height: H } = o;
  const plum = o.blank ? '#ffffff' : '#332333';
  const white = o.blank ? '#141414' : '#fbf9fb';
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = plum;
  ctx.fillRect(0, 0, W, H);
  if (o.blank) {
    ctx.strokeStyle = '#d8cbd6';
    ctx.lineWidth = Math.max(2, W * 0.006);
    ctx.strokeRect(W * 0.028, H * 0.09, W * 0.944, H * 0.82);
    return;
  }

  // Square-cornered inset keyline, approximately 8px at the hero tier.
  ctx.strokeStyle = white;
  ctx.lineWidth = Math.max(2, W * 0.006);
  ctx.strokeRect(W * 0.025, H * 0.085, W * 0.95, H * 0.83);

  const pad = W * 0.085;
  const lines = o.title.split('\n').map((line) => line.toUpperCase()).slice(0, 2);
  let size = H * 0.31;
  const maxWidth = W * 0.63;
  const heavy = (px: number) => `900 ${px}px Impact, "Arial Narrow", "Arial Black", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (; size > H * 0.12; size -= 1) {
    ctx.font = heavy(size);
    if (Math.max(...lines.map((line) => ctx.measureText(line).width)) <= maxWidth) break;
  }
  ctx.font = heavy(size);
  ctx.fillStyle = white;
  const leading = size * 0.82;
  const startY = H / 2 - leading * (lines.length - 1) / 2;
  lines.forEach((line, i) => ctx.fillText(line, pad, startY + i * leading));

  // Use the uploaded mark itself; drawing a substitute silhouette was the
  // source of the previous logo mismatch. Preserve its aspect ratio and
  // transparent cutout while fitting it into the reference header slot.
  if (o.logo) {
    const maxW = W * 0.19;
    const maxH = H * 0.72;
    const scale = Math.min(maxW / o.logo.width, maxH / o.logo.height);
    const lw = o.logo.width * scale;
    const lh = o.logo.height * scale;
    ctx.drawImage(o.logo, W * 0.84 - lw / 2, H / 2 - lh / 2, lw, lh);
  }
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
  /*
   * Measured off the reference (see docs/reference-parity.md). The window floor
   * is remarkably flat — #483945 at the top under the ridge, #473642 through
   * the middle, #42333f at the bottom, and the side rails within 0.02 luma of
   * the middle. The old painter put a 0.42-alpha white wash across the apron
   * and a bright rail down each side, which is what made the window glow.
   *
   * What light there is arrives from above and from the right (the key light in
   * the reference is off to that side): the rails are a shade lighter than the
   * plate, and the plate darkens very slightly toward the bottom edge.
   */
  // the floor stays lit all the way to the bottom wall: an earlier version
  // darkened the last 25% toward #41323e, which made the strip under the card
  // read as a continuation of the dark inner frame instead of the margin it
  // is — the bottom now falls off no more than the middle does
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#4a3c46');
  g.addColorStop(0.37, '#483a45');
  g.addColorStop(0.75, '#473944');
  g.addColorStop(1, '#463843');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // the window's top lip: a moulded bar that catches the light (the reference
  // reads it *brighter* than the floor, not darker)
  for (const slot of layout.slots) {
    const sw = Math.max(2, slot.w * w);
    const sh = Math.max(2, slot.h * h);
    const sx = slot.x * w;
    const sy = slot.y * h;
    const lip = ctx.createLinearGradient(0, sy, 0, sy + sh);
    lip.addColorStop(0, 'rgba(232,238,248,0.62)');
    lip.addColorStop(0.55, 'rgba(196,206,222,0.34)');
    lip.addColorStop(1, 'rgba(150,160,180,0.10)');
    ctx.fillStyle = lip;
    ctx.fillRect(sx, sy, sw, sh);
    // the shaded under-edge that makes the tab read as a moulding
    const under = ctx.createLinearGradient(0, sy + sh, 0, sy + sh + h * 0.006);
    under.addColorStop(0, 'rgba(0,0,0,0.34)');
    under.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = under;
    ctx.fillRect(sx, sy + sh, sw, h * 0.006);
  }

  // baked contact shadow around the card cutout — narrow, because the card sits
  // in a shallow tray and the reference's shadow is a tight line, not a well
  const cw = layout.card.w * w;
  const ch = layout.card.h * h;
  const cx = layout.card.x * w;
  const cy = layout.card.y * h;
  // symmetric and tight: an offset shadow bled down the card's bottom edge and
  // visually dragged the inner frame into the floor margin below it
  const pad = Math.max(5, w * 0.022);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.62)';
  ctx.shadowBlur = pad * 0.9;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, cx, cy, cw, ch, w * 0.05);
  ctx.fill();
  ctx.restore();

  // the cutout's lip: the die-cut edge is pale, and a hairline of shadow sits
  // just inside the tray where the card meets it
  ctx.strokeStyle = 'rgba(214,222,238,0.16)';
  ctx.lineWidth = Math.max(1, w * 0.0035);
  roundRect(ctx, cx - pad * 0.5, cy - pad * 0.5, cw + pad, ch + pad, w * 0.055);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, w * 0.005);
  roundRect(ctx, cx + pad * 0.12, cy + pad * 0.12, cw - pad * 0.24, ch - pad * 0.24, w * 0.045);
  ctx.stroke();

  // the ridge's shadow on the top of the window: the reference shows the floor
  // about 3 luma darker for the first 40 px under the ridge
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.045);
  top.addColorStop(0, 'rgba(0,0,0,0.30)');
  top.addColorStop(0.45, 'rgba(0,0,0,0.10)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.045);

  // side rails: a shade lighter than the plate on the key-light side (right),
  // and a hair darker on the left — measured 0.04 luma either way, no more
  const lightL = ctx.createLinearGradient(0, 0, w * 0.06, 0);
  lightL.addColorStop(0, 'rgba(0,0,0,0.14)');
  lightL.addColorStop(0.55, 'rgba(198,208,226,0.05)');
  lightL.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lightL;
  ctx.fillRect(0, 0, w * 0.06, h);
  const lightR = ctx.createLinearGradient(w, 0, w * 0.94, 0);
  lightR.addColorStop(0, 'rgba(198,208,226,0.16)');
  lightR.addColorStop(0.5, 'rgba(198,208,226,0.05)');
  lightR.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lightR;
  ctx.fillRect(w * 0.94, 0, w * 0.06, h);

  // and the bottom ledge the card leans on: barely shaded, with a strong pale
  // lip where the moulding turns — the lit line that separates the floor
  // margin from the cavity wall, the same way the top lip separates the apron
  const bottom = ctx.createLinearGradient(0, h, 0, h * 0.95);
  bottom.addColorStop(0, 'rgba(0,0,0,0.06)');
  bottom.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.95, w, h * 0.05);
  const bottomLip = ctx.createLinearGradient(0, h, 0, h * 0.94);
  bottomLip.addColorStop(0, 'rgba(196,206,224,0.28)');
  bottomLip.addColorStop(1, 'rgba(196,206,224,0)');
  ctx.fillStyle = bottomLip;
  ctx.fillRect(0, h * 0.94, w, h * 0.06);
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
