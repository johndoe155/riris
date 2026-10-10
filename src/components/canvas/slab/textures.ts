'use client';

import * as THREE from 'three';
import { FACE_GRID_X, FACE_GRID_Y, SLAB_SPEC, trayLayout, type TrayLayout } from './SlabSpec';
import { REFERENCE_PALETTE, type SlabPalette } from './slabPalette';
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

/** A palette hex at a fixed alpha, for the painters' rgba() literals. */
export function withAlpha(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
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
  /* ---- dynamic palette overrides (omit = the measured reference inks) ---- */
  /** keyline / frame / typography ink (contrast element) */
  ink?: string;
  /** the card's printed body field */
  field?: string;
  /** letterbox fallback tone behind the art panel */
  artEdge?: string;
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
  /** inset of the art frame's outer edge from the card's bottom, fraction of card-h */
  artBottom: number;
  artHeight: number;
  /** stroke width of the art frame, as a fraction of the card width */
  artStroke?: number;
}

/**
 * The reference card face, laid out from the re-measured table in
 * docs/card-parity-plan.md §1 (card box 491 x 697 photo px at 500,508):
 *
 *   keyline   stroke 7 px flush with the card edge, radius 24 px
 *   gutter    20 px of body ink
 *   art frame square 7 px stroke at 28 px inset; inner window 421 x 422 px,
 *             the 460 x 413 source art CONTAIN-fitted into it
 *   title     cap 16 px, baseline y 1001, left 527
 *   traits    left-rules 3 px at x 528/659/812, y 1010..1110; columns [3,2,2];
 *             label cap 9 px at 1015 + n*37; value cap 8 px, +14 under label
 *   meta      rule 3 px at y 1122 and 1165, x 527..964; caps 9 px at 1130/1149
 *   footer    cap 10 px at 1175; left 528, middle centred 770, right 964
 *
 * Everything is expressed as a fraction of the card so the 2048 px hero tier
 * and the pit tier draw the identical face.
 */
