/**
 * Every measurement of the graded-card slab, in one place, so tuning is a
 * one-line change and both scenes follow.
 *
 * ---------------------------------------------------------------------------
 * The numbers below are MEASURED OFF `reference-image.jpg`, not guessed.
 * `npm run verify:reference` re-derives them from the photo and fails when the
 * spec drifts; see `scripts/verify/ref-measure.mjs` and
 * `docs/reference-parity.md` for the method and the full table.
 *
 * Reference photo 1488 x 1484, sRGB. Measured pixel boxes (edges found at the
 * half-height crossing of the luminance step against a per-row/per-column
 * local background, so the numbers are not threshold-biased):
 *
 *   slab      x  412 .. 1077   y  187 .. 1302   -> 665 x 1115  (0.59641 : 1)
 *   label     x  455 .. 1033   y  228 ..  378   -> 578 x  150
 *   window    x  480 .. 1010   y  485 .. 1227   -> 530 x  742
 *   card      x  500 ..  991   y  508 .. 1205   -> 491 x  697  (0.70452 : 1)
 *   art       x  536 ..  955   y  542 ..  963   -> 419 x  421  (1.00 : 1 !)
 *
 * Every spec field below is (pixel measure / slab width 665) except the ones
 * that are explicitly ratios of the card or of the label. The slab is 1 unit
 * wide, so `h` is simply 1115 / 665.
 *
 * The z stack is the real thing, front to back (all world units, slab 1 wide).
 * A face-on photo cannot measure depth, so these stay as modelled — they only
 * show when the slab is turned.
 *
 *   zFront        +0.045  flat front face of the shell
 *   zPlateBack    +0.017  back of the front plate (window is this deep)
 *   cardFace      -0.010  the card's front surface
 *   zCardBack     -0.028  the card's back, and the tray's back plane
 *   zTrayFront    -0.012  front of the tray ring that the card sits in
 *   zBackPlate    -0.045  back face of the case
 */

export type SlabQuality = 'hero' | 'cheap';

export interface SlabSpec {
  /* ---- slab shell ---- */
  w: number;
  h: number;
  /** corner radius as a fraction of min(w, h) */
  radius: number;
  /** 2 = circular fillet, 4-6 = squircle easing into the straight edges */
  cornerPower: number;
  /** how far the rounded edge wraps over the front/back faces */
  bevel: number;

  /* ---- z stack ---- */
  zFront: number;
  zPlateBack: number;
  cardD: number;
  zCardBack: number;
  zTrayFront: number;
  zBackPlateFront: number;
  zBack: number;

  /* ---- label ---- */
  labelW: number;
  labelH: number;
  /** inset of the label plate from the slab's top edge */
  labelTop: number;
  labelRadius: number;
  /** plate thickness, sunk behind the front face */
  labelD: number;
  /** light inner border drawn on the plate */
  labelBorder: number;
  /** the ridge that separates label from window */
  ridgeH: number;
  ridgeGap: number;

  /* ---- window ---- */
  windowW: number;
  windowH: number;
  /** window top, from the slab's top edge */
  windowTop: number;
  windowRadius: number;
  /** frosted band around the window on the front face */
  windowBand: number;

  /* ---- card ---- */
  cardW: number;
  cardH: number;
  /** card centre offset from the slab centre (negative = below centre) */
  cardY: number;
  cardRadius: number;
  /** gap between card edge and its cutout in the tray (x) */
  cardGap: number;
  /** the same gap measured vertically: the tray is a little looser this way */
  cardGapY: number;

  /* ---- card face layout (fractions of the card) ---- */
  /** centre-line of the white border stroke */
  ringInset: number;
  /** thickness of the white border stroke */
  ringWidth: number;
  /** the second, thinner white line that rims the art window */
  keylineInset: number;
  keylineWidth: number;
  artInset: number;
  artTop: number;
  /** distance from the card's bottom edge up to the bottom of the art */
  artBottom: number;

  /* ---- furniture ---- */
  /** retaining wells in the apron above the card (0 = the reference has none) */
  slotTop: number;
  slotH: number;
  slotW: number;
  slots: number;
}

