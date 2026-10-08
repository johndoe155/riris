/**
 * Every measurement of the graded-card slab, in one place, so tuning is a
 * one-line change and both scenes follow.
 *
 * The numbers come from the reference photo (slab box 664x1103 px, ratio
 * 0.602:1) and the card-face template recovered from cards.zip:
 *
 *   slab        0.602 : 1
 *   label       x 0.059..0.941, y 0.0335..0.170 of the slab   (dark plate)
 *   window      x 0.080..0.920, y 0.190..0.955 of the slab
 *   card        x 0.131..0.870, y 0.289..0.918 of the slab -> 0.710 aspect
 *   card ring   hugs the card edge, ~0.0143 of the card width thick
 *   art window  0.071..0.929 of the card width, 0.036..0.664 of its height
 *
 * The z stack is the real thing, front to back (all world units, slab 1 wide):
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
  /** gap between card edge and its cutout in the tray */
  cardGap: number;

  /* ---- card face layout (fractions of the card) ---- */
  ringInset: number;
  ringWidth: number;
  artInset: number;
  artTop: number;
  artBottom: number;

  /* ---- furniture ---- */
  /** retaining wells above the card */
  slotTop: number;
  slotH: number;
  slotW: number;
  slots: number;
}

export const SLAB_SPEC: SlabSpec = {
  w: 1,
  h: 1.6611,

  radius: 0.115,
  cornerPower: 4.6,
  bevel: 0.02,

  zFront: 0.045,
  zPlateBack: 0.017,
  cardD: 0.018,
  zCardBack: -0.028,
  zTrayFront: -0.012,
  zBackPlateFront: -0.028,
  zBack: -0.045,

  labelW: 0.881,
  labelH: 0.2275,
  labelTop: 0.055,
  labelRadius: 0.055,
  labelD: 0.026,
  labelBorder: 0.0115,
  ridgeH: 0.02,
  ridgeGap: 0.016,

  windowW: 0.84,
  windowH: 1.27,
  windowTop: 0.3156,
  windowRadius: 0.075,
  windowBand: 0.026,

  cardW: 0.7395,
  cardH: 1.0432,
  cardY: -0.1718,
  cardRadius: 0.042,
  cardGap: 0.014,

  ringInset: 0.008,
  ringWidth: 0.0143,
  artInset: 0.071,
  artTop: 0.036,
  artBottom: 0.336,

  slotTop: 0.09,
  slotH: 0.16,
  slotW: 0.0085,
  slots: 4,
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
  const { h, zFront, zPlateBack, zCardBack, cardD, zTrayFront, labelD, windowW, windowH, slots, cardGap, cardW, cardH, cardRadius } = spec;

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
    trayH: cardH + cardGap * 2,
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
