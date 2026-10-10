'use client';

import {
  clamp,
  deriveAnchors,
  gamutFit,
  hexToLch,
  hueDelta,
  labToLinear,
  lchToHex,
  lchToLab,
  linearToSrgb,
  mixHex,
  smoothstep,
  srgbToLinear,
  type ArtworkSample,
  type PaletteAnchors,
  type PaletteMood,
} from '../../../lib/palette';
import { FACE_GRID, SLAB_SPEC } from './SlabSpec';

/* ------------------------------------------------------------------ *
 * The palette manifest
 *
 * EVERY explicitly coloured element of the Forge preview, the slab and the
 * card, in one record, each slot named after the element it paints. This is
 * the single place the dynamic colour system can see the whole scene, and
 * the single place the reference look is pinned: `REFERENCE_PALETTE` holds
 * today's measured literals, so a slab rendered with it is pixel-identical
 * to a slab rendered with no palette at all (that identity is asserted in
 * scripts/verify/palette-smoke.mjs).
 *
 * Colours are sRGB hex exactly as the painters and materials consume them.
 * The shader block is the exception: the GLSL works in linear light, so its
 * triples are LINEAR values (the very constants the shader carries today).
 * ------------------------------------------------------------------ */

export interface ShaderPalette {
  /** diffraction stop 2 (the cool order of the foil ramp) */
  foilB: [number, number, number];
  /** diffraction stop 3 (the warm-yellow order) */
  foilC: [number, number, number];
  /** diffraction stop 4 (the magenta order) */
  foilD: [number, number, number];
  /** cracked-ice tint */
  ice: [number, number, number];
  /** gold finish: bright order / dark order */
  goldA: [number, number, number];
  goldB: [number, number, number];
}

export interface SlabPalette {
  /** 'reference' for the measured identity, otherwise a signature of the art */
  id: string;
  mood: PaletteMood;
  /** family hue (deg) and its environmental chroma, for diagnostics */
  hue: number;
  chroma: number;
  /** artwork statistics the mood was read from */
  lightness: number;
  contrast: number;
  saturation: number;
  /** typography contrast rule: light ink on the card field */
  inkLight: boolean;

  /* ---- outer scene: the broadest atmospheric version of the family ---- */
  /** <color attach="background"> of the Forge canvas */
  sceneBg: string;
  /** void ramp: dark / glow / pale stops (Backdrop.tsx VoidBackdrop) */
  voidDark: string;
  voidGlow: string;
  voidPale: string;

  /* ---- lighting ---- */
  /** ambient + key directional of the Forge rig */
  ambient: string;
  key: string;
  /** the eight studio Lightformers: the slab's specular vocabulary */
  envKey: string;
  envFill: string;
  envBounce: string;
  envHair: string;
  envSoftbox: string;
  envCounter: string;
  envRearKey: string;
  envRearStrip: string;

  /* ---- plastic / card shell: pale, neutralised versions ---- */
  glassBody: string;
  glassAttenuation: string;
  glassCheap: string;
  facePlate: string;

  /* ---- measured case tones (REF_TONE roles, SlabSpec.ts) ---- */
  faceTop: string;
  faceMid: string;
  faceLeft: string;
  faceRight: string;
  faceBottom: string;
  rimDark: string;
  rimLit: string;
  windowWall: string;
  tray: string;
  trayRailL: string;
  trayRailR: string;
  sideTab: string;
  plate: string;
  cardInk: string;
  cardBodyInk: string;
  cardPaper: string;
  /** the three graded rail tabs */
  ridgeTab1: string;
  ridgeTab2: string;
  ridgeTab3: string;

  /* ---- painted card face: main field + contrast elements ---- */
  /** card body field (the "paper" the furniture prints on) */
  field: string;
  /** keyline / frame / typography ink (contrast rule, not hue match) */
  ink: string;
  /** letterbox fallback tone behind the art panel */
  artEdge: string;

  /* ---- label plate: the concentrated version ---- */
  labelPlum: string;
  labelInk: string;
  labelHairline: string;
  labelBevel: string;
  labelBlankBorder: string;

  /* ---- tray paint: the image panel's framing cavity ---- */
  trayTop: string;
  trayMid: string;
  trayBottom: string;
  trayWallBand: string;
  trayLip: string;

