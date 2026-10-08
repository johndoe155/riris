import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SLAB_SPEC, slabLayers, type SlabLayers, type SlabQuality, type SlabSpec } from './SlabSpec';

/* ------------------------------------------------------------------ *
 * Squircle outlines
 * ------------------------------------------------------------------ */

/** Handle length as a fraction of the radius for a circular fillet. */
const CIRCLE_KAPPA = 0.5523;

/**
 * Rounded-rectangle outline whose corners are cubic Béziers. The handles grow
 * past the circular value with `power`, so curvature eases out of the straight
 * edges instead of jumping from 0 to 1/r at the join: the moulded-plastic look.
 *
 * The reference's corner, measured as the inset of the contour per row from the
 * top edge (`scripts/analysis/_shape.mjs`), falls 10 px inside the outline by
 * 1.8% of the way down a 0.115-radius corner — a circular fillet would be at
 * 2 px there. Power 5.2 reproduces that: the measured profile and the model
 * agree to within 2 px from the tangent point to the straight edge.
 *
 * Points run counter-clockwise; any hole must be reversed by the caller.
 */
export function squircle(
  w: number,
  h: number,
  r: number,
  power: number,
  cornerSegs: number,
  offsetX = 0,
  offsetY = 0
): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  const rad = Math.max(1e-4, Math.min(r, Math.min(hw, hh) * 0.95));
  const kappa = THREE.MathUtils.clamp(CIRCLE_KAPPA + (power - 2) * 0.0485, 0.5523, 0.86);
  const c = rad * kappa;
  const segs = Math.max(2, Math.round(cornerSegs));

  const corners: [THREE.Vector2, THREE.Vector2, THREE.Vector2, THREE.Vector2][] = [
    [new THREE.Vector2(hw - rad, hh), new THREE.Vector2(hw - rad + c, hh), new THREE.Vector2(hw, hh - rad + c), new THREE.Vector2(hw, hh - rad)],
    [new THREE.Vector2(hw, -hh + rad), new THREE.Vector2(hw, -hh + rad - c), new THREE.Vector2(hw - rad + c, -hh), new THREE.Vector2(hw - rad, -hh)],
    [new THREE.Vector2(-hw + rad, -hh), new THREE.Vector2(-hw + rad - c, -hh), new THREE.Vector2(-hw, -hh + rad - c), new THREE.Vector2(-hw, -hh + rad)],
    [new THREE.Vector2(-hw, hh - rad), new THREE.Vector2(-hw, hh - rad + c), new THREE.Vector2(-hw + rad - c, hh), new THREE.Vector2(-hw + rad, hh)],
  ];

  const pts: THREE.Vector2[] = [];
  const bez = new THREE.CubicBezierCurve(new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2());
  for (const [start, c1, c2, end] of corners) {
    bez.v0.copy(start); bez.v1.copy(c1); bez.v2.copy(c2); bez.v3.copy(end);
    for (let i = 0; i <= segs; i++) {
      const p = bez.getPoint(i / segs);
      pts.push(new THREE.Vector2(p.x + offsetX, p.y + offsetY));
    }
  }
  return new THREE.Shape(pts);
}

export interface Rect {
  w: number;
  h: number;
  r: number;
  x?: number;
  y?: number;
}

function addHole(shape: THREE.Shape, hole: Rect, power: number, segs: number) {
  const path = squircle(hole.w, hole.h, hole.r, power, segs, hole.x ?? 0, hole.y ?? 0);
  shape.holes.push(new THREE.Path(path.getPoints(0).slice().reverse()));
}

/**
 * ExtrudeGeometry dilates its profile by `bevelSize` in *every* direction: a
 * solid grows, a hole shrinks. Compensating here means the finished layer
 * matches the measured dimensions instead of coming out 2 × bevel too big,
 * which is the difference between matching the reference photo and not.
 *   dir = +1 → a solid boundary, shrunk      dir = -1 → a hole, grown
 */
function fit(rect: Rect, bevel: number, dir: 1 | -1): Rect {
  const d = bevel * dir;
  return {
    ...rect,
    w: Math.max(rect.w - d * 2, 0.01),
    h: Math.max(rect.h - d * 2, 0.01),
    r: Math.max(rect.r - d, 0.002),
  };
}

