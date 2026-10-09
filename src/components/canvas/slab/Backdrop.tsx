'use client';
import { useMemo } from 'react';
import * as THREE from 'three';
import { REF_TONE } from './SlabSpec';

/**
 * The slab stands in front of a painted studio sweep — the setting
 * `reference-image.jpg` was shot in. It is drawn into a canvas rather than lit
 * geometry: it costs nothing and never picks up the strip lights that are
 * meant for the plastic.
 *
 * The target's backdrop is not a diagonal ramp (that fit belonged to
 * `public/reference.jpg`). Measured column-by-column in
 * `scripts/analysis/_target_measure.mjs`, it is four things stacked:
 *
 *   1. a vertical wall ramp — bright at the top (#a886a1), darkest at 62% of
 *      the frame (#2b1429), lifting again into the floor line (#5e3b55);
 *   2. a horizontal lift from the right that is strong at the top (the left
 *      wall reads #593a55 against the right's #a684a0 at y 100) and has almost
 *      vanished by the floor (0.9 ratio at y 1700) — the key is high and right;
 *   3. a glossy floor from y 1717: #55334c at the sides darkening downwards,
 *      with the slab's own reflection as a bright vertical smear (#806578)
 *      one case-width wide down the middle;
 *   4. a contact shadow: a ~10 px near-black line (#492d42) where the case
 *      meets the floor, tight to the case's width.
 *
 * `photo` mode paints exactly that frame (the hero wall plane is sized to the
 * camera's visible frame, so texture space *is* photo space). The generic mode
 * keeps the old diagonal ramp for the pit, where the camera roams.
 */

let photoCache: THREE.CanvasTexture | null = null;

