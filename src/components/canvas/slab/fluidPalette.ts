'use client';

import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Dynamic fluid palette
 *
 * When the Forge's subject image loads (default asset, fetched NFT or a
 * local upload) its artwork is sampled once on a 64 x 64 canvas and
 * reduced to a three-colour palette:
 *
 *   primary   — the dominant hue: drives the ambient background, the
 *               void gradient's dark stop and the glass body
 *   secondary — a mid-tone: drives reflections, the gradient's middle
 *               stop and the attenuation tint
 *   accent    — the most vibrant hue: drives rim/gleam tints and the
 *               foil ramp's hot stops
 *
 * `fluidEngine` holds every animated channel the Forge consumes (scene
 * background, backdrop stops, glass body/attenuation, lightformer
 * tints, and the holo shader's fixed colours) with TODAY'S values as
 * the bases, so before any extraction lands — and for every consumer
 * that never opts in — the scene renders exactly as before. tick() is
 * driven once per frame from the Forge and exponentially damps each
 * channel toward its target (lambda 3.5 ~= 94% settled at 0.8 s, ~98%
 * at 1 s — inside the requested 0.8..1.2 s window).
 *
 * Only the Forge mounts the driver and passes `fluid` to <Slab>; the
 * pit and the reference view render the shared singletons and default
 * uniforms, bit-identical to before.
 * ------------------------------------------------------------------ */

export interface ExtractedPalette {
  /** dominant ambient hue (raw sRGB) */
  primary: THREE.Color;
  /** mid-tone (raw sRGB) */
  secondary: THREE.Color;
  /** high-vibrancy hue (raw sRGB) */
  accent: THREE.Color;
}

export interface FluidChannels {
  /* scene background + backdrop gradient (the void's three stops) */
  background: THREE.Color;
  dark: THREE.Color;
  glowStop: THREE.Color;
  paleStop: THREE.Color;
  /* the hero glass: body tone and depth attenuation */
  glass: THREE.Color;
  glassAtten: THREE.Color;
  /* lightformer modulation tint (mixed over each former's base) */
  former: THREE.Color;
  /* the holo shader's fixed colours: foil ramp + ice + gold stops */
  foil1: THREE.Color;
  foil2: THREE.Color;
  foil3: THREE.Color;
  foil4: THREE.Color;
  ice: THREE.Color;
  goldA: THREE.Color;
  goldB: THREE.Color;
}

/** sRGB Rec.709 luma of a raw-sRGB colour's components */
function luma(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** HSV saturation of raw-sRGB components */
function satOf(c: THREE.Color): number {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  return mx <= 1e-5 ? 0 : (mx - mn) / mx;
}

/** hue in turns [0,1) of raw-sRGB components */
function hueOf(c: THREE.Color): number {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  const d = mx - mn;
  if (d <= 1e-5) return 0;
  let h: number;
  if (mx === c.r) h = ((c.g - c.b) / d) % 6;
  else if (mx === c.g) h = (c.b - c.r) / d + 2;
  else h = (c.r - c.g) / d + 4;
  h /= 6;
  return h < 0 ? h + 1 : h;
}

/** shortest distance between two hues, in turns */
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
}

/** clamp a raw-sRGB colour's luma to [lo, hi], preserving hue+sat ratio */
function withLuma(c: THREE.Color, lo: number, hi: number): THREE.Color {
  const out = c.clone();
  const l = luma(out);
  const t = l < lo ? lo / Math.max(l, 1e-5) : l > hi ? hi / Math.max(l, 1e-5) : 1;
  out.r = Math.min(1, out.r * t);
  out.g = Math.min(1, out.g * t);
  out.b = Math.min(1, out.b * t);
  return out;
}

/** lift saturation to at least `min`, preserving hue and luma */
function withSat(c: THREE.Color, min: number): THREE.Color {
  const out = c.clone();
  const s = satOf(out);
  if (s >= min) return out;
  const l = luma(out);
  const k = min / Math.max(s, 1e-5);
  // scale each channel out from the luma until the spread reaches min
  out.r = Math.min(1, l + (out.r - l) * k);
  out.g = Math.min(1, l + (out.g - l) * k);
  out.b = Math.min(1, l + (out.b - l) * k);
  return out;
}

function mixColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return a.clone().lerp(b, t);
}

/**
 * Sample a loaded image down to 64 x 64 and reduce it to a three-colour
 * palette. One-off per image load (a 4k-pixel pass — microseconds), fully
 * deterministic, no allocations beyond the one small canvas.
 */