  /* ---- face-plate map paint ---- */
  chamferDark: string;
  chamferLit: string;
  mouldHair: string;
  stepHair: string;
  stepShadow: string;
  windowBand: string;
  sideTabPaintL: string;
  sideTabPaintR: string;
  weldHair: string;
  /** the measured 9x9 tone grid of the face plate */
  faceGrid: string[][];

  /* ---- drawn card back fallback ---- */
  backField: string;
  backInk: string;

  /* ---- shader effects (linear light) ---- */
  shader: ShaderPalette;

  /* ---- brand constants: never remapped ---- */
  /** the orange anchor, identical across every palette */
  accent: string;
  /** Forge HUD label ink, chosen against the void by the contrast rule */
  uiInk: string;
}

/** linear-light triple -> sRGB hex, so shader constants join the pipeline */
export function linearTripleToHex([r, g, b]: [number, number, number]): string {
  const q = (x: number) =>
    Math.round(clamp(linearToSrgb(x), 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${q(r)}${q(g)}${q(b)}`;
}

/** sRGB hex -> linear-light triple (the space the GLSL constants live in) */
export function hexToLinearTriple(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  const n = parseInt(v, 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

/* The shader's hand-tuned constants, in the linear space the GLSL uses. */
const SHADER_REF: ShaderPalette = {
  foilB: [0.32, 0.78, 0.92],
  foilC: [1.0, 0.82, 0.34],
  foilD: [0.92, 0.35, 0.72],
  ice: [0.78, 0.88, 1.0],
  goldA: [1.0, 0.86, 0.36],
  goldB: [0.62, 0.42, 0.09],
};

/**
 * The measured identity: every literal the scene carries today, gathered so
 * that "no palette" and "reference palette" are the same render.
 */
export const REFERENCE_PALETTE: SlabPalette = {
  id: 'reference',
  mood: 'balanced',
  hue: 333.5,
  chroma: 0.0295,
  lightness: 0.456,
  contrast: 0.21,
  saturation: 0.0825,
  inkLight: true,

  sceneBg: '#352334',
  voidDark: '#35202f',
  voidGlow: '#5b4153',
  voidPale: '#b5a3b0',

  ambient: '#ffffff',
  key: '#ffffff',
  envKey: '#fff6fa',
  envFill: '#e6dce8',
  envBounce: '#6d5b66',
  envHair: '#ffffff',
  envSoftbox: '#fff4fa',
  envCounter: '#f6eef6',
  envRearKey: '#efe5ee',
  envRearStrip: '#ffffff',

  glassBody: '#a493a2',
  glassAttenuation: '#b7a2b4',
  glassCheap: '#e4dbe4',
  facePlate: '#ffffff',

  faceTop: '#b3a2af',
  faceMid: '#8c7b87',
  faceLeft: '#40303c',
  faceRight: '#907f8b',
  faceBottom: '#423440',
  rimDark: '#3b2a37',
  rimLit: '#907e8b',
  windowWall: '#8a7986',
  tray: '#473844',
  trayRailL: '#43333f',
  trayRailR: '#685864',
  sideTab: '#b6a9b6',
  plate: '#3d2e3a',
  cardInk: '#473844',
  cardBodyInk: '#352334',
  cardPaper: '#fbf9fb',
  ridgeTab1: SLAB_SPEC.ridgeTabTones[0],
  ridgeTab2: SLAB_SPEC.ridgeTabTones[1],
  ridgeTab3: SLAB_SPEC.ridgeTabTones[2],

  field: '#352334',
  ink: '#fbf9fb',
  artEdge: '#392638',

  labelPlum: '#332333',
  labelInk: '#fbf9fb',
  labelHairline: '#7a6978',
  labelBevel: '#c7b6c4',
  labelBlankBorder: '#d8cbd6',

  trayTop: '#483944',
  trayMid: '#473843',
  trayBottom: '#473844',
  trayWallBand: '#8a7986',
  trayLip: '#d6deee',

  chamferDark: '#3b2a37',
  chamferLit: '#907e8b',
  mouldHair: '#fff7ff',
  stepHair: '#fff7ff',
  stepShadow: '#120a12',
  windowBand: '#8a7986',
  sideTabPaintL: '#b6a9b6',
  sideTabPaintR: '#c3b6c2',
  weldHair: '#fff7ff',
  faceGrid: FACE_GRID.map((row) => row.slice()),

  backField: '#141418',
  backInk: '#F5F3EF',

  shader: {
    foilB: SHADER_REF.foilB.slice() as [number, number, number],
    foilC: SHADER_REF.foilC.slice() as [number, number, number],
    foilD: SHADER_REF.foilD.slice() as [number, number, number],
    ice: SHADER_REF.ice.slice() as [number, number, number],
    goldA: SHADER_REF.goldA.slice() as [number, number, number],
    goldB: SHADER_REF.goldB.slice() as [number, number, number],
  },

  accent: '#FF4D00',
  uiInk: '#F5F3EF',
};

/* ------------------------------------------------------------------ *
 * Retone: apply the family to one measured tone
 *
 * A tone keeps its PLACE on the measured lightness ramp and its relative
 * chroma, and only its hue family + overall saturation/mood move. That is
 * the reusable rule: the artwork determines the hue family and the mood;
 * the card system keeps the lightness hierarchy, the saturation control,
 * the contrast and the material treatment.
 * ------------------------------------------------------------------ */

/** the reference family's own coordinates, in OKLCH */
export const REF_HUE = 333.5;
export const REF_CHROMA = 0.0295;
const PIVOT = 0.5;

export interface RetoneOptions {
  /** multiplier on the chroma scaling (lights want a stronger tint) */
  chromaScale?: number;
  /** override the anchors' hue-spread for this tone (foil keeps its rainbow) */
  hueSpread?: number;
  /** 0..1: how much of the lightness curve this tone follows (1 = fully) */
  lightnessFollow?: number;
}

export function retone(hex: string, a: PaletteAnchors, o: RetoneOptions = {}): string {
  const { L, C, H } = hexToLch(hex);

  /* lightness: the mood's curve about the 0.5 pivot. The extremes are
   * protected — near-white and near-black are contrast elements, chosen for
   * contrast rather than hue matching, so they barely move. */
  const curved = PIVOT + (L - PIVOT) * a.gain + a.lift;
  const follow = o.lightnessFollow ?? 1;
  let protect = 1;
  if (L > 0.9) protect = 0.22;
  else if (L < 0.17) protect = 0.35;
  const Lc = clamp(L + (curved - L) * protect * follow, 0.015, 0.995);

  /* chroma: relative to the reference family, scaled by the environment's
   * own chroma (the saturation control), never above the gamut. */
  let Cc = C * (a.chroma / REF_CHROMA) * (o.chromaScale ?? 1);
  if (a.neutral) Cc = Math.min(Cc, 0.005 + C * 0.22); // grayscale environments

  /* hue: pulled into the family, keeping a fraction of the tone's own
   * deviation from the reference family so lit/shadow shifts survive. */
  const spread = o.hueSpread ?? a.hueSpread;
  const Hc = (a.hue + hueDelta(REF_HUE, H) * spread + 720) % 360;

  return lchToHex(gamutFit(Lc, Cc, Hc));
}

/* ------------------------------------------------------------------ *
 * Derivation: one artwork sample -> the whole manifest
 * ------------------------------------------------------------------ */

export function deriveSlabPalette(sample: ArtworkSample, anchors?: PaletteAnchors): SlabPalette {
  const a = anchors ?? deriveAnchors(sample);
  const R = REFERENCE_PALETTE;
  const t = (hex: string, o?: RetoneOptions) => retone(hex, a, o);

  /* lights: near-white bodies with a deliberate tint of the family — strong
   * enough to read as a gel change, weak enough that the measured material
   * tones stay in charge of the case's colour. */
  const gel = { chromaScale: 3.2 };

  /* ---- typography + linework: the contrast rule, keyed to the ART ----
   * Every white border, rule and glyph on the card face prints in `ink`, so
   * `ink` IS the typography. It follows the artwork's brightness, not the
   * family's hue:
   *
   *   dark art  -> deep paper, white / very light text and borders
   *   light art -> the paper lifts toward the pale end of the family (so the
   *                linework has a surface to bite into) and the ink turns
   *                charcoal / near-black
   *   mid-tone  -> medium paper, high-contrast NEUTRAL ink: the tint is
   *                stripped and the near-black / near-white end with the
   *                greater lightness distance to the paper wins
   *
   * `paperW` is continuous in the art's mean lightness, so two artworks of
   * neighbouring brightness derive neighbouring papers, and the engine glides
   * between any two of them. At the calibration point (reference art,
   * meanL 0.456) paperW is 0 and the mid band is not entered: the measured
   * near-white-on-deep-paper face is reproduced exactly. */
  const paperW = smoothstep(0.58, 0.74, sample.meanL);
  const field = paperW > 0 ? mixHex(t(R.field), t(R.faceTop), paperW) : t(R.field);
  const fieldL = hexToLch(field).L;
  const lightInk = t('#fbf9fb', { chromaScale: 0.6, lightnessFollow: 0.25 });
  const darkInk = t('#171219', { chromaScale: 0.6, lightnessFollow: 0.25 });
  const useLight = fieldL < 0.55; // the higher-contrast end against the paper
  const midTone = fieldL > 0.42 && fieldL < 0.62;
  const neutralise = (hex: string) => {
    const lch = hexToLch(hex);
    return lchToHex({ L: lch.L, C: Math.min(lch.C, 0.004), H: lch.H });
  };
  const ink = midTone ? neutralise(useLight ? '#fbf9fb' : '#141414') : useLight ? lightInk : darkInk;
  const inkLight = useLight;

  /* shader stops: diffraction orders keep their full angular offset from the
   * family (a foil is a rainbow, not a swatch), while their chroma follows
   * the environment's saturation. Ice is the family's pale cool side. Gold
   * stays metallic: its hue only leans toward the family's warm bias. */
  const stop = (key: keyof ShaderPalette): [number, number, number] => {
    const hex = linearTripleToHex(SHADER_REF[key]);
    const retoned = hexToLch(t(hex, { hueSpread: 1 }));
    return hexToLinearTriple(lchToHex(retoned));
  };
  const goldHex = linearTripleToHex(SHADER_REF.goldA);
  const goldL = hexToLch(t(goldHex, { hueSpread: 0 }));
  const goldHue = clamp(95 + hueDelta(REF_HUE, a.hue) * 0.22, 72, 118);
  const goldAL = lchToHex(gamutFit(goldL.L, goldL.C, goldHue));
  const goldBL = hexToLch(t(linearTripleToHex(SHADER_REF.goldB), { hueSpread: 0 }));
  const goldBHex = lchToHex(gamutFit(goldBL.L, goldBL.C, goldHue));

  const voidGlow = t(R.voidGlow);
  const uiLight = hexToLch(voidGlow).L < 0.5;

  const signature = `${Math.round(a.hue)}-${Math.round(a.chroma * 1000)}-${Math.round(a.gain * 100)}-${Math.round(a.lift * 100)}-${a.mood}`;

  return {
    id: signature,
    mood: a.mood,
    hue: a.hue,
    chroma: a.chroma,
    lightness: sample.meanL,
    contrast: sample.sdL,
    saturation: sample.meanC,
    inkLight,

    sceneBg: t(R.sceneBg),
    voidDark: t(R.voidDark),
    voidGlow,
    voidPale: t(R.voidPale),

    ambient: t(R.ambient, gel),
    key: t(R.key, gel),
    envKey: t(R.envKey, gel),
    envFill: t(R.envFill, gel),
    envBounce: t(R.envBounce),
    envHair: t(R.envHair, gel),
    envSoftbox: t(R.envSoftbox, gel),
    envCounter: t(R.envCounter, gel),
    envRearKey: t(R.envRearKey, gel),
    envRearStrip: t(R.envRearStrip, gel),

    glassBody: t(R.glassBody),
    glassAttenuation: t(R.glassAttenuation),
    glassCheap: t(R.glassCheap),
    facePlate: t(R.facePlate, { chromaScale: 0.4, lightnessFollow: 0.3 }),

    faceTop: t(R.faceTop),
    faceMid: t(R.faceMid),
    faceLeft: t(R.faceLeft),
    faceRight: t(R.faceRight),
    faceBottom: t(R.faceBottom),
    rimDark: t(R.rimDark),
    rimLit: t(R.rimLit),
    windowWall: t(R.windowWall),
    tray: t(R.tray),
    trayRailL: t(R.trayRailL),
    trayRailR: t(R.trayRailR),
    sideTab: t(R.sideTab),
    plate: t(R.plate),
    cardInk: t(R.cardInk),
    // the extruded body reads as the paper's own edge, so it tracks the paper
    // (the two are the same tone in the reference card)
    cardBodyInk: field,
    cardPaper: t(R.cardPaper, { chromaScale: 0.5, lightnessFollow: 0.3 }),
    ridgeTab1: t(R.ridgeTab1),
    ridgeTab2: t(R.ridgeTab2),
    ridgeTab3: t(R.ridgeTab3),

    field,
    ink,
    artEdge: t(R.artEdge),

    labelPlum: t(R.labelPlum),
    // the plate carries its own contrast rule: its ink answers the plate's
    // lightness, never the art's, so the header stays legible on every palette
    labelInk:
      hexToLch(t(R.labelPlum)).L < 0.5
        ? t(R.labelInk, { chromaScale: 0.6, lightnessFollow: 0.25 })
        : t('#171219', { chromaScale: 0.6, lightnessFollow: 0.25 }),
    labelHairline: t(R.labelHairline),
    labelBevel: t(R.labelBevel),
    labelBlankBorder: t(R.labelBlankBorder, { lightnessFollow: 0.4 }),

    trayTop: t(R.trayTop),
    trayMid: t(R.trayMid),
    trayBottom: t(R.trayBottom),
    trayWallBand: t(R.trayWallBand),
    trayLip: t(R.trayLip, { lightnessFollow: 0.5 }),

    chamferDark: t(R.chamferDark),
    chamferLit: t(R.chamferLit),
    mouldHair: t(R.mouldHair, { lightnessFollow: 0.3 }),
    stepHair: t(R.stepHair, { lightnessFollow: 0.3 }),
    stepShadow: t(R.stepShadow, { lightnessFollow: 0.5 }),
    windowBand: t(R.windowBand),
    sideTabPaintL: t(R.sideTabPaintL),
    sideTabPaintR: t(R.sideTabPaintR),
    weldHair: t(R.weldHair, { lightnessFollow: 0.3 }),
    faceGrid: FACE_GRID.map((row) => row.map((hex) => t(hex))),

    backField: t(R.backField, { lightnessFollow: 0.5 }),
    backInk: t(R.backInk, { chromaScale: 0.5, lightnessFollow: 0.25 }),

    shader: {
      foilB: stop('foilB'),
      foilC: stop('foilC'),
      foilD: stop('foilD'),
      ice: stop('ice'),
      goldA: hexToLinearTriple(goldAL),
      goldB: hexToLinearTriple(goldBHex),
    },

    accent: R.accent,
    uiInk: uiLight ? '#F5F3EF' : '#1B161D',
  };
}

/* ------------------------------------------------------------------ *
 * Interpolation + signatures (the fluid part)
 * ------------------------------------------------------------------ */

type Kind = 'hex' | 'hexrow' | 'hexgrid' | 'triple' | 'number' | 'text';

const SCHEMA = new Map<string, Kind>();
function kindOf(value: unknown): Kind {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return value.startsWith('#') ? 'hex' : 'text';
  if (Array.isArray(value)) {
    if (value.length && Array.isArray(value[0])) return 'hexgrid';
    if (value.length && typeof value[0] === 'string') return 'hexrow';
    return 'triple';
  }
  return 'text';
}
for (const [key, value] of Object.entries(REFERENCE_PALETTE)) {
  if (key === 'shader') continue;
  SCHEMA.set(key, kindOf(value));
}

function mixHexPair(a: string, b: string, t: number): string {
  if (a === b) return a; // keeps case + exactness at the identity
  const m = mixHex(a, b, t);
  return m === a ? nudgeHex(a, b) : m;
}

function mixValue(kind: Kind, a: unknown, b: unknown, t: number): unknown {
  switch (kind) {
    case 'hex':
      return mixHexPair(a as string, b as string, t);
    case 'hexrow': {
      const ra = a as string[];
      const rb = b as string[];
      return ra.map((h, i) => mixHexPair(h, rb[i] ?? h, t));
    }
    case 'hexgrid': {
      const ga = a as string[][];
      const gb = b as string[][];
      return ga.map((row, r) => row.map((h, c) => mixHexPair(h, gb[r]?.[c] ?? h, t)));
    }
    case 'triple': {
      const ra = a as number[];
      const rb = b as number[];
      return ra.map((v, i) => v + ((rb[i] ?? v) - v) * t);
    }
    case 'number':
      return (a as number) + ((b as number) - (a as number)) * t;
    default:
      return t < 0.5 ? a : b;
  }
}

/** out = mix(a, b, t), written into `out` in place (perceptual, per slot). */
export function lerpPaletteInto(out: SlabPalette, a: SlabPalette, b: SlabPalette, t: number): SlabPalette {
  if (t <= 0) return Object.assign(out, a);
  if (t >= 1) return Object.assign(out, b);
  for (const [key, kind] of SCHEMA) {
    (out as unknown as Record<string, unknown>)[key] = mixValue(kind, (a as unknown as Record<string, unknown>)[key], (b as unknown as Record<string, unknown>)[key], t);
  }
  const sa = a.shader;
  const sb = b.shader;
  const so = out.shader;
  for (const k of Object.keys(sa) as (keyof ShaderPalette)[]) {
    for (let i = 0; i < 3; i++) so[k][i] = sa[k][i] + (sb[k][i] - sa[k][i]) * t;
  }
  out.id = t < 0.5 ? a.id : b.id;
  out.mood = t < 0.5 ? a.mood : b.mood;
  out.inkLight = t < 0.5 ? a.inkLight : b.inkLight;
  return out;
}

export function clonePalette(p: SlabPalette): SlabPalette {
  const c = { ...p, faceGrid: p.faceGrid.map((r) => r.slice()), shader: { ...p.shader } } as SlabPalette;
  for (const k of Object.keys(c.shader) as (keyof ShaderPalette)[]) c.shader[k] = p.shader[k].slice() as [number, number, number];
  return c;
}

/**
 * One 1/255 step of `a` toward `b`, per channel. The engine's exponential
 * tail moves less than half a channel per frame once it is close, and
 * rounding would stall it a few units short of the target; this creep keeps
 * the glide converging exactly.
 */
export function nudgeHex(a: string, b: string): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const q = (sh: number) => {
    const va = (pa >> sh) & 255;
    const vb = (pb >> sh) & 255;
    const v = va === vb ? va : va + (vb > va ? 1 : -1);
    return v.toString(16).padStart(2, '0');
  };
  return `#${q(16)}${q(8)}${q(0)}`;
}

/** channel distance between two hexes, 0..255-ish, for repaint thresholds */
export function hexDistance(a: string, b: string): number {
  if (a === b) return 0;
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  return Math.max(
    Math.abs(((pa >> 16) & 255) - ((pb >> 16) & 255)),
    Math.abs(((pa >> 8) & 255) - ((pb >> 8) & 255)),
    Math.abs((pa & 255) - (pb & 255))
  );
}

/** the slots each baked texture depends on, for per-texture repaint gating */
export const PALETTE_GROUPS = {
  face: ['ink', 'field', 'artEdge'],
  label: ['labelPlum', 'labelInk', 'labelHairline', 'labelBevel'],
  tray: ['trayTop', 'trayMid', 'trayBottom', 'trayWallBand', 'trayLip', 'trayRailL', 'trayRailR'],
  faceMap: [
    'chamferDark', 'chamferLit', 'mouldHair', 'stepHair', 'stepShadow', 'windowBand',
    'sideTabPaintL', 'sideTabPaintR', 'weldHair', 'faceGrid',
  ],
} as const;

export type PaletteGroup = keyof typeof PALETTE_GROUPS;

/** true when two palettes differ by more than `tol` (0..255) in a group */
export function groupChanged(a: SlabPalette, b: SlabPalette, group: PaletteGroup, tol: number): boolean {
  for (const slot of PALETTE_GROUPS[group]) {
    const va = (a as unknown as Record<string, unknown>)[slot];
    const vb = (b as unknown as Record<string, unknown>)[slot];
    if (slot === 'faceGrid') {
      const ga = va as string[][];
      const gb = vb as string[][];
      for (let r = 0; r < ga.length; r++) {
        for (let c = 0; c < ga[r].length; c++) if (hexDistance(ga[r][c], gb[r][c]) > tol) return true;
      }
    } else if (hexDistance(va as string, vb as string) > tol) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * The driver contract
 *
 * Consumers (Slab, HoloCardMaterial, VoidBackdrop, the Forge rig) read the
 * live palette through this interface, so none of them depend on the engine
 * implementation — and a slab with no driver is exactly today's render.
 * ------------------------------------------------------------------ */

export interface PaletteDriver {
  /** live palette, mutated in place by step(); always valid */
  readonly current: SlabPalette;
  /** where the glide is heading */
  readonly target: SlabPalette;
  /** true while current != target */
  readonly moving: boolean;
  setTarget(p: SlabPalette | null): void;
  /** advance the glide; returns whether it is still moving */
  step(delta: number): boolean;
  subscribe(fn: (reason: 'target' | 'settle') => void): () => void;
}

export { labToLinear, lchToLab };