export function drawCardFace(
  ctx: CanvasRenderingContext2D,
  o: CardFaceText,
  art: HTMLImageElement | null,
  artBox: { x: number; y: number; w: number; h: number }
) {
  const { width: W, height: H } = o;
  const ink = o.ink ?? '#fbf9fb';
  const paper = o.field ?? '#352334';
  const bodyRadius = Math.max(2, (o.bodyRadius ?? 0.0489) * W);

  /* measured layout, as fractions of the card (x of W, y of H) */
  const keyInset = o.ringInset ?? 0.002;
  const keyStroke = o.ringWidth ?? 0.0143;
  const keyRadius = o.ringRadius ?? 0.0489;
  const artStroke = o.artStroke ?? 0.0143;
  const left = 0.057; // title / footer / first rule all start on the art frame
  const cap = (px: number) => (px / 697) * H; // photo px of cap height → canvas
  const em = (px: number) => cap(px) / 0.72; // cap → em for these families
  const heavy = (px: number) => `900 ${px}px Impact, "Arial Narrow", "Arial Black", sans-serif`;
  // the reference's small text is a condensed sans: plain Arial runs ~20%
  // wider and collides the meta/footer groups at these caps
  const narrow = (wt: number, px: number) =>
    `${wt} ${px}px "Arial Narrow", "Liberation Sans Narrow", "Roboto Condensed", Arial, sans-serif`;
  // condensed stacks are not installed everywhere; shrink-to-fit keeps the
  // measured group boundaries (528 / 770 / 964) collision-free on any host
  const fitFont = (text: string, maxW: number, mk: (px: number) => string, px0: number) => {
    let px = px0;
    ctx.font = mk(px);
    while (ctx.measureText(text).width > maxW && px > px0 * 0.62) {
      px *= 0.94;
      ctx.font = mk(px);
    }
  };

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  clipSquircle(ctx, W, H, bodyRadius, Math.max(6, o.cornerPower ?? 8));
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);

  // The rounded white keyline sits flush with the card's own edge: its outer
  // boundary IS the silhouette, which is what opens the 20 px gutter to the
  // square art frame (the reference's double-border read).
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(3, keyStroke * W);
  roundRect(
    ctx,
    (keyInset + keyStroke / 2) * W,
    (keyInset + keyStroke / 2) * W,
    W - (keyInset + keyStroke) * W,
    H - (keyInset + keyStroke) * W,
    Math.max(6, (keyRadius - keyStroke / 2) * W)
  );
  ctx.stroke();

  // Art window: contain-fit, letterboxed with the source's own edge tones so
  // the background gradient runs on through the bars; nearest-neighbour
  // whenever the window upsamples the source (pixel art stays razor sharp).
  const { x: ax, y: ay, w: aw, h: ah } = artBox;
  const edgeTone = (row: number) => {
    if (!art) return o.artEdge ?? '#392638';
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    const cc = c.getContext('2d')!;
    cc.drawImage(art, 0, row, art.width, 1, 0, 0, 1, 1);
    const d = cc.getImageData(0, 0, 1, 1).data;
    return `rgb(${d[0]},${d[1]},${d[2]})`;
  };
  const topTone = edgeTone(0);
  const bottomTone = edgeTone(art ? art.height - 1 : 0);
  const bg = ctx.createLinearGradient(0, ay, 0, ay + ah);
  bg.addColorStop(0, topTone);
  bg.addColorStop(1, bottomTone);
  ctx.fillStyle = bg;
  ctx.fillRect(ax, ay, aw, ah);
  if (art) {
    /*
     * Contain-fit, centred: the source's own aspect decides the placement, so
     * any replacement art lands inside the window with no offset math tuned
     * to one crop. (The old fixed fit — 0.905 of the window width with its
     * top edge 0.1487 of the window height down — was measured for the
     * original panel's 460x413 crop; a square source drew 95 px past the
     * window's bottom edge, spilling over the gutter and title.) The
     * letterbox bars, where the aspect leaves any, are the source's own edge
     * rows/columns stretched, so its background gradient runs on through.
     */
    const k = Math.min(aw / art.width, ah / art.height);
    const dw = art.width * k;
    const dh = art.height * k;
    const dx = ax + (aw - dw) / 2;
    const dy = ay + (ah - dh) / 2;
    /*
     * The supplied file is a tight crop of the original panel (its corner
     * sparkles and the leaf tip touch its edges), so the drawn art sits on an
     * offscreen layer whose own edges fade out over a few px: the crop's cut
     * features melt into the window's background gradient instead of seaming
     * against the bars. Nearest-neighbour whenever the window upsamples the
     * source, so pixel art keeps the reference's razor-sharp blocks.
     */
    const lw = Math.max(2, Math.ceil(dw));
    const lh = Math.max(2, Math.ceil(dh));
    const layer = makeCanvas(lw, lh);
    const lctx = layer.ctx;
    lctx.imageSmoothingEnabled = dw / art.width < 2;
    lctx.drawImage(art, 0, 0, art.width, art.height, 0, 0, dw, dh);
    lctx.imageSmoothingEnabled = true;
    const fade = Math.max(4, lw * 0.022);
    lctx.globalCompositeOperation = 'destination-out';
    const edge = (x: number, y: number, w: number, h: number, g: CanvasGradient) => {
      lctx.fillStyle = g;
      lctx.fillRect(x, y, w, h);
    };
    let g = lctx.createLinearGradient(0, 0, 0, fade);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    edge(0, 0, lw, fade, g);
    g = lctx.createLinearGradient(0, lh, 0, lh - fade);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    edge(0, lh - fade, lw, fade, g);
    g = lctx.createLinearGradient(0, 0, fade, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    edge(0, 0, fade, lh, g);
    g = lctx.createLinearGradient(lw, 0, lw - fade, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    edge(lw - fade, 0, fade, lh, g);
    lctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer.canvas, dx, dy, lw, lh);
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(2, artStroke * W);
  ctx.strokeRect(ax - ctx.lineWidth / 2, ay - ctx.lineWidth / 2, aw + ctx.lineWidth, ah + ctx.lineWidth);

  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // title: cap 16 px, baseline y 1001 of the 697 px card
  ctx.font = heavy(em(16));
  ctx.fillText(o.title.toUpperCase(), left * W, 0.707318 * H);

  /* traits: one rule at the LEFT of every column, all three spanning exactly
   * y 1010..1110 no matter how many entries the column carries; the reference's
   * occupancy is [3, 2, 2] down the columns. */
  const traits = o.traits ?? [];
  const counts = [3, 2, 2];
  const ruleX = [0.05703, 0.32383, 0.63544];
  const ruleW = 0.00611;
  const ruleTop = 0.72023;
  const ruleH = 0.14491;
  const indent = 0.009;
  const rowPitch = 0.053085;
  const valueDrop = 0.020086;
  ctx.fillStyle = ink;
  for (let c = 0; c < 3; c++) {
    ctx.fillRect(ruleX[c] * W, ruleTop * H, Math.max(2, ruleW * W), ruleH * H);
  }
  let idx = 0;
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < counts[c]; r++) {
      const [label, value] = traits[idx++] ?? ['—', '—'];
      const cx = (ruleX[c] + indent) * W;
      const labelTop = 0.7274 + r * rowPitch;
      ctx.font = heavy(em(9));
      ctx.fillStyle = ink;
      ctx.fillText(label.toUpperCase(), cx, (labelTop * H) + cap(9));
      const colRight = c < 2 ? ruleX[c + 1] : 0.945;
      fitFont(value, (colRight - ruleX[c] - indent - 0.012) * W, (px) => narrow(400, px), em(8));
      ctx.globalAlpha = 0.92;
      ctx.fillText(value, cx, (labelTop + valueDrop) * H + cap(8));
      ctx.globalAlpha = 1;
    }
  }

  // meta block: two 3 px rules across x 527..964, caps 9 px, right group flush
  const ruleLeft = 0.05499 * W;
  const ruleRight = 0.94501 * W;
  const ruleT = Math.max(2, cap(3));
  ctx.fillStyle = ink;
  ctx.fillRect(ruleLeft, 0.880918 * H, ruleRight - ruleLeft, ruleT);
  ctx.textAlign = 'left';
  fitFont('CONTRACT ADDRESS: 0x375d...e306', 0.44 * W, (px) => narrow(700, px), em(9));
  ctx.fillText('CONTRACT ADDRESS: 0x375d...e306', ruleLeft, 0.892396 * H + cap(9));
  ctx.fillText(`TOKEN ID: ${String(o.serial).split('/')[0]}`, ruleLeft, 0.919656 * H + cap(9));
  ctx.textAlign = 'right';
  fitFont('TOKEN STANDARD: ERC-721', 0.44 * W, (px) => narrow(700, px), em(9));
  ctx.fillText('TOKEN STANDARD: ERC-721', 0.940937 * W, 0.892396 * H + cap(9));
  ctx.fillText('CHAIN: Ethereum', 0.940937 * W, 0.919656 * H + cap(9));

  // footer: left / centred-at-0.55 / right, cap 10 px
  ctx.fillRect(ruleLeft, 0.942611 * H, ruleRight - ruleLeft, ruleT);
  const footerBase = 0.956958 * H + cap(10);
  ctx.textAlign = 'left';
  fitFont(`OWNED BY: ${o.handle}`, 0.335 * W, (px) => narrow(700, px), em(10));
  ctx.fillText(`OWNED BY: ${o.handle}`, ruleLeft, footerBase);
  ctx.textAlign = 'center';
  fitFont('@NEMOSCARDSHOP', 0.25 * W, (px) => narrow(800, px), em(10));
  ctx.fillText('@NEMOSCARDSHOP', 0.549898 * W, footerBase);
  ctx.textAlign = 'right';
  fitFont(o.serial, 0.2 * W, (px) => narrow(800, px), em(10));
  ctx.fillText(o.serial, ruleRight, footerBase);
  ctx.restore();
}