/**
 * All lengths in world units with the slab 1 unit wide.
 * Reference slab box: 665 x 1115 px.
 */
export const SLAB_SPEC: SlabSpec = {
  w: 1,
  h: 1.676692, // 1115 / 665

  radius: 0.037594, // 25 px — the old 0.115 made the corners 3.1x too round
  cornerPower: 4.6, // squircle easing; kept from the previous spec
  bevel: 0.015037, // 10 px — the dark rim on the top edge

  zFront: 0.045,
  zPlateBack: 0.017,
  cardD: 0.018,
  zCardBack: -0.028,
  zTrayFront: -0.012,
  zBackPlateFront: -0.028,
  zBack: -0.045,

  labelW: 0.869173, // 578 px
  labelH: 0.225564, // 150 px
  labelTop: 0.061654, // 41 px from the slab's top edge
  labelRadius: 0.006, // the photo reads the plate's corners as square
  labelD: 0.026,
  labelBorder: 0.006015, // 4 px bright rim, measured at the plate's left edge
  ridgeH: 0.007519, // 5 px bright band under the plate
  ridgeGap: 0.003008, // 2 px

  windowW: 0.796992, // 530 px
  windowH: 1.115789, // 742 px
  windowTop: 0.44812, // 298 px from the slab's top edge
  windowRadius: 0.01, // small: the tray's top-left corner is square at 1 px
  windowBand: 0.01203, // 8 px — the lit lip 10 px above the tray is the band

  cardW: 0.738346, // 491 px
  cardH: 1.048120, // 697 px
  cardY: -0.168421, // card centre sits 112 px below the slab centre
  cardRadius: 0.033083, // 22 px
  cardGap: 0.028571, // 19 px
  cardGapY: 0.033835, // 22.5 px

  /* ---- card face, as fractions of the card itself (491 x 697 px) ----
   *   white border  x 500..507 / 984..991, y 508..516 / 1198..1205  (8-9 px)
   *   dark frame    18 px
   *   white keyline  8 px
   *   art interior  419 x 421  -> square, which is the biggest single error
   *                  the old spec made (it drew 0.963 : 1)                */
  ringInset: 0.008654, // stroke centre line
  ringWidth: 0.015274, // 8.5 px total, so the band covers 0.001 .. 0.0163
  keylineInset: 0.064153, // stroke centre line (8 px band at 0.056 .. 0.072)
  keylineWidth: 0.016291,
  artInset: 0.073321, // 36 px
  artTop: 0.048780, // 34 px
  artBottom: 0.347202, // 242 px — art bottom is 455 px below the card top

  slotTop: 0.02,
  slotH: 0.1,
  slotW: 0.014,
  slots: 0, // the reference's apron is 23 px tall and shows no wells
};

export interface SlabLayers {
  /** front face of the shell */
  front: number;
  /** the window: a well this deep */
  plateDepth: number;
  /** card front / back planes */
  cardFace: number;
  cardBack: number;
  /** tray ring planes */
  trayFront: number;
  trayBack: number;
  /** label anchors */
  labelPlate: number;
  labelFace: number;
  labelY: number;
  ridge: number;
  ridgeY: number;
  /** window anchor (centre y) and slot x positions */
  windowY: number;
  slotX: number[];
  /** outline sizes for the tray ring that the card sits in */
  trayW: number;
  trayH: number;
  trayRadius: number;
}