export function extractPalette(img: HTMLImageElement): ExtractedPalette {
  const SIZE = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  // quantised histogram: 4 bits per channel, weighted count per bin
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key);
    if (bin) { bin.n++; bin.r += r; bin.g += g; bin.b += b; }
    else bins.set(key, { n: 1, r, g, b });
  }
  if (bins.size === 0) {
    // fully transparent image: fall back to the resting mauve
    return {
      primary: new THREE.Color('#35202f'),
      secondary: new THREE.Color('#5b4153'),
      accent: new THREE.Color('#ee5c28'),
    };
  }

  const entries = [...bins.values()]
    .map((bin) => ({
      n: bin.n,
      color: new THREE.Color(bin.r / bin.n / 255, bin.g / bin.n / 255, bin.b / bin.n / 255),
    }))
    .sort((a, b) => b.n - a.n);
  const top = entries[0].n;

  // PRIMARY: straight dominance — the background usually wins, which is
  // exactly what the ambient channel wants
  const primary = withLuma(entries[0].color, 0.10, 0.34);

  // ACCENT: the most vibrant well-occupied bin, hue-distinct from primary
  let accent = new THREE.Color(0, 0, 0);
  let accentScore = -1;
  for (const e of entries.slice(0, 14)) {
    if (e.n < top * 0.015) break;
    const s = satOf(e.color);
    const l = luma(e.color);
    const score = Math.pow(s, 1.3) * (0.35 + l) * Math.sqrt(e.n / top);
    if (score > accentScore && hueDist(hueOf(e.color), hueOf(primary)) > 0.09) {
      accentScore = score;
      accent = e.color;
    }
  }
  if (accentScore < 0) accent = mixColor(primary, new THREE.Color('#e2622a'), 0.85);
  accent = withSat(withLuma(accent, 0.34, 0.72), 0.5);

  // SECONDARY: the mid-tone bin closest to luma 0.45 that is hue-distinct
  // from the accent; falls back to a primary/accent blend
  let secondary = new THREE.Color(0, 0, 0);
  let secondaryScore = Infinity;
  for (const e of entries.slice(0, 20)) {
    if (e.n < top * 0.03) break;
    const l = luma(e.color);
    const pen = Math.abs(l - 0.45) + (hueDist(hueOf(e.color), hueOf(accent)) < 0.07 ? 1 : 0);
    if (pen < secondaryScore) { secondaryScore = pen; secondary = e.color; }
  }
  if (secondaryScore === Infinity) secondary = mixColor(primary, accent, 0.4);
  secondary = withLuma(secondary, 0.26, 0.60);

  return { primary, secondary, accent };
}

/* ------------------------------------------------------------------ *
 * Channel bases: every value the scene renders today. Before the first
 * extraction — and whenever a consumer never opts in — these are the
 * values in play, bit-identical to the pre-fluid scene.
 * ------------------------------------------------------------------ */

const BASE: FluidChannels = {
  background: new THREE.Color('#352334'),
  dark: new THREE.Color('#35202f'),
  glowStop: new THREE.Color('#5b4153'),
  paleStop: new THREE.Color('#b5a3b0'),
  glass: new THREE.Color('#a493a2'),
  glassAtten: new THREE.Color('#b7a2b4'),
  former: new THREE.Color('#ffffff'),
  foil1: new THREE.Color(1.0, 0.48, 0.22),
  foil2: new THREE.Color(0.32, 0.78, 0.92),
  foil3: new THREE.Color(1.0, 0.82, 0.34),
  foil4: new THREE.Color(0.92, 0.35, 0.72),
  ice: new THREE.Color(0.78, 0.88, 1.0),
  goldA: new THREE.Color(1.0, 0.86, 0.36),
  goldB: new THREE.Color(0.62, 0.42, 0.09),
};

/**
 * Map an extracted artwork palette onto every animated channel. Storage
 * conventions match each consumer: `set('#hex')` colours for the scene
 * background / materials (three converts sRGB to working linear), raw
 * components for the void's uniforms (that shader writes straight to the
 * canvas), and sRGB-to-linear components for the holo uniforms (whose
 * literals are linear values the colorspace chunk then encodes).
 */