/** Canvas facing the card's front: face text + art. */
export function buildCardFace(o: CardFaceText, art: HTMLImageElement | null): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(o.width, o.height);
  drawCardFace(ctx, o, art, innerArtBox(o));
  return toTexture(canvas, { srgb: true });
}

/**
 * The art window's INNER box (inside the square frame stroke): the source art
 * is contain-fitted here, and the stroke is drawn centred on its outer edge.
 */
export function innerArtBox(o: CardFaceText) {
  const artStroke = o.artStroke ?? 0.0143;
  const strokeY = artStroke * (o.width / o.height);
  const x = o.artInset + artStroke;
  const y = o.artTop + strokeY;
  return {
    x: o.width * x,
    y: o.height * y,
    w: o.width * (1 - x * 2),
    h: o.height * (1 - y - (o.artBottom + strokeY)),
  };
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
  photo: HTMLImageElement | null = null,
  pal: SlabPalette | null = null
) {
  const P = pal ?? REFERENCE_PALETTE;
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
    ctx.fillStyle = P.backField;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = P.backInk;
    ctx.lineWidth = w * 0.02;
    roundRect(ctx, w * 0.06, h * 0.05, w * 0.88, h * 0.9, w * 0.05);
    ctx.stroke();
    ctx.fillStyle = P.backInk;
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
  /** dynamic palette inks; omitted = the measured reference plate */
  paint?: {
    plate?: string;
    ink?: string;
    hairline?: string;
    bevel?: string;
    blankBorder?: string;
  };
}

