/**
 * Colour science + artwork sampling for the dynamic palette system.
 *
 * This module is deliberately DOM-free: extraction works on a raw RGBA buffer
 * (any caller may downsample with whatever canvas it has), so the whole
 * derivation is unit-testable in node and identical between the browser and
 * the verify scripts.
 *
 * The system it serves is NOT "fixed colours per card type". It derives one
 * coordinated palette from the visual character of an artwork:
 *
 *   1. the large-area background / backdrop of the artwork, then the dominant
 *      subject colour, then overall lightness + saturation, then secondary
 *      accents — in that order of authority (small bright details must not
 *      determine a palette by themselves),
 *   2. converted into an environmental colour *family* (saturated reds become
 *      a deep red-magenta environment, neutrals a charcoal one, cyans a light
 *      airy one, pastels a soft desaturated one ...), i.e. lightened,
 *      darkened, softened or desaturated rather than copied,
 *   3. and applied through a fixed tonal hierarchy (the slab's measured
 *      lightness ramp), so the artwork decides hue family and mood while the
 *      card system keeps lightness hierarchy, saturation control and contrast.
 *
 * Everything happens in OKLab/OKLCH: perceptually uniform, so a lightness
 * hierarchy survives a hue change intact, and lerps travel through colour
 * space without the grey midpoint an sRGB lerp produces.
 */

/* ------------------------------------------------------------------ *
 * sRGB <-> linear <-> OKLab <-> OKLCH
 * ------------------------------------------------------------------ */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}
export interface Lab {
  L: number;
  a: number;
  b: number;
}
export interface Lch {
  L: number;
  C: number;
  H: number;
}

export const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

export const linearToSrgb = (c: number): number =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;

