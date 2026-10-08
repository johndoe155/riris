/**
 * Every measurement of the graded-card slab, in one place, so tuning is a
 * one-line change and both scenes follow.
 *
 * ALL of these numbers come from `reference-image.jpg`, measured by the
 * scripts in `scripts/analysis/` (see `docs/reference-parity.md` for the table
 * and the diffs). The photo is close to orthographic — the slab box is
 * 665 x 1116 px against a true 1 : 1.678 — so a pixel fraction of that box *is*
 * the dimension, and every number below is a real measurement rather than a
 * guess. Two conventions:
 *
 *   x, z : world units. The slab is 1 wide, so an x fraction of the photo's
 *          slab box is the world number directly.
 *   y    : world units, measured DOWN from the slab's top edge. Multiply the
 *          photo's y fraction by h (1.677) to get it.
 *
 * Measured feature table (photo px → slab fractions / world units):
 *
 *   case             665 x 1116 px                     1 x 1.677
 *   corner radius    76.5 px                           R 0.115 (of min(w,h))
 *   corner profile   superellipse, exponent ~5.2       cornerPower 5.2
 *   outer chamfer    10 px (a dark band inside the edge) stepInset 0.015
 *   label plate      x 452..1036, y 227..379           x +-0.4391, top 0.0600, h 0.2284
 *   ridge            y 418..427, full face width       top 0.3472, h 0.0134
 *   hanger ledge     x 700..760, y 470..485            w 0.088, h 0.0225
 *   window opening   x 465..1030, y 470..1295          w 0.8496, top 0.4253, h 1.2396
 *   card             x 500..991,  y 508..1240          w 0.7384, top 0.4823, h 1.1000
 *   card ring        hugs the card's edge, 8 px         ringInset 0, stroke 0.0163 card-w
 *   art window       ink x 532..536 / 957..961,        inset 0.0630 card-w,
 *                        y 535..541 / 964..970          top 0.0365, bottom 0.3680 card-h
 *
 * The z stack is the real thing, front to back (all world units, slab 1 wide):
 *
 *   zFront        +0.045  front face of the case (the plate that carries the holes)
 *   zShellFront   +0.037  front of the shell body, one step behind the face
 *   zPlateBack    +0.017  back of the front plate (the window is this deep)
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
  /** 2 = circular fillet, 5.2 = the reference's squircle */
  cornerPower: number;
  /** how far the rounded edge wraps over the front/back faces */
  bevel: number;
  /**
   * Inset of the front face plate from the outline. The measured 10 px band
   * between the silhouette and the first bright line on the front: the case's
   * moulded rim. It reads *darker* than the face it borders, which is what
   * makes the slab look like a moulding rather than a flat box.
   */
  stepInset: number;
  /** how far the face plate stands proud of the shell body */
  faceLift: number;

  /* ---- z stack ---- */
  zFront: number;
  zShellFront: number;
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

  /* ---- ridge: the full-width moulding line between label and window ---- */
  /** how far in from the slab's edge the ridge starts */
  ridgeInset: number;
  ridgeH: number;
  /** ridge centre, measured down from the slab's top edge */
  ridgeTop: number;
  /** how far the ridge stands proud of the face */
  ridgeLift: number;

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
  /** gap between card edge and its cutout in the tray */
  cardGap: number;

  /* ---- card face layout (fractions of the card) ---- */
  /** inset of the printed ring at the card's edge */
  ringInset: number;
  ringWidth: number;
  /** inset of the art frame's stroke (its outer edge) */
  artInset: number;
  /** stroke width of the art frame */
  artStroke: number;
  artTop: number;
  artBottom: number;

  /* ---- furniture ---- */
  /**
   * The retaining ledges in the apron above the card. Measured off the
   * reference as one small bright notch at the window's top edge, 60 px wide
   * and 15 px tall (they catch the light rather than reading as dark pockets),
   * so they are modelled small and near the opening — nothing like the deep
   * wells the previous spec drew across the whole apron.
   */
  slotTop: number;
  slotH: number;
  slotW: number;
  slots: number;
}