export function drawLabel(ctx: CanvasRenderingContext2D, o: LabelText) {
  const { width: W, height: H } = o;
  const plum = o.paint?.plate ?? (o.blank ? '#ffffff' : '#332333');
  const white = o.paint?.ink ?? (o.blank ? '#141414' : '#fbf9fb');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = plum;
  ctx.fillRect(0, 0, W, H);
  if (o.blank) {
    ctx.strokeStyle = o.paint?.blankBorder ?? '#d8cbd6';
    ctx.lineWidth = Math.max(2, W * 0.006);
    ctx.strokeRect(W * 0.028, H * 0.09, W * 0.944, H * 0.82);
    return;
  }

  /*
   * The photo carries no white keyline inside the plate: what reads as an
   * "inset border" is a thin lavender hairline (L~74 against the plate's L50)
   * plus the lit bevel on the plate's right edge. Both, at plate scale.
   */
  const hairline = o.paint?.hairline ?? '#7a6978';
  ctx.strokeStyle = withAlpha(hairline, 0.85);
  ctx.lineWidth = Math.max(1.5, W * 0.0025);
  ctx.strokeRect(W * 0.025, H * 0.085, W * 0.95, H * 0.83);
  const bevelTone = o.paint?.bevel ?? '#c7b6c4';
  const bevel = ctx.createLinearGradient(W * 0.975, 0, W, 0);
  bevel.addColorStop(0, withAlpha(bevelTone, 0));
  bevel.addColorStop(1, withAlpha(bevelTone, 0.55));
  ctx.fillStyle = bevel;
  ctx.fillRect(W * 0.975, 0, W * 0.025, H);

  const pad = W * 0.0702;
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
  // measured: caps 34 px on a 152 px plate, line tops 263 / 306 (pitch 43 px)
  const leading = size * 0.915;
  const startY = H * 0.49013 - leading * (lines.length - 1) / 2;
  lines.forEach((line, i) => ctx.fillText(line, pad, startY + i * leading));

  // The mark: the brand PNG itself (1191x970, transparent) contain-fitted,
  // centred into the measured header slot (photo x 892..995, y 262..343 of
  // the plate). The vector mark below is only the fallback for a plate drawn
  // before/without the logo image.
  if (o.logo) {
    const lw = W * 0.17637;
    const lh = H * 0.5329;
    const lcx = W * 0.84161;
    const lcy = H * 0.49671;
    const k = Math.min(lw / o.logo.width, lh / o.logo.height);
    const dw = o.logo.width * k;
    const dh = o.logo.height * k;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(o.logo, lcx - dw / 2, lcy - dh / 2, dw, dh);
  } else {
    drawLogoMark(ctx, W * 0.84161, H * 0.49671, W * 0.17637, H * 0.5329);
  }
}