export function hexToRgb(hex: string): Rgb {
  let v = hex.replace('#', '').trim();
  if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
  const n = parseInt(v.slice(0, 6), 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 };
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const q = (x: number) =>
    Math.round(Math.min(1, Math.max(0, x)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${q(r)}${q(g)}${q(b)}`;
}

export function linearToLab({ r, g, b }: Rgb): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function labToLinear({ L, a, b }: Lab): Rgb {
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export const labToLch = ({ L, a, b }: Lab): Lch => {
  let H = (Math.atan2(b, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C: Math.hypot(a, b), H };
};

export const lchToLab = ({ L, C, H }: Lch): Lab => {
  const h = (H * Math.PI) / 180;
  return { L, a: Math.cos(h) * C, b: Math.sin(h) * C };
};

/** hex (sRGB) -> OKLCH */
export function hexToLch(hex: string): Lch {
  const { r, g, b } = hexToRgb(hex);
  return labToLch(linearToLab({ r: srgbToLinear(r), g: srgbToLinear(g), b: srgbToLinear(b) }));
}

/** OKLCH -> hex (sRGB), clamped into gamut by dropping chroma first */
export function lchToHex({ L, C, H }: Lch): string {
  const fit = gamutFit(L, C, H);
  const { r, g, b } = labToLinear(lchToLab(fit));
  return rgbToHex(linearToSrgb(r), linearToSrgb(g), linearToSrgb(b));
}

const inGamut = (c: Rgb) =>
  c.r >= -0.0005 && c.r <= 1.0005 && c.g >= -0.0005 && c.g <= 1.0005 && c.b >= -0.0005 && c.b <= 1.0005;

/**
 * Reduce chroma (never lightness, never hue) until the tone is representable
 * in sRGB. Bisected: dark saturated tones and pale saturated ones both leave
 * the gamut, and clamping the linear channels instead would bend the hue.
 */
export function gamutFit(L: number, C: number, H: number): Lch {
  let lo = 0;
  let hi = C;
  if (inGamut(labToLinear(lchToLab({ L, C: hi, H })))) return { L, C: hi, H };
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(labToLinear(lchToLab({ L, C: mid, H })))) lo = mid;
    else hi = mid;
  }
  return { L, C: lo, H };
}

/* ------------------------------------------------------------------ *
 * Blending + hashing
 * ------------------------------------------------------------------ */

/** Perceptual blend of two sRGB hexes; t = 0 keeps a, t = 1 returns b. */
export function mixHex(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const la = lchToLab(hexToLch(a));
  const lb = lchToLab(hexToLch(b));
  const lab = { L: la.L + (lb.L - la.L) * t, a: la.a + (lb.a - la.a) * t, b: la.b + (lb.b - la.b) * t };
  const { r, g, b: bb } = labToLinear(lab);
  return rgbToHex(linearToSrgb(r), linearToSrgb(g), linearToSrgb(bb));
}

/** Shortest signed angular distance a -> b, degrees. */
export function hueDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Circular mean of hues, weighted. */
export function circularMean(hues: number[], weights: number[]): number {
  let x = 0;
  let y = 0;
  for (let i = 0; i < hues.length; i++) {
    const h = (hues[i] * Math.PI) / 180;
    x += Math.cos(h) * (weights[i] ?? 1);
    y += Math.sin(h) * (weights[i] ?? 1);
  }
  if (x === 0 && y === 0) return 0;
  let d = (Math.atan2(y, x) * 180) / Math.PI;
  if (d < 0) d += 360;
  return d;
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ *
 * Artwork sampling
 *
 * The caller hands in a DOWNSAMPLED rgba buffer (<= ~128 px on the long side
 * is plenty: the sampling averages 4 px blocks, so a detail smaller than a
 * block — an orange accessory, a red collar, a sparkle — is averaged away
 * before it can vote, which is exactly the "small bright details do not
 * determine the palette" rule).
 * ------------------------------------------------------------------ */

export interface ArtworkSample {
  /** area-weighted mean lightness, 0..1 */
  meanL: number;
  /** lightness standard deviation: the artwork's contrast */
  sdL: number;
  /** mean chroma of the whole image */
  meanC: number;
  /** share of blocks that are effectively neutral (C < 0.02) */
  neutralShare: number;
  /** hue of the dominant visual family (backdrop-weighted), degrees */
  familyHue: number;
  /** mean chroma of the blocks that belong to that family */
  familyC: number;
  /** mean lightness of the backdrop ring (the artwork's own background) */
  backdropL: number;
  /** chroma mass of the backdrop ring, 0..1 of its block weight */
  backdropC: number;
  /** visually important secondary hue, or null */
  accentHue: number | null;
  /** circular spread (deg) of the family's own hues */
  hueSpread: number;
}

interface Block {
  L: number;
  C: number;
  H: number;
  row: number;
  col: number;
}

function blocks(data: ArrayLike<number>, w: number, h: number, size = 4): Block[] {
  const out: Block[] = [];
  const bw = Math.max(1, Math.floor(w / size));
  const bh = Math.max(1, Math.floor(h / size));
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      const x0 = Math.floor((bx * w) / bw);
      const x1 = Math.max(x0 + 1, Math.floor(((bx + 1) * w) / bw));
      const y0 = Math.floor((by * h) / bh);
      const y1 = Math.max(y0 + 1, Math.floor(((by + 1) * h) / bh));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          r += srgbToLinear(data[i] / 255);
          g += srgbToLinear(data[i + 1] / 255);
          b += srgbToLinear(data[i + 2] / 255);
          n++;
        }
      }
      if (!n) continue;
      const lab = linearToLab({ r: r / n, g: g / n, b: b / n });
      const lch = labToLch(lab);
      out.push({ ...lch, row: by, col: bx });
    }
  }
  return out;
}

interface HueBin {
  mass: number;
  chroma: number;
  cells: Set<number>;
  hues: number[];
  weights: number[];
}

/**
 * @param data  RGBA bytes of the downsampled artwork
 * @param w,h   its dimensions
 * @param block block size in px for the large-area averaging (default 4)
 */
export function sampleArtwork(data: ArrayLike<number>, w: number, h: number, block = 4): ArtworkSample {
  const bl = blocks(data, w, h, block);
  const n = Math.max(1, bl.length);
  const bw = Math.max(1, Math.floor(w / block));
  const bh = Math.max(1, Math.floor(h / block));

  let meanL = 0;
  let meanC = 0;
  let neutral = 0;
  for (const q of bl) {
    meanL += q.L;
    meanC += q.C;
    if (q.C < 0.02) neutral++;
  }
  meanL /= n;
  meanC /= n;
  let sdL = 0;
  for (const q of bl) sdL += (q.L - meanL) ** 2;
  sdL = Math.sqrt(sdL / n);

  /* Hue histogram with a large-area bias: a hue's vote is its chroma mass
   * multiplied by how widely it is spread over a coarse 4x4 cell grid. A hue
   * confined to one corner (a red collar, a logo) loses to a hue that covers
   * the backdrop, even at equal pixel count. */
  const bins = new Map<number, HueBin>();
  const coarse = 4;
  for (const q of bl) {
    if (q.C < 0.012) continue; // neutrals carry no hue information
    const bucket = Math.floor((((q.H + 7.5) % 360) / 15)) % 24;
    const bin = bins.get(bucket) ?? { mass: 0, chroma: 0, cells: new Set<number>(), hues: [], weights: [] };
    const weight = 0.35 + q.C;
    bin.mass += weight;
    bin.chroma += q.C * weight;
    bin.cells.add(Math.min(coarse - 1, Math.floor((q.row / bh) * coarse)) * coarse + Math.min(coarse - 1, Math.floor((q.col / bw) * coarse)));
    bin.hues.push(q.H);
    bin.weights.push(weight);
    bins.set(bucket, bin);
  }
  const scored = [...bins.entries()].map(([bucket, bin]) => {
    const spread = bin.cells.size / (coarse * coarse);
    return { bucket, bin, hue: circularMean(bin.hues, bin.weights), score: bin.mass * (0.4 + 0.6 * Math.sqrt(spread)) };
  });
  scored.sort((a, b) => b.score - a.score);

  /* The backdrop: the outer ring of blocks — the artwork's own background is
   * the strongest authority on the environmental family (§1.1). */
  const ring = bl.filter((q) => {
    const er = Math.min(q.row, bh - 1 - q.row);
    const ec = Math.min(q.col, bw - 1 - q.col);
    return Math.min(er, ec) <= Math.max(1, Math.round(Math.min(bh, bw) * 0.09));
  });
  const ringBins = new Map<number, { mass: number; hues: number[]; weights: number[]; chroma: number }>();
  for (const q of ring) {
    if (q.C < 0.012) continue;
    const bucket = Math.floor((((q.H + 7.5) % 360) / 15)) % 24;
    const bin = ringBins.get(bucket) ?? { mass: 0, hues: [], weights: [], chroma: 0 };
    const weight = 0.35 + q.C;
    bin.mass += weight;
    bin.chroma += q.C * weight;
    bin.hues.push(q.H);
    bin.weights.push(weight);
    ringBins.set(bucket, bin);
  }
  let ringTop: { hue: number; mass: number; chroma: number } | null = null;
  for (const [, bin] of ringBins) {
    if (!ringTop || bin.mass > ringTop.mass) {
      ringTop = { hue: circularMean(bin.hues, bin.weights), mass: bin.mass, chroma: bin.chroma / Math.max(1e-6, bin.mass) };
    }
  }
  const ringWeighted = ring.length ? ring.reduce((s, q) => s + (0.35 + q.C), 0) : 0;
  const backdropStrength = ringWeighted ? (ringTop?.mass ?? 0) / ringWeighted : 0;

  const topHue = scored[0]?.hue ?? 0;
  /* Family hue: the backdrop's hue when the backdrop actually carries colour;
   * otherwise the image-wide dominant hue. A colourful subject on a neutral
   * backdrop still leads (its chroma mass owns the histogram). */
  const familyHue =
    ringTop && backdropStrength > 0.3 && ringTop.chroma > 0.012
      ? circularMean([ringTop.hue, topHue], [0.62, 0.38])
      : topHue;

  /* Family membership + its chroma and spread. */
  let famC = 0;
  let famN = 0;
  const famHues: number[] = [];
  const famWeights: number[] = [];
  for (const q of bl) {
    if (q.C < 0.012) continue;
    if (Math.abs(hueDelta(familyHue, q.H)) <= 40) {
      famC += q.C;
      famN++;
      famHues.push(q.H);
      famWeights.push(0.35 + q.C);
    }
  }
  const familyC = famN ? famC / famN : meanC;
  let hueSpread = 0;
  if (famN > 1) {
    for (let i = 0; i < famHues.length; i++) {
      const d = hueDelta(familyHue, famHues[i]);
      hueSpread += d * d * famWeights[i];
    }
    hueSpread = Math.sqrt(hueSpread / famWeights.reduce((s, x) => s + x, 0));
  }

  /* Accent: the strongest hue peak that is genuinely a different hue and big
   * enough to matter (§1.4 — secondary accents only when visually important). */
  let accentHue: number | null = null;
  const topScore = scored[0]?.score ?? 0;
  for (const s of scored.slice(1)) {
    if (Math.abs(hueDelta(familyHue, s.hue)) >= 45 && s.score >= topScore * 0.22 && s.bin.mass / n >= 0.06) {
      accentHue = s.hue;
      break;
    }
  }

  let backdropL = meanL;
  if (ring.length) backdropL = ring.reduce((s, q) => s + q.L, 0) / ring.length;

  return {
    meanL,
    sdL,
    meanC,
    neutralShare: neutral / n,
    familyHue,
    familyC,
    backdropL,
    backdropC: ringTop?.chroma ?? 0,
    accentHue,
    hueSpread,
  };
}

/* ------------------------------------------------------------------ *
 * From artwork to atmosphere
 *
 * The anchors are the whole "convert the artwork into a broader colour
 * atmosphere" step: one hue, one chroma, one lightness curve and one mood.
 * They are calibrated against the reference artwork:
 * `public/cards/Gjw0CRRXoAMjU8i.jpg` samples meanL 0.456 / sdL 0.210 /
 * familyC 0.049, and at exactly those numbers the anchors below reduce to the
 * identity transform — i.e. the system reproduces the measured reference
 * palette from the reference artwork, and everything else is a departure from
 * it in proportion to how the artwork differs.
 * ------------------------------------------------------------------ */

export const CALIBRATION = { meanL: 0.456, sdL: 0.21, familyC: 0.049 } as const;

export type PaletteMood = 'cinematic' | 'balanced' | 'pastel' | 'neutral' | 'vivid';

export interface PaletteAnchors {
  /** family hue, degrees */
  hue: number;
  /** family chroma at the middle of the lightness ramp */
  chroma: number;
  /** lightness contrast gain about the 0.5 pivot */
  gain: number;
  /** lightness offset (pale/hazy vs deep/cinematic) */
  lift: number;
  /** how much of the source's own hue variation survives into the family */
  hueSpread: number;
  /** true when the artwork reads neutral/grayscale */
  neutral: boolean;
  mood: PaletteMood;
}

export function classifyMood(s: ArtworkSample): PaletteMood {
  if (s.neutralShare > 0.72 || s.meanC < 0.02) return 'neutral';
  if (s.meanL > 0.62 && s.sdL < 0.14) return 'pastel';
  if (s.meanL < 0.4 || s.sdL > 0.24) return 'cinematic';
  if (s.meanC > 0.13) return 'vivid';
  return 'balanced';
}

export function deriveAnchors(s: ArtworkSample): PaletteAnchors {
  const mood = classifyMood(s);

  /* Saturation control: the family's chroma in the artwork is softened into
   * an environmental chroma — never copied. Calibrated so familyC 0.049
   * (the reference art) maps to the reference palette's own mid chroma.
   * Truly neutral art collapses to a whisper of chroma (charcoal/grey
   * environments), very saturated art is capped well below its source. */
  const gate = smoothstep(0.006, 0.03, s.familyC);
  const rich = clamp(1 + (CALIBRATION.meanL - s.meanL) * 0.45, 0.82, 1.22); // dark art = richer
  const soft = clamp(1 - (s.meanL - CALIBRATION.meanL) * 0.35, 0.8, 1.1); // pale art = softer
  const satControl = clamp(0.55 + 9.2 * s.familyC, 0.5, 1.7) * gate * rich * soft;
  const chroma = 0.0295 * satControl;

  /* Lightness curve: contrast follows the artwork's own contrast (high
   * contrast -> cinematic depth, low contrast -> hazy pale field), and the
   * whole environment drifts with the artwork's lightness. */
  const gain = clamp(1 + (s.sdL - CALIBRATION.sdL) * 1.1, 0.68, 1.3);
  /* Mood carries depth as well as contrast: dark or high-contrast art gets a
   * deeper, more cinematic floor; pastels a lifted hazy one; and a strongly
   * saturated family reads "dramatic" even at mid lightness, so its floor
   * deepens with the family's own chroma. All three terms vanish at the
   * calibration point (the reference artwork is 'balanced', familyC 0.049). */
  const moodLift = mood === 'cinematic' ? -0.06 : mood === 'pastel' ? 0.03 : 0;
  const satDepth = smoothstep(0.05, 0.16, s.familyC) * 0.06;
  const lift = clamp(
    (CALIBRATION.sdL - s.sdL) * 0.5 + (s.meanL - CALIBRATION.meanL) * 0.3 + moodLift - satDepth,
    -0.16,
    0.24
  );

  const hueSpread = clamp(0.16 + (s.hueSpread / 55) * 0.6, 0.16, 0.8);

  return {
    hue: s.familyHue,
    chroma,
    gain,
    lift,
    hueSpread,
    neutral: mood === 'neutral',
    mood,
  };
}