export function deriveFluidTarget(p: ExtractedPalette): FluidChannels {
  const primary = p.primary;
  const secondary = p.secondary;
  const accent = p.accent;

  // ambient family: primary leads, never bright (raw sRGB space)
  const dark = withLuma(primary, 0.08, 0.26);
  const background = withLuma(mixColor(primary, secondary, 0.25), 0.10, 0.28).convertSRGBToLinear();
  const glowStop = withLuma(mixColor(primary, secondary, 0.62), 0.16, 0.38);
  const paleStop = withLuma(mixColor(secondary, mixColor(accent, new THREE.Color('#ffffff'), 0.55), 0.7), 0.42, 0.72);

  // glass: a light body tone in the palette's family, like the resting
  // mauve (#a493a2 ~ luma 0.60) is in the reference's family. Material
  // colours live in three's linear working space, so convert.
  const glass = withLuma(mixColor(secondary, primary, 0.35), 0.48, 0.68).convertSRGBToLinear();
  const glassAtten = withLuma(mixColor(secondary, primary, 0.5), 0.55, 0.75).convertSRGBToLinear();

  // former modulation: the accent, heavily pulled back toward white so the
  // strip lights stay near-neutral (they are highlights, not gels). Stored
  // linear so the driver can copy it straight against material colours.
  const former = accent.clone().convertSRGBToLinear().lerp(new THREE.Color(1, 1, 1), 0.72);

  // holo ramp: each stop keeps its position in the order but swings its hue
  // toward the palette (foil stops are stored as the shader's linear
  // literals, so the extracted sRGB colours convert first)
  const toLin = (c: THREE.Color) => c.clone().convertSRGBToLinear();
  const foil1 = toLin(mixColor(new THREE.Color('#e87a38'), accent, 0.62));
  const foil2 = toLin(mixColor(new THREE.Color('#52c7eb'), secondary, 0.55));
  const foil3 = toLin(mixColor(new THREE.Color('#ffd157'), paleStop, 0.5));
  const foil4 = toLin(mixColor(new THREE.Color('#eb5ab8'), accent, 0.55));
  const ice = toLin(mixColor(new THREE.Color('#c7e0ff'), secondary, 0.45));
  const goldA = toLin(mixColor(new THREE.Color('#ffdb5c'), accent, 0.5));
  const goldB = toLin(mixColor(new THREE.Color('#9e6b17'), mixColor(accent, secondary, 0.4), 0.35));

  return { background, dark, glowStop, paleStop, glass, glassAtten, former, foil1, foil2, foil3, foil4, ice, goldA, goldB };
}

/* ------------------------------------------------------------------ *
 * The engine: current channel values + per-frame exponential damping.
 * A module singleton is enough — only the Forge mounts the driver, and
 * `mounted` gates every consumer so nothing animates elsewhere.
 * ------------------------------------------------------------------ */

const LAMBDA = 3.5; // ~94% settled at 0.8 s, ~98% at 1.0 s

function cloneChannels(c: FluidChannels): FluidChannels {
  const out = {} as FluidChannels;
  for (const k of Object.keys(c) as (keyof FluidChannels)[]) out[k] = c[k].clone();
  return out;
}

class FluidEngine {
  /** live, already-smoothed values — consumers read these every frame */
  readonly current: FluidChannels = cloneChannels(BASE);
  private target: FluidChannels = cloneChannels(BASE);
  /** true while the Forge's driver is mounted; consumers gate on this */
  mounted = false;

  /** queue a new artwork palette (already derived); damping eases into it */
  setTarget(channels: FluidChannels) {
    this.target = channels;
  }

  /** advance the interpolation; call once per frame from the driver */
  tick(dt: number) {
    const k = 1 - Math.exp(-LAMBDA * Math.max(0, Math.min(dt, 1 / 30)));
    const cur = this.current as unknown as Record<string, THREE.Color>;
    const tgt = this.target as unknown as Record<string, THREE.Color>;
    for (const key of Object.keys(cur)) cur[key].lerp(tgt[key], k);
  }

  /** snap back to the resting look (used when the image fails to load) */
  reset() {
    this.target = cloneChannels(BASE);
  }
}

export const fluidEngine = new FluidEngine();

/** the holo shader's palette, as its component prop expects */
export function holoShaderPalette(): {
  foil: [THREE.Color, THREE.Color, THREE.Color, THREE.Color];
  ice: THREE.Color;
  goldA: THREE.Color;
  goldB: THREE.Color;
} {
  return {
    foil: [fluidEngine.current.foil1, fluidEngine.current.foil2, fluidEngine.current.foil3, fluidEngine.current.foil4],
    ice: fluidEngine.current.ice,
    goldA: fluidEngine.current.goldA,
    goldB: fluidEngine.current.goldB,
  };
}