/**
 * The collection mark: three rounded cards fanned over a shared navy
 * silhouette — the middle card plain white and behind, the left card white
 * with an orange panel, the right card solid orange. Remodelled to match the
 * supplied brand artwork (the old fan carried a black outline and an
 * orange-bodied middle card, which the brand does not). Each card is painted
 * as a navy band, then a white band, then its body, so a front card's rings
 * cut across the card behind it exactly as the artwork shows — and the whole
 * mark stays vector-crisp at every plate tier.
 */
export function drawLogoMark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number
) {
  const NAVY = '#221f70';
  const WHITE = '#fdfdfd';
  const ORANGE = '#ee5c28';
  // the mark's own aspect, contained in whatever slot the plate gives it
  const ASPECT = 1.3;
  const mw = Math.min(w, h * ASPECT);
  const mh = mw / ASPECT;
  const x0 = cx - mw / 2;
  const y0 = cy - mh / 2;
  const tNavy = 0.03 * mw;
  const tWhite = 0.02 * mw;
  const cw = 0.38 * mw;
  const ch = 0.6 * mw;
  const cr = 0.2 * cw;

  const paintCard = (
    nx: number,
    ny: number,
    deg: number,
    body: string,
    panel: string | null,
    inset: number,
    scaleH = 1
  ) => {
    ctx.save();
    ctx.translate(x0 + nx * mw, y0 + ny * mh);
    ctx.rotate((deg * Math.PI) / 180);
    const chh = ch * scaleH;
    roundRect(ctx, -cw / 2, -chh / 2, cw, chh, cr);
    ctx.lineWidth = 2 * (tNavy + tWhite);
    ctx.strokeStyle = NAVY;
    ctx.stroke();
    ctx.lineWidth = 2 * tWhite;
    ctx.strokeStyle = WHITE;
    ctx.stroke();
    ctx.fillStyle = body;
    ctx.fill();
    if (panel) {
      const pw = cw * (1 - inset * 2);
      const ph = chh * (1 - inset * 2);
      roundRect(ctx, -pw / 2, -ph / 2, pw, ph, cr * (1 - inset * 1.4));
      ctx.fillStyle = panel;
      ctx.fill();
    }
    ctx.restore();
  };

  // back to front: the plain middle card, then the side cards across it
  paintCard(0.48, 0.47, 8, WHITE, null, 0, 1.12);
  paintCard(0.205, 0.48, -15, WHITE, ORANGE, 0.13);
  paintCard(0.765, 0.52, 12, ORANGE, null, 0);
}

export function buildLabelTexture(o: LabelText): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(o.width, o.height);
  drawLabel(ctx, o);
  return toTexture(canvas, { srgb: true });
}

/* ------------------------------------------------------------------ *
 * Tray / window textures with baked ambient occlusion
 * ------------------------------------------------------------------ */

