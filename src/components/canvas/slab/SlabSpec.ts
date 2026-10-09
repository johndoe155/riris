/**
 * Every measurement of the graded-card slab, in one place, so tuning is a
 * one-line change and both scenes follow.
 *
 * ALL of these numbers come from `reference-image.jpg` (1920 x 1920), re-derived
 * on this branch by `scripts/analysis/_target_measure.mjs` (silhouette tracking
 * by absolute-luma threshold, run/colour profiles along the key scanlines in
 * `_target_scan.mjs`, corner arcs and tone means here and in the same script).
 * An earlier table measured `public/reference.jpg` — a different slab, the dark
 * Ghost-Lab card — and its case box (412..1077 x 187..1303) is not where the
 * case sits in this photo, so every feature below was re-measured.
 *
 * The photo is close to orthographic — the case box is 930 x 1536 px against a
 * true 1 : 1.6505 — so a pixel fraction of that box *is* the dimension. Two
 * conventions:
 *
 *   x, z : world units. The slab is 1 wide, so an x fraction of the photo's
 *          case box is the world number directly.
 *   y    : world units, measured DOWN from the case's top edge. Multiply the
 *          photo's y fraction by h (1.6505) to get it.
 *
 * Measured feature table (photo px, case box x 494..1424 / y 181..1717):
 *
 *   case             930 x 1536 px                    1 x 1.6505
 *   corner radius    45 px                            R 0.0484 (of min(w,h))
 *   corner profile   near-circular, slightly square   cornerPower 3.0
 *   moulded rim      51 px, four bright hairlines     stepInset 0.0161 + band
 *                    494 / 509 / 521 / 539            windowBand 0.0258
 *   label plate      x 583..1337, y 239..437          w 0.8108, top 0.0622, h 0.2129
 *   moulding rail    y 446..479, x 545..1370          top 0.2849, h 0.0354
 *   window opening   x 545..1370, y 480..1658         w 0.8871, top 0.3214, h 1.2626
 *   card             x 590..1328, y 560..1580         w 0.7935, top 0.4073, h 1.0960
 *   card corner      48 px                            cardRadius 0.0516
 *   lip bar (top)    x 642..1270, y 543..548          w 0.6753, h 0.0054
 *   lip bar (bottom) x 642..1270, y 1588..1602        painted in the tray texture
 *   retaining rails  x 576..587 / 1327..1338,         painted in the tray texture
 *                    y 602..1535
 *   card face        full-bleed cover — no ring, no frame, no furniture
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
  /** 2 = circular fillet, 5.2 = a squircle; the target's corner is near-circular */
  cornerPower: number;
  /** how far the rounded edge wraps over the front/back faces */
  bevel: number;
  /**
   * Inset of the front face plate from the outline. The target's rim carries
   * four bright hairlines at px 494 / 509 / 521 / 539: the silhouette bevel,
   * the face plate's outer bevel, the frosted band's outer bevel and the band's
   * inner bevel at the window edge. The face plate therefore starts at the
   * second line — 15 px in, not the 51 px rim width — and the band covers the
   * rest of the rim down to the opening.
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

  /* ---- ridge: the moulded rail between the label and the window ---- */
  /**
   * How far in from the slab's edge the rail ends: the target's rail runs
   * x 545..1370, i.e. exactly the window's width — it is the top of the inner
   * frame, not a full-face line.
   */
  ridgeInset: number;
  ridgeH: number;
  /** ridge centre, measured down from the slab's top edge */
  ridgeTop: number;
  /** how far the ridge stands proud of the face */
  ridgeLift: number;
  /**
   * Centres (world x) of bright tabs on the rail. The target's rail is one
   * continuous moulding — its highlight runs the full inner width with no
   * tabs — so this is empty and the rail body carries the highlight.
   */
  ridgeTabs: number[];
  ridgeTabW: number;

  /* ---- window ---- */
  windowW: number;
  windowH: number;
  /** window top, from the slab's top edge */
  windowTop: number;
  windowRadius: number;
  /** frosted band around the window on the front face: px 521..545 of the rim */
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
  /**
   * The target's card is a full-bleed cover: there is no printed ring at its
   * edge and no ink frame around an art window, so all four furniture numbers
   * are zero and both the face painter and the foil mask use the whole face.
   */
  ringInset: number;
  ringWidth: number;
  artInset: number;
  artStroke: number;
  artTop: number;
  artBottom: number;

  /* ---- furniture ---- */
  /**
   * The window's top lip: one bright bar at px y 543..548, x 642..1270 — 63 px
   * below the window's top edge, i.e. inside the apron above the card, not at
   * the opening itself.
   */
  slotTop: number;
  slotH: number;
  slotW: number;
  slots: number;
}