/** Ring outline: an outer squircle with an inner one as a hole. */
export function squircleRing(outer: Rect, inner: Rect, power: number, cornerSegs: number): THREE.Shape {
  const shape = squircle(outer.w, outer.h, outer.r, power, cornerSegs, outer.x ?? 0, outer.y ?? 0);
  addHole(shape, inner, power, cornerSegs);
  return shape;
}

/* ------------------------------------------------------------------ *
 * Extrusion + smooth shading
 * ------------------------------------------------------------------ */

export interface ExtrudeOpts {
  /** total depth along z; the geometry is centred on z=0 */
  depth: number;
  bevel?: number;
  bevelSegments?: number;
  curveSegments?: number;
  /** normal-smoothing angle handed to toCreasedNormals */
  creaseAngle?: number;
}

/**
 * Extrude an outline into a bevelled layer, then re-crease the normals so the
 * rounded edges shade smoothly instead of faceting.
 */
export function extrudedLayer(shape: THREE.Shape, opts: ExtrudeOpts): THREE.BufferGeometry {
  const { depth, bevel = 0, bevelSegments = 5, curveSegments = 18, creaseAngle = 0.4 } = opts;
  const eff = Math.max(0, Math.min(bevel, depth * 0.45 - 1e-4));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(depth - eff * 2, 1e-4),
    bevelEnabled: eff > 0,
    bevelThickness: eff,
    bevelSize: eff,
    bevelOffset: 0,
    bevelSegments: eff > 0 ? bevelSegments : 1,
    curveSegments,
    steps: 1,
  });
  geo.center();
  const creased = toCreasedNormals(geo, creaseAngle);
  geo.dispose();
  creased.computeBoundingBox();
  return creased;
}

/* ------------------------------------------------------------------ *
 * Flat card face
 * ------------------------------------------------------------------ */

/**
 * A flat plane cut to the card's own silhouette, used for the printed face,
 * the foil overlay and the back. A rectangle would show square corners past
 * the card's rounded ones; this costs ~100 triangles and one shared geometry.
 * ShapeGeometry hands out raw positions as UVs, so they are remapped to 0..1.
 */
export function buildCardFacePlane(spec: SlabSpec = SLAB_SPEC, segs = 24): THREE.BufferGeometry {
  const shape = squircle(spec.cardW, spec.cardH, spec.cardRadius, spec.cornerPower, segs);
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / spec.cardW + 0.5, pos.getY(i) / spec.cardH + 0.5);
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Flat plate with a hole, UV-mapped over its own bounding box. Used for the
 * window floor: the baked shadow, the well pockets and the tray tone only
 * cover the strip of tray you can actually see, and a plane cannot have a
 * hole, so the card-shaped cutout has to be part of the geometry.
 */