export function drawTray(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  layout: TrayLayout,
  pal: SlabPalette | null = null
) {
  const P = pal ?? REFERENCE_PALETTE;
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
  // the floor is flat #473844 top to bottom (apron and below-card margins
  // measure the same tone), so no vertical ramp beyond a luma of noise
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, P.trayTop);
  g.addColorStop(0.5, P.trayMid);
  g.addColorStop(1, P.trayBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  /*
   * The window's top edge: the photo shows an 8 px band at face tone (L124,
   * #8a7986) where the opening's top wall turns, then a dark seam into the
   * cavity — NOT the bright extruded bar an earlier revision carried. 8 photo
   * px of the 818 px window.
   */
  ctx.fillStyle = P.trayWallBand;
  ctx.fillRect(0, 0, w, h * 0.0098);
  const seam = ctx.createLinearGradient(0, h * 0.0098, 0, h * 0.016);
  seam.addColorStop(0, 'rgba(0,0,0,0.35)');
  seam.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = seam;
  ctx.fillRect(0, h * 0.0098, w, h * 0.0062);

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
  ctx.strokeStyle = withAlpha(P.trayLip, 0.16);
  ctx.lineWidth = Math.max(1, w * 0.0035);
  roundRect(ctx, cx - pad * 0.5, cy - pad * 0.5, cw + pad, ch + pad, w * 0.055);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, w * 0.005);
  roundRect(ctx, cx + pad * 0.12, cy + pad * 0.12, cw - pad * 0.24, ch - pad * 0.24, w * 0.045);
  ctx.stroke();

  // cavity side rails, measured: shadow side #43333f, key-light side #685864 —
  // mauve plastic, not the blue-white washes an earlier revision painted
  const lightL = ctx.createLinearGradient(0, 0, w * 0.065, 0);
  lightL.addColorStop(0, withAlpha(P.trayRailL, 0.9));
  lightL.addColorStop(0.6, withAlpha(P.trayRailL, 0.35));
  lightL.addColorStop(1, withAlpha(P.trayRailL, 0));
  ctx.fillStyle = lightL;
  ctx.fillRect(0, 0, w * 0.065, h);
  const lightR = ctx.createLinearGradient(w, 0, w * 0.935, 0);
  lightR.addColorStop(0, withAlpha(P.trayRailR, 0.85));
  lightR.addColorStop(0.5, withAlpha(P.trayRailR, 0.3));
  lightR.addColorStop(1, withAlpha(P.trayRailR, 0));
  ctx.fillStyle = lightR;
  ctx.fillRect(w * 0.935, 0, w * 0.065, h);

  // the bottom wall turns a shade darker than the floor (L55 against L60);
  // there is no pale lip down there in the photo
  const bottom = ctx.createLinearGradient(0, h, 0, h * 0.93);
  bottom.addColorStop(0, 'rgba(20,12,20,0.22)');
  bottom.addColorStop(1, 'rgba(20,12,20,0)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.93, w, h * 0.07);
}

export function buildTrayTexture(w = 512, h = 768, layout: TrayLayout = trayLayout()): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(w, h);
  drawTray(ctx, w, h, layout);
  return toTexture(canvas, { srgb: true });
}

/* ------------------------------------------------------------------ *
 * Face plate map
 *
 * The reference case is smoky translucent plastic with a diagonal sheen:
 * lit along the top strip and the right wall, deep purple into the bottom
 * left. A single MeshPhysicalMaterial colour cannot carry that, so the
 * measured sheen is painted once into a case-UV map and applied to the face
 * plate through the extrusion's shape-space UVs. The moulded furniture that
 * is only a tone step in the photo — chamfer band, step hairline, ridge
 * hairline and shadow, window-top wall band, side tabs — is painted here
 * too, at photo scale, so the 3-D bevels only add parallax.
 * ------------------------------------------------------------------ */

const FACE_PHOTO = { x0: 422, y0: 197, w: 645, h: 1096 };