function photoBackdropTexture(): THREE.CanvasTexture {
  if (photoCache) return photoCache;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  /* 1 — the wall's vertical ramp, then the floor below the floor line
   *     (y 1717 of 1920 = 0.8943 of the frame). Stops are 5x5 means off the
   *     photo's left column; the right-hand lift is layered over them. */
  const FLOOR = 0.8943;
  const g = ctx.createLinearGradient(0, 0, 0, size);
  const stops: [number, string][] = [
    [0.0, '#6d4c68'],
    [0.052, '#593a55'],
    [0.156, '#51334d'],
    [0.312, '#442841'],
    [0.469, '#371d34'],
    [0.625, REF_TONE.wallMid],
    [0.729, '#2e142a'],
    [0.833, '#4e2c46'],
    [FLOOR - 0.01, REF_TONE.wallFloor],
    [FLOOR, '#58344e'],
    [0.95, '#4b2c43'],
    [1.0, '#42243b'],
  ];
  for (const [t, c] of stops) g.addColorStop(t, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  /* 2 — the key's horizontal lift from the right, masked off toward the floor.
   *     Painted into a scratch canvas so its alpha can carry its own vertical
   *     ramp: +74 luma at the top of the frame, +11 at mid-height, ~+7 at the
   *     floor line (measured left/right column pairs). */
  const scratch = document.createElement('canvas');
  scratch.width = size;
  scratch.height = size;
  const sctx = scratch.getContext('2d')!;
  const hg = sctx.createLinearGradient(0, 0, size, 0);
  hg.addColorStop(0, 'rgba(197,156,174,0)');
  hg.addColorStop(0.55, 'rgba(197,156,174,0.22)');
  hg.addColorStop(1, 'rgba(197,156,174,0.5)');
  sctx.fillStyle = hg;
  sctx.fillRect(0, 0, size, size);
  const mask = sctx.createLinearGradient(0, 0, 0, size);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.25, 'rgba(0,0,0,0.5)');
  mask.addColorStop(0.5, 'rgba(0,0,0,0.12)');
  mask.addColorStop(FLOOR, 'rgba(0,0,0,0.06)');
  mask.addColorStop(1, 'rgba(0,0,0,0.06)');
  sctx.globalCompositeOperation = 'destination-in';
  sctx.fillStyle = mask;
  sctx.fillRect(0, 0, size, size);
  ctx.drawImage(scratch, 0, 0);

  /* 4 — contact shadow first: a tight dark line under the case, one case-width
   *     (0.484 of the frame) plus a whisker, soft at both ends. */
  const cw = 0.5;
  const cx0 = (0.5 - cw / 2) * size;
  const sh = ctx.createLinearGradient(0, FLOOR * size, 0, (FLOOR + 0.012) * size);
  sh.addColorStop(0, 'rgba(58,32,50,0)');
  sh.addColorStop(0.35, 'rgba(58,32,50,0.85)');
  sh.addColorStop(1, 'rgba(58,32,50,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(cx0, FLOOR * size, cw * size, 0.014 * size);

  /* 3 — the slab's reflection on the glossy floor: a bright vertical smear,
   *     one case-width wide, soft-edged horizontally, holding most of its
   *     luma all the way down the frame (#806578 at y 1734..1878). */
  const refl = document.createElement('canvas');
  refl.width = size;
  refl.height = size;
  const rctx = refl.getContext('2d')!;
  const vg = rctx.createLinearGradient(0, (FLOOR + 0.008) * size, 0, size);
  vg.addColorStop(0, 'rgba(128,101,120,0.92)');
  vg.addColorStop(0.5, 'rgba(127,99,118,0.85)');
  vg.addColorStop(1, 'rgba(124,99,117,0.8)');
  rctx.fillStyle = vg;
  rctx.fillRect(0, (FLOOR + 0.008) * size, size, (1 - FLOOR) * size);
  const hmask = rctx.createLinearGradient(0, 0, size, 0);
  hmask.addColorStop(0, 'rgba(0,0,0,0)');
  hmask.addColorStop(0.24, 'rgba(0,0,0,0)');
  hmask.addColorStop(0.32, 'rgba(0,0,0,1)');
  hmask.addColorStop(0.68, 'rgba(0,0,0,1)');
  hmask.addColorStop(0.76, 'rgba(0,0,0,0)');
  hmask.addColorStop(1, 'rgba(0,0,0,0)');
  rctx.globalCompositeOperation = 'destination-in';
  rctx.fillStyle = hmask;
  rctx.fillRect(0, 0, size, size);
  ctx.drawImage(refl, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  photoCache = tex;
  return tex;
}

function gradientTexture(top: string, glow: string, bottom: string, angle: number) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const dx = Math.cos(angle) * size * 0.5;
  const dy = Math.sin(angle) * size * 0.5;
  const g = ctx.createLinearGradient(size / 2 - dx, size / 2 + dy, size / 2 + dx, size / 2 - dy);
  g.addColorStop(0, bottom);
  g.addColorStop(0.5, glow);
  g.addColorStop(1, top);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

let shadowCache: THREE.CanvasTexture | null = null;

function shadowTexture() {
  if (shadowCache) return shadowCache;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.4, 'rgba(0,0,0,0.26)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.07)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  shadowCache = tex;
  return tex;
}

/** no raycasts: the backdrop must never swallow a drag on the slab */
const noRaycast = () => null;

export interface BackdropProps {
  /** visible height in world units; the slab is ~1.65 tall */
  height?: number;
  /** plane width / height */
  aspect?: number;
  /** the lit end of the gradient (toward the top-right by default) */
  top?: string;
  glow?: string;
  /** the dark end of the gradient */
  bottom?: string;
  /** tilt of the gradient in radians; 0 = light straight to the right */
  angle?: number;
  shadow?: number;
  /** shadow centre and size, relative to the slab */
  shadowOffset?: [number, number];
  shadowScale?: [number, number];
  /** paint the measured photo frame (wall + floor + reflection) instead */
  photo?: boolean;
}

export function Backdrop({
  height = 8,
  aspect = 1.35,
  top = '#191418',
  glow = '#4a3a45',
  bottom = '#0d0a0d',
  angle = 0.28,
  shadow = 0.85,
  shadowOffset = [0.02, -0.95],
  shadowScale = [1.25, 0.34],
  photo = false,
}: BackdropProps) {
  const gradient = useMemo(
    () => (photo ? photoBackdropTexture() : gradientTexture(top, glow, bottom, angle)),
    [photo, top, glow, bottom, angle]
  );
  const soft = useMemo(() => shadowTexture(), []);
  const wallZ = -6;

  return (
    <>
      <mesh position={[0, 0, wallZ]} renderOrder={-20} raycast={noRaycast}>
        <planeGeometry args={[height * aspect, height]} />
        <meshBasicMaterial map={gradient} toneMapped={false} depthWrite={false} />
      </mesh>
      {/* the photo mode carries its own contact shadow and reflection */}
      {!photo && shadow > 0.01 && (
        <mesh
          position={[shadowOffset[0], shadowOffset[1], wallZ + 0.02]}
          scale={[shadowScale[0], shadowScale[1], 1]}
          renderOrder={-19}
          raycast={noRaycast}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={soft} transparent opacity={shadow} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </>
  );
}

/**
 * The measured backdrop of `reference-image.jpg`, ready to hand to `<Backdrop>`
 * when a view is meant to reproduce the photo's frame rather than a studio.
 */
export const REF_BACKDROP = {
  photo: true,
  shadow: 0,
  shadowOffset: [0.0, -0.98] as [number, number],
  shadowScale: [1.35, 0.32] as [number, number],
};

/**
 * The reference's backdrop placed for the hero camera. The photo's frame is
 * 1920 px square against a 1536 px case, i.e. 1.25 case heights; the wall sits
 * 13.4 units from a fov-16 camera, whose visible height there is
 * 2 * 13.4 * tan(8deg) = 3.766 — so a wall plane exactly that tall (and square)
 * makes texture space identical to photo space: the floor line, the reflection
 * and the contact shadow all land where the photo puts them.
 */
export const HERO_WALL_HEIGHT = 3.766;
export const HERO_BACKDROP = { ...REF_BACKDROP };