export const SLAB_SPEC: SlabSpec = {
  w: 1,
  h: 1.6505,

  radius: 0.0484,
  cornerPower: 3.0,
  bevel: 0.012,
  stepInset: 0.0161,
  faceLift: 0.008,

  zFront: 0.045,
  zShellFront: 0.037,
  zPlateBack: 0.017,
  cardD: 0.018,
  zCardBack: -0.028,
  zTrayFront: -0.012,
  zBackPlateFront: -0.028,
  zBack: -0.045,

  /** x 583..1337 px of the 930 px case: 754/930 */
  labelW: 0.8108,
  labelH: 0.2129,
  labelTop: 0.0622,
  /** the plate's corners are near-square: ~6 px on a 754 px plate */
  labelRadius: 0.008,
  labelD: 0.026,
  labelBorder: 0.0115,

  ridgeInset: 0.05645,
  ridgeH: 0.0354,
  ridgeTop: 0.2849,
  ridgeLift: 0.004,
  // the target's rail has no tabs: one continuous moulding line
  ridgeTabs: [],
  ridgeTabW: 0.08,

  windowW: 0.8871,
  windowH: 1.2658,
  windowTop: 0.3214,
  windowRadius: 0.035,
  windowBand: 0.0258,

  cardW: 0.7935,
  cardH: 1.096,
  // centre y, measured down from the top: (0.4073 + 0.4073 + 1.0960) / 2
  cardY: 1.6505 / 2 - (0.4073 + 1.096 / 2),
  cardRadius: 0.0516,
  cardGap: 0.012,

  // full-bleed cover: no ring, no frame
  ringInset: 0,
  ringWidth: 0,
  artInset: 0,
  artStroke: 0,
  artTop: 0,
  artBottom: 0,

  // 63 px below the window's top edge (543 px), 5 px tall, in world units
  slotTop: 0.0677,
  slotH: 0.0054,
  // x 642..1270 px of the 930 px case: 628 / 930, in world x
  slotW: 0.6753,
  slots: 1,
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
  /** world x of each bright tab on the rail */
  ridgeTabX: number[];
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
   * With one lip bar (`slots` 1) this is just its centre. For more than one, the
   * ledges spread across the middle of the window, each clear of its
   * neighbours and of the window's walls.
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
    ridgeTabX: spec.ridgeTabs.slice(),
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
  /**
   * The two polished retaining rails that hug the card's left/right edges
   * (px x 576..587 and 1327..1338, y 602..1535): bright 11 px lines on the
   * dark tray. Painted, not modelled — they are flat in the photo.
   */
  rails: { x: number; y: number; w: number; h: number }[];
  /** the bottom lip bar (px y 1588..1602, x 642..1270), painted for the same reason */
  lipBottom: { x: number; y: number; w: number; h: number };
}

export function trayLayout(spec: SlabSpec = SLAB_SPEC, layers: SlabLayers = slabLayers(spec)): TrayLayout {
  const planeW = spec.windowW * 0.995;
  const planeH = spec.windowH * 0.995;
  const planeTop = layers.windowY + planeH / 2;
  const fx = (worldX: number) => worldX / planeW + 0.5;
  const fy = (worldY: number) => (planeTop - worldY) / planeH;

  const cardTop = spec.cardY + spec.cardH / 2;
  const slotTopWorld = layers.windowY + spec.windowH / 2 - spec.slotTop;
  /* photo px -> world x / world y-down, through the case box (930 x 1536 px) */
  const pxX = (px: number) => (px - 494) / 930 - 0.5;
  const pxY = (px: number) => ((px - 181) / 1536) * spec.h;
  const rail = (x0: number, x1: number): { x: number; y: number; w: number; h: number } => ({
    x: fx((pxX(x0) + pxX(x1)) / 2) - ((x1 - x0) / 930) / planeW / 2,
    y: fy(pxY(602)),
    w: (x1 - x0) / 930 / planeW,
    h: (pxY(1535) - pxY(602)) / planeH,
  });
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
    rails: [rail(576, 587), rail(1327, 1338)],
    lipBottom: {
      x: fx((pxX(642) + pxX(1270)) / 2) - (628 / 930) / planeW / 2,
      y: fy(pxY(1588)),
      w: 628 / 930 / planeW,
      h: (pxY(1602) - pxY(1588)) / planeH,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Reference tones
 *
 * Sampled straight off reference-image.jpg (5x5 means, see
 * `scripts/analysis/_target_measure.mjs`). Keeping them here (rather than in
 * the material set) means the 2-D painters and the 3-D materials can never
 * drift apart, and it documents what each surface is supposed to read as.
 * ------------------------------------------------------------------ */

export const REF_TONE = {
  /** the rim's outer band, shadow side (left) */
  rimDark: '#9b8096',
  /** the rim's outer band, lit side (right) */
  rimLit: '#b095ad',
  /** the rim's mid step, left — the brightest flat on the case */
  rimMidLeft: '#d4c8d2',
  /** the rim's mid step, right */
  rimMidRight: '#b6a9b3',
  /** the case's edge hairlines (peak luma ~250, 2-3 px wide) */
  edgeHairline: '#f6eef6',
  /** the moulding rail between label and window */
  ridge: '#c4b7c2',
  /** the tray / window floor — dark mauve, flat, slightly lighter at the top */
  tray: '#64505e',
  trayTop: '#705969',
  trayBottom: '#5d4555',
  /** the blank label plate: a cool pale blue-white */
  plate: '#e3e9f0',
  /** the card's printed cover, as it reads *through* the acrylic */
  cardPaper: '#e3eaef',
  /** the card stock's edge, in shadow at the cutout */
  cardEdge: '#3d2c36',
  /** the window's top lip bar and the bottom one */
  lip: '#cbd1d8',
  lipBottom: '#c7d4e3',
  /** the two retaining rails beside the card */
  rail: '#cbc7cc',
  /** backdrop: wall top, wall mid (darkest), wall at the floor line */
  wallTop: '#a886a1',
  wallMid: '#2b1429',
  wallFloor: '#5e3b55',
  /** backdrop: the floor, its centre reflection, and the contact shadow */
  floor: '#55334c',
  floorReflection: '#806578',
  contact: '#492d42',
} as const;