function parseHex(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function drawFaceMap(ctx: CanvasRenderingContext2D, w: number, h: number, pal: SlabPalette | null = null) {
  const P = pal ?? REFERENCE_PALETTE;
  const { x0, y0, w: pw, h: ph } = FACE_PHOTO;
  const gx = FACE_GRID_X;
  const gy = FACE_GRID_Y;
  const grid = P.faceGrid.map((row) => row.map(parseHex));
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const cell = (arr: number[], t: number): [number, number] => {
    let i = 0;
    while (i < arr.length - 2 && t > arr[i + 1]) i++;
    const a = arr[i];
    const b = arr[i + 1];
    return [i, Math.min(1, Math.max(0, (t - a) / (b - a)))];
  };
  for (let py = 0; py < h; py++) {
    const fy = y0 + ((py + 0.5) / h) * ph;
    const [j, ty] = cell(gy, fy);
    for (let px = 0; px < w; px++) {
      const fx = x0 + ((px + 0.5) / w) * pw;
      const [i, tx] = cell(gx, fx);
      const c00 = grid[j][i];
      const c10 = grid[j][i + 1];
      const c01 = grid[j + 1][i];
      const c11 = grid[j + 1][i + 1];
      const o = (py * w + px) * 4;
      for (let k = 0; k < 3; k++) {
        const top = c00[k] + (c10[k] - c00[k]) * tx;
        const bot = c01[k] + (c11[k] - c01[k]) * tx;
        d[o + k] = top + (bot - top) * ty;
      }
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // photo px -> canvas px
  const T = (x: number, y: number): [number, number] => [((x - x0) / pw) * w, ((y - y0) / ph) * h];
  const S = (n: number) => (n / pw) * w; // photo length -> canvas length
  const rect = (x: number, y: number, rw: number, rh: number) => {
    const [cx, cy] = T(x, y);
    ctx.fillRect(cx, cy, S(rw), (rh / ph) * h);
  };

  // moulded chamfer: the 10 px band inside the silhouette, dark on the shadow
  // side and lit on the key side, with the bright hairline where the face
  // plate's bevel turns. Its corner radius tracks SLAB_SPEC.radius (in this
  // map's px): the old hardcodes 71/64 were exactly radius − inset for the
  // measured 0.115 corner, and these expressions reproduce those values while
  // following the spec when it moves.
  const R = (SLAB_SPEC.radius / (SLAB_SPEC.w - SLAB_SPEC.stepInset * 2)) * w;
  const chamfer = ctx.createLinearGradient(0, 0, w, 0);
  chamfer.addColorStop(0, withAlpha(P.chamferDark, 0.85));
  chamfer.addColorStop(0.5, withAlpha(P.chamferDark, 0.35));
  chamfer.addColorStop(0.8, withAlpha(P.chamferLit, 0.55));
  chamfer.addColorStop(1, withAlpha(P.chamferLit, 0.85));
  ctx.strokeStyle = chamfer;
  ctx.lineWidth = S(10);
  roundRect(ctx, S(5), S(5), w - S(10), h - S(10), R - S(5));
  ctx.stroke();
  const hair = ctx.createLinearGradient(0, 0, w, 0);
  hair.addColorStop(0, withAlpha(P.mouldHair, 0.1));
  hair.addColorStop(0.55, withAlpha(P.mouldHair, 0.22));
  hair.addColorStop(1, withAlpha(P.mouldHair, 0.55));
  ctx.strokeStyle = hair;
  ctx.lineWidth = Math.max(1.5, S(2.5));
  roundRect(ctx, S(12), S(12), w - S(24), h - S(24), R - S(12));
  ctx.stroke();

  // shoulder step: 1 px hairline above the rail, 1 px shadow under it
  ctx.fillStyle = withAlpha(P.stepHair, 0.35);
  rect(435, 417, 620, 2);
  ctx.fillStyle = withAlpha(P.stepShadow, 0.5);
  rect(435, 427, 620, 2);

  // window-top wall band + its seam into the cavity
  ctx.fillStyle = withAlpha(P.windowBand, 0.9);
  rect(465, 476, 565, 8);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rect(465, 484, 565, 2);

  // the two muted moulded side tabs
  ctx.fillStyle = withAlpha(P.sideTabPaintL, 0.85);
  const [lx, ly] = T(438, 647);
  roundRect(ctx, lx, ly, S(8), (50 / ph) * h, S(3));
  ctx.fill();
  ctx.fillStyle = withAlpha(P.sideTabPaintR, 0.85);
  const [rx, ry] = T(1043, 647);
  roundRect(ctx, rx, ry, S(8), (50 / ph) * h, S(3));
  ctx.fill();

  // bottom weld hairline
  ctx.fillStyle = withAlpha(P.weldHair, 0.08);
  rect(430, 1289, 630, 2);
}

/** the map's pixel height for a given width (the photo's aspect) */
export function faceMapHeight(w = 1024): number {
  return Math.round((w * FACE_PHOTO.h) / FACE_PHOTO.w);
}

export function buildFaceMapTexture(w = 1024, pal: SlabPalette | null = null): THREE.CanvasTexture {
  const h = faceMapHeight(w);
  const { canvas, ctx } = makeCanvas(w, h);
  drawFaceMap(ctx, w, h, pal);
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