export function buildWindowPlate(
  outer: Rect,
  hole: Rect,
  power: number,
  segs: number
): THREE.BufferGeometry {
  const shape = squircle(outer.w, outer.h, outer.r, power, segs, outer.x ?? 0, outer.y ?? 0);
  const inner = squircle(hole.w, hole.h, hole.r, power, segs, hole.x ?? 0, hole.y ?? 0);
  shape.holes.push(new THREE.Path(inner.getPoints().slice().reverse()));
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(
      i,
      (pos.getX(i) - ((outer.x ?? 0) - outer.w / 2)) / outer.w,
      (pos.getY(i) - ((outer.y ?? 0) - outer.h / 2)) / outer.h
    );
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ *
 * Layer set
 * ------------------------------------------------------------------ */

export interface SlabGeometry {
  /** outer case: full silhouette, window cut through, chamfered rim */
  shell: THREE.BufferGeometry;
  /**
   * Front face plate: the shell's silhouette inset one moulding step, standing
   * proud of the body by `faceLift`. This is the layer that gives the case its
   * measured hairline — 10 px of dark chamfer, a highlight, then the face.
   */
  face: THREE.BufferGeometry;
  /** solid back plate closing the case */
  backPlate: THREE.BufferGeometry;
  /** tray ring (a plate with a card cutout) the card sits inside */
  tray: THREE.BufferGeometry;
  /** frosted band around the window on the front face */
  band: THREE.BufferGeometry;
  /** the dark label plate */
  labelPlate: THREE.BufferGeometry;
  /** the full-width moulding line between the label and the window */
  ridge: THREE.BufferGeometry;
  /** the card body */
  card: THREE.BufferGeometry;
  /** flat card-shaped plane for the printed face, foil and back */
  cardFace: THREE.BufferGeometry;
  /** window floor: the tray texture's plane, with the card cutout as a hole */
  trayPlate: THREE.BufferGeometry;
  /** retaining wells in the window */
  slots: THREE.BufferGeometry[];
  planes: SlabLayers;
  /** mesh z positions, so the component never recomputes planes by hand */
  at: {
    shell: number;
    face: number;
    backPlate: number;
    tray: number;
    band: number;
    labelPlate: number;
    ridge: number;
    card: number;
    slot: number;
  };
  triangles: number;
}

const QUALITY: Record<SlabQuality, { corner: number; bevel: number; curve: number }> = {
  hero: { corner: 12, bevel: 5, curve: 22 },
  cheap: { corner: 3, bevel: 1, curve: 5 },
};

export function buildSlabGeometry(quality: SlabQuality = 'hero', spec: SlabSpec = SLAB_SPEC): SlabGeometry {
  const q = QUALITY[quality];
  const L = slabLayers(spec);
  const P = spec.cornerPower;
  const {
    w, h, radius, bevel, labelW, labelH, labelRadius, cardW, cardH, cardRadius, cardD,
    windowW, windowH, windowRadius, windowBand, zFront, zBack, zBackPlateFront, zCardBack, zTrayFront,
    stepInset, ridgeInset,
  } = spec;

  const windowRect: Rect = { w: windowW, h: windowH, r: windowRadius, x: 0, y: L.windowY };
  /**
   * The label is a dark plate *let into* the case: the shell gets a hole the
   * size of the measured plate, and the plate behind it is slightly larger so
   * it fills the hole from any angle. Printing sits a millimetre under the
   * front plane, which is what gives the label its hairline shadow.
   */
  const labelHole: Rect = { w: labelW, h: labelH, r: labelRadius, x: 0, y: L.labelY };
  const labelPlateRect: Rect = { w: labelW + 0.02, h: labelH + 0.02, r: labelRadius + 0.01 };
  const plain = (rect: Rect, b: number, dir: 1 | -1 = 1) => {
    const f = fit(rect, b, dir);
    return squircle(f.w, f.h, f.r, P, q.corner, f.x ?? 0, f.y ?? 0);
  };

  // --- shell: full silhouette, window + label cut through, chamfered rim
  const shellShape = plain({ w, h, r: radius }, bevel);
  addHole(shellShape, fit(windowRect, bevel, -1), P, q.corner);
  addHole(shellShape, fit(labelHole, bevel, -1), P, q.corner);
  const shell = extrudedLayer(shellShape, {
    depth: L.shellFront - zBack,
    bevel,
    bevelSegments: q.bevel,
    curveSegments: q.curve,
    creaseAngle: 0.3,
  });

  // --- face plate: the silhouette minus the moulding step, proud of the body
  // by faceLift. Its bevelled edge is the bright line 10 px inside the case.
  const faceShape = plain({ w: L.faceW, h: L.faceH, r: L.faceRadius }, 0.006);
  addHole(faceShape, fit(windowRect, 0.006, -1), P, q.corner);
  addHole(faceShape, fit(labelHole, 0.006, -1), P, q.corner);
  const face = extrudedLayer(faceShape, {
    depth: zFront - L.shellFront + 0.004,
    bevel: 0.006,
    bevelSegments: q.bevel,
    curveSegments: q.curve,
    creaseAngle: 0.3,
  });

  // --- back plate closing the case (so the window isn't a see-through hole)
  const backPlate = extrudedLayer(plain({ w: windowW * 0.995, h: windowH * 0.995, r: windowRadius }, 0.006), {
    depth: zBackPlateFront - zBack,
    bevel: 0.006,
    bevelSegments: q.bevel,
    curveSegments: q.curve,
  });

  // --- tray: a plate with a card cutout, the card sits in the cutout
  const trayShape = plain({ ...windowRect, w: windowW * 0.99, h: windowH * 0.99, r: windowRadius * 0.96 }, 0.004);
  addHole(trayShape, fit({ w: L.trayW, h: L.trayH, r: L.trayRadius, x: 0, y: spec.cardY }, 0.004, -1), P, q.corner);
  const tray = extrudedLayer(trayShape, {
    depth: Math.max(zTrayFront - zCardBack, 0.006),
    bevel: 0.004,
    bevelSegments: q.bevel,
    curveSegments: q.curve,
  });

  // --- frosted band: the moulded lip hugging the window's opening
  const bandShape = plain({ w: windowW + windowBand * 2, h: windowH + windowBand * 2, r: windowRadius + windowBand, y: L.windowY }, 0.004);
  addHole(bandShape, fit(windowRect, 0.004, -1), P, q.corner);
  const band = extrudedLayer(bandShape, {
    depth: 0.008,
    bevel: 0.004,
    bevelSegments: q.bevel,
    curveSegments: q.curve,
  });

  // --- label plate + the thin pale lip printed inside it
  const labelPlate = extrudedLayer(plain(labelPlateRect, 0.005), {
    depth: spec.labelD,
    bevel: 0.005,
    bevelSegments: q.bevel,
    curveSegments: q.curve,
  });
  /*
   * NOTE: the pale lip inside the plate is *painted*, not modelled. It is a
   * 6 px printed highlight in the reference (y 263..267 of a 153 px plate), and
   * an extruded ring at any depth that reads at this scale pokes through the
   * front plane. `drawLabel` draws it with its own hairline shadow.
   */

  // --- ridge: one full-width moulding line, centred in the gap between the
  // label's underside and the window's top edge (measured: 40 px of face above
  // it, 41 px below it)
  const ridgeW = w - ridgeInset * 2;
  const ridge = extrudedLayer(plain({ w: ridgeW, h: spec.ridgeH, r: spec.ridgeH / 2 }, 0.003), {
    depth: 0.01,
    bevel: 0.003,
    bevelSegments: q.bevel,
    curveSegments: q.curve,
  });

  // --- the card
  const card = extrudedLayer(plain({ w: cardW, h: cardH, r: cardRadius }, 0.005), {
    depth: cardD,
    bevel: 0.005,
    bevelSegments: q.bevel,
    curveSegments: q.curve,
  });
  const cardFace = buildCardFacePlane(spec, q.corner * 2);
  const trayPlate = buildWindowPlate(
    { ...windowRect, w: windowW * 0.995, h: windowH * 0.995 },
    { w: L.trayW, h: L.trayH, r: L.trayRadius, x: 0, y: spec.cardY },
    P,
    q.corner
  );

  /*
   * --- hanger ledges in the apron above the card ---
   * The apron is the strip of tray between the window's top edge and the card's
   * top edge — 38 px of the case, measured. The ledges sit at the window's top
   * edge and must stay clear of the card: an earlier version clamped them with
   * `min(...)` against the card's top edge, which placed them *below* it, so the
   * well floated in front of the card's own artwork.
   */
  const apronTop = L.windowY + windowH / 2;
  const apronBottom = spec.cardY + spec.cardH / 2; // the card's top edge
  const slotY = Math.max(
    apronTop - spec.slotTop - spec.slotH / 2,
    apronBottom + 0.005 + spec.slotH / 2
  );
  const slots = L.slotX.map((x) => {
    const g = new THREE.BoxGeometry(spec.slotW, spec.slotH, 0.01);
    g.translate(x, slotY, 0);
    return g;
  });

  const tri = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const triangles =
    tri(trayPlate) + tri(shell) + tri(face) + tri(backPlate) + tri(tray) + tri(band) + tri(labelPlate) + tri(ridge) +
    tri(card) + tri(cardFace) + slots.reduce((a, s) => a + tri(s), 0);

  return {
    shell,
    face,
    backPlate,
    tray,
    band,
    labelPlate,
    ridge,
    card,
    cardFace,
    trayPlate,
    slots,
    planes: L,
    at: {
      shell: (L.shellFront + zBack) / 2,
      face: (zFront + L.shellFront - 0.004) / 2,
      backPlate: (zBackPlateFront + zBack) / 2,
      tray: (zTrayFront + zCardBack) / 2,
      band: zFront + 0.0005,
      labelPlate: zFront - spec.labelD / 2 - 0.002,
      ridge: L.ridge,
      card: zCardBack + cardD / 2,
      slot: zTrayFront + 0.006,
    },
    triangles,
  };
}

/* ------------------------------------------------------------------ *
 * One set of geometry per quality, shared by every slab instance
 * ------------------------------------------------------------------ */

const cache: Partial<Record<SlabQuality, SlabGeometry>> = {};

export function getSlabGeometry(quality: SlabQuality): SlabGeometry {
  if (!cache[quality]) cache[quality] = buildSlabGeometry(quality);
  return cache[quality]!;
}
