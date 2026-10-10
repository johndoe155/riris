'use client';

export interface ForgePalette {
  /** The dark-to-pale atmospheric ramp used by the Forge void. */
  backdrop: { dark: string; glow: string; pale: string };
  /** Palette roles for the acrylic, moulding, tray, and card furniture. */
  surfaces: {
    shell: string;
    shellLight: string;
    face: string;
    tray: string;
    label: string;
    card: string;
    ridge: string;
    tab: string;
  };
  /** Lightformer colors; intensities and positions remain part of the rig. */
  lights: { key: string; fill: string; bounce: string; specular: string };
  /** Finish-adaptation colors used by the card shader. */
  shader: { base: string; cool: string; warm: string };
  /** Used to avoid re-extracting the same source image. */
  source: string;
}

type RGB = [number, number, number];
type HSL = { h: number; s: number; l: number };

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const srgb = (n: number) => clamp(n / 255);

function rgbToHsl([r0, g0, b0]: RGB): HSL {
  const r = srgb(r0); const g = srgb(g0); const b = srgb(b0);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const d = max - min; const l = (max + min) / 2;
  if (d < 0.0001) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToHex({ h, s, l }: HSL): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  const rgb: RGB = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${rgb.map((v) => Math.round(clamp(v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(a: string, b: string, t: number): string {
  const parse = (v: string): RGB => [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
  const aa = parse(a); const bb = parse(b);
  return `#${aa.map((v, i) => Math.round(v + (bb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function lighten(color: HSL, amount: number, saturation = color.s): string {
  return hslToHex({ h: color.h, s: clamp(saturation), l: clamp(color.l + amount) });
}

function darken(color: HSL, amount: number, saturation = color.s): string {
  return hslToHex({ h: color.h, s: clamp(saturation), l: clamp(color.l - amount) });
}

export const DEFAULT_FORGE_PALETTE: ForgePalette = {
  backdrop: { dark: '#35202f', glow: '#5b4153', pale: '#b5a3b0' },
  surfaces: { shell: '#a493a2', shellLight: '#cbbfca', face: '#91808c', tray: '#473642', label: '#3b2a36', card: '#473642', ridge: '#91808c', tab: '#b8aab5' },
  lights: { key: '#fff6fa', fill: '#e6dce8', bounce: '#6d5b66', specular: '#ffffff' },
  shader: { base: '#ffffff', cool: '#c8e7f0', warm: '#f1c676' },
  source: 'default',
};

/**
 * Extracts an atmosphere rather than copying literal swatches: large-area
 * pixels determine hue and luminance, while small saturated accents are only
 * allowed to steer the hue when they have meaningful image weight.
 */
export function extractForgePalette(image: HTMLImageElement, source = image.currentSrc || image.src): ForgePalette {
  const size = 40;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { ...DEFAULT_FORGE_PALETTE, source };
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let total = 0; let lum = 0; let sat = 0; let hueX = 0; let hueY = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3] / 255;
    if (alpha < 0.08) continue;
    const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
    const hsl = rgbToHsl(rgb);
    // De-emphasize tiny high-energy highlights and near-white borders.
    const weight = alpha * (0.35 + 0.65 * (1 - Math.max(0, hsl.l - 0.72) / 0.28));
    total += weight; lum += hsl.l * weight; sat += hsl.s * weight;
    const radians = (hsl.h * Math.PI) / 180;
    hueX += Math.cos(radians) * hsl.s * weight;
    hueY += Math.sin(radians) * hsl.s * weight;
  }
  if (!total) return { ...DEFAULT_FORGE_PALETTE, source };
  const averageL = clamp(lum / total, 0.12, 0.82);
  const averageS = clamp(sat / total, 0, 0.85);
  const chroma = Math.hypot(hueX, hueY) / total;
  const hue = (Math.atan2(hueY, hueX) * 180 / Math.PI + 360) % 360;
  const neutral = clamp(1 - chroma * 2.6, 0, 1);
  const familyS = clamp(averageS * 0.72 * (1 - neutral) + 0.035 * neutral, 0.035, 0.62);
  const family: HSL = { h: hue, s: familyS, l: averageL };
  const dark = darken(family, 0.28, familyS * 0.88);
  const glow = lighten(family, 0.02, familyS * 0.72);
  const pale = lighten(family, 0.34, familyS * 0.48);
  const label = darken(family, 0.17, familyS * 0.8);
  const card = lighten(family, 0.04, familyS * 0.58);
  const face = lighten(family, 0.13, familyS * 0.45);
  const shell = lighten(family, 0.22, familyS * 0.38);
  const shellLight = lighten(family, 0.4, familyS * 0.25);
  const tray = darken(family, 0.11, familyS * 0.74);
  const ridge = lighten(family, 0.12, familyS * 0.4);
  const tab = lighten(family, 0.29, familyS * 0.3);
  const contrast = averageL > 0.52 ? '#17151a' : '#f8f6f2';
  const accentWarm = hslToHex({ h: (hue + 24) % 360, s: clamp(familyS * 0.9 + 0.12, 0.12, 0.72), l: 0.64 });
  const accentCool = hslToHex({ h: (hue + 188) % 360, s: clamp(familyS * 0.62 + 0.08, 0.08, 0.6), l: 0.72 });
  return {
    backdrop: { dark, glow, pale },
    surfaces: { shell, shellLight, face, tray, label, card, ridge, tab },
    lights: { key: mixHex('#ffffff', pale, 0.35), fill: mixHex('#f3f4ff', pale, 0.5), bounce: mixHex(dark, '#111016', 0.35), specular: contrast === '#17151a' ? '#fffdfb' : '#ffffff' },
    shader: { base: contrast, cool: accentCool, warm: accentWarm },
    source,
  };
}