export const SLAB_SPEC: SlabSpec = {
  w: 1,
  h: 1.6770,

  radius: 0.115,
  cornerPower: 5.2,
  bevel: 0.012,
  stepInset: 0.015,
  faceLift: 0.008,

  zFront: 0.045,
  zShellFront: 0.037,
  zPlateBack: 0.017,
  cardD: 0.018,
  zCardBack: -0.028,
  zTrayFront: -0.012,
  zBackPlateFront: -0.028,
  zBack: -0.045,

  /** x 452..1036 px of the 665 px case: 584/665 */
  labelW: 0.8781,
  labelH: 0.2284,
  labelTop: 0.0600,
  labelRadius: 0.034,
  labelD: 0.026,
  labelBorder: 0.0115,

  ridgeInset: 0.015,
  ridgeH: 0.0137,
  ridgeTop: 0.3472,
  ridgeLift: 0.004,

  windowW: 0.8496,
  windowH: 1.2396,
  windowTop: 0.4253,
  windowRadius: 0.05,
  windowBand: 0.014,

  cardW: 0.7384,
  cardH: 1.1000,
  // centre y, measured down from the top: (0.2876 + 0.9435) / 2 * 1.677 = 1.0324
  cardY: 1.6770 / 2 - 1.0324,
  cardRadius: 0.042,
  cardGap: 0.012,

  ringInset: 0.0,
  ringWidth: 0.0163,
  /**
   * The art frame's *outer* edge, as a fraction of the card width. Measured
   * from the frame's ink: x 532..536 (left) and 957..961 (right) of a card
   * spanning 500..991, so the outer edges average 0.0630 of the card width in.
   */
  artInset: 0.063,
  /** the frame's ink line: 4 px on a 492 px card */
  artStroke: 0.0081,
  artTop: 0.0365,
  artBottom: 0.368,

  slotTop: 0.0015,
  // 15 px of the 1116 px case, in world y (15/1116 * 1.677)
  slotH: 0.0225,
  // 60 px of the 665 px case, in world x
  slotW: 0.088,
  slots: 4,
};

export interface SlabLayers {
  /** front face of the case */
  front: number;
  /** front of the shell body, one step behind the face plate */
  shellFront: number;
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
  /** the face plate's outline (the shell's silhouette, inset) */
  faceW: number;
  faceH: number;
  faceRadius: number;
}

/** Derived z planes and y anchors. The small gaps are what catch the light. */
export function slabLayers(spec: SlabSpec = SLAB_SPEC): SlabLayers {
  const { h, zFront, zPlateBack, zCardBack, cardD, zTrayFront, labelD, windowW, windowH, slots, cardGap, cardW, cardH, cardRadius, stepInset } = spec;

  const labelY = h / 2 - spec.labelTop - spec.labelH / 2;
  const ridgeY = h / 2 - spec.ridgeTop - spec.ridgeH / 2;
  const windowY = h / 2 - spec.windowTop - windowH / 2;

  /*
   * The ledges are spread across the middle of the window, each clear of its
   * neighbours and of the window's walls. (The old rule — `windowW - slotW * 8`
   * — assumed a 14 px-wide ledge; at the measured 60 px it collapsed the span to
   * less than one ledge and stacked all four on top of each other.)
   */
  const span = Math.max(spec.slotW * 1.5, windowW - spec.slotW * 3.2);
  const slotX: number[] = [];
  for (let i = 0; i < slots; i++) {
    const t = slots === 1 ? 0.5 : i / (slots - 1);
    slotX.push(-span / 2 + t * span);
  }

  return {
    front: zFront,
    shellFront: spec.zShellFront,
    plateDepth: zFront - zPlateBack,
    cardFace: zCardBack + cardD,
    cardBack: zCardBack,
    trayFront: zTrayFront,
    trayBack: zCardBack,
    labelPlate: zFront - labelD,
    // the printed face sits 1mm under the front plane, inside the
    // label hole, so it is neither buried in the plate nor above the case
    labelFace: zFront - 0.001,
    labelY,
    ridge: zFront + spec.ridgeLift,
    ridgeY,
    windowY,
    slotX,
    trayW: cardW + cardGap * 2,
    trayH: cardH + cardGap * 2,
    trayRadius: cardRadius + cardGap * 0.5,
    faceW: spec.w - stepInset * 2,
    faceH: h - stepInset * 2,
    faceRadius: spec.radius - stepInset * 0.5,
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
 * Reference tones
 *
 * Sampled straight off reference-image.jpg. Keeping them here (rather than in
 * the material set) means the 2-D painters and the 3-D materials can never
 * drift apart, and it documents what each surface is supposed to read as.
 * ------------------------------------------------------------------ */

export const REF_TONE = {
  /** the case's front face, top strip (catches the overhead light) */
  faceTop: '#baa9b5',
  /** the case's front face, mid (beside the window) */
  faceMid: '#91808c',
  /** the case's chamfered rim, left edge (in shadow) */
  rimDark: '#42333f',
  /** the case's chamfered rim, right edge (lit) */
  rimLit: '#8a7685',
  /** the ridge's highlight */
  ridge: '#afa6af',
  /** the tray / window floor — mauve smoke, and remarkably flat */
  tray: '#483a45',
  /** the label plate */
  plate: '#3b2a36',
  /** the card's printed body, as it reads *through* the acrylic */
  cardInk: '#473642',
  /** the card's body before the case's veil: cardInk minus the transmission lift */
  cardBodyInk: '#3a2b35',
  /** the card's frame ink */
  cardPaper: '#fbf9fb',
} as const;