/** Derived z planes and y anchors. The small gaps are what catch the light. */
export function slabLayers(spec: SlabSpec = SLAB_SPEC): SlabLayers {
  const { h, zFront, zPlateBack, zCardBack, cardD, zTrayFront, labelD, windowW, windowH, slots, cardGap, cardGapY, cardW, cardH, cardRadius } = spec;

  const labelY = h / 2 - spec.labelTop - spec.labelH / 2;
  const ridgeY = labelY - spec.labelH / 2 - spec.ridgeGap - spec.ridgeH / 2;
  const windowY = h / 2 - spec.windowTop - windowH / 2;

  // wells sit inside the window, a well's width clear of each side
  const span = Math.max(0.05, windowW - spec.slotW * 8);
  const slotX: number[] = [];
  for (let i = 0; i < slots; i++) {
    const t = slots === 1 ? 0.5 : i / (slots - 1);
    slotX.push(-span / 2 + t * span);
  }

  return {
    front: zFront,
    plateDepth: zFront - zPlateBack,
    cardFace: zCardBack + cardD,
    cardBack: zCardBack,
    trayFront: zTrayFront,
    trayBack: zCardBack,
    labelPlate: zFront - labelD,
    // the printed face sits 1mm under the shell's front plane, inside the
    // label hole, so it is neither buried in the plate nor above the case
    labelFace: zFront - 0.001,
    labelY,
    ridge: zFront - 0.004,
    ridgeY,
    windowY,
    slotX,
    trayW: cardW + cardGap * 2,
    trayH: cardH + cardGapY * 2,
    trayRadius: cardRadius + cardGap * 0.5,
  };
}

/**
 * Everything painted onto the tray texture, as fractions of that texture, so
 * the baked shadow around the card cutout lands exactly on the cutout the
 * geometry carves (and the wells line up with the retaining-well meshes).
 */
export interface TrayLayout {
  /** the plane the texture is painted on, in world units */
  planeW: number;
  planeH: number;
  /** the card cutout (fractions of the plane) */
  card: { x: number; y: number; w: number; h: number };
  /** retaining wells (fractions of the plane) */
  slots: { x: number; y: number; w: number; h: number }[];
}

export function trayLayout(spec: SlabSpec = SLAB_SPEC, layers: SlabLayers = slabLayers(spec)): TrayLayout {
  const planeW = spec.windowW * 0.995;
  const planeH = spec.windowH * 0.995;
  const planeTop = layers.windowY + planeH / 2;
  const fx = (worldX: number) => worldX / planeW + 0.5;
  const fy = (worldY: number) => (planeTop - worldY) / planeH;

  const cardTop = spec.cardY + spec.cardH / 2;
  const slotTopWorld = layers.windowY + spec.windowH / 2 - spec.slotTop;
  return {
    planeW,
    planeH,
    card: {
      x: fx(0) - spec.cardW / planeW / 2,
      y: fy(cardTop),
      w: spec.cardW / planeW,
      h: spec.cardH / planeH,
    },
    slots: layers.slotX.map((x) => ({
      x: fx(x) - spec.slotW / planeW / 2,
      y: fy(slotTopWorld),
      w: spec.slotW / planeW,
      h: spec.slotH / planeH,
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Reference measurement constants, kept next to the spec so the
 * verify script and the geometry can never disagree.
 * ------------------------------------------------------------------ */

/** Pixel boxes measured off `reference-image.jpg` (1488 x 1484). */
export const REF_MEASURE = {
  image: { w: 1488, h: 1484 },
  slab: { x0: 412, x1: 1077, y0: 187, y1: 1302 },
  label: { x0: 455, x1: 1033, y0: 228, y1: 378 },
  window: { x0: 480, x1: 1010, y0: 485, y1: 1227 },
  card: { x0: 500, x1: 991, y0: 508, y1: 1205 },
  art: { x0: 536, x1: 955, y0: 542, y1: 963 },
  /** corner radii, px */
  radius: { slab: 25, card: 22 },
} as const;

/** Material colours sampled from the photo (sRGB hex, straight off the JPEG). */
export const REF_COLOUR = {
  /** backdrop corners: a diagonal mauve gradient, dark bottom-left */
  bgTopLeft: '#564351',
  bgTopRight: '#b3a6b1',
  bgBottomLeft: '#32212e',
  bgBottomRight: '#5c4858',
  /** the tray floor and the card's dark frame are the same ink */
  tray: '#453a43',
  labelPlate: '#453a43',
  cardFrame: '#433640',
  cardBorder: '#fdfdfd',
  /** shell rails: the key light is off the upper right, so they differ a lot */
  railLit: '#9e919b',
  railShadow: '#433841',
} as const;
