'use client';
import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * The slab stands in front of a plain gradient with a soft drop shadow — the
 * setting the reference photo was shot in. Both are drawn into canvases rather
 * than lit geometry: they cost nothing and never pick up the strip lights that
 * are meant for the plastic.
 *
 * The gradient is *diagonal*, which is what the reference actually shows
 * (fitted to the photo's background in `scripts/analysis/_bgfit.mjs`): a linear
 * ramp at 50 degrees, from #35202f along the bottom-left to #b5a3b0 at the
 * top-right, so the light is off to the right of frame and above. An earlier
 * version painted a vertical ramp with a pool of light behind the slab, which
 * put the brightest part of the wall in the centre and made the case read flat.
 *
 * The shadow sits ON the backdrop plane, not floating just behind the slab, so
 * it behaves like a shadow cast on a wall while the camera orbits, and it is
 * tight against the case's bottom edge — the reference's contact shadow is
 * ~20 px deep on a 1116 px case, not a pool 400 px wide.
 */

let gradientCache: THREE.CanvasTexture | null = null;
let gradientKey = '';

function gradientTexture(top: string, glow: string, bottom: string, angle: number, cover = 1) {
  const key = `${top}|${glow}|${bottom}|${angle}|${cover}`;
  if (gradientCache && gradientKey === key) return gradientCache;
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // direction: 0 = pure horizontal (light on the right), positive tilts the
  // light end up toward the top-right, in radians. `cover` is the fraction of
  // the wall the calibrated photo frame occupies: the gradient line spans only
  // that middle band and the canvas gradient clamps past its ends, so a wall
  // bigger than the photo frame shows no edge of its own.
  const dx = Math.cos(angle) * size * 0.5 * cover;
  const dy = Math.sin(angle) * size * 0.5 * cover;
  const g = ctx.createLinearGradient(size / 2 - dx, size / 2 + dy, size / 2 + dx, size / 2 - dy);
  g.addColorStop(0, bottom);
  g.addColorStop(0.5, glow);
  g.addColorStop(1, top);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  gradientCache = tex;
  gradientKey = key;
  return tex;
}

let shadowCache: THREE.CanvasTexture | null = null;

function shadowTexture() {
  if (shadowCache) return shadowCache;
  const size = 512;
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
  /** visible height in world units; the slab is ~1.677 tall */
  height?: number;
  /** plane width / height. The wall is 1.35 wide by default; the hero passes 1 */
  aspect?: number;
  /** the lit end of the gradient (toward the top-right by default) */
  top?: string;
  glow?: string;
  /** the dark end of the gradient */
  bottom?: string;
  /** tilt of the gradient in radians; 0 = light straight to the right */
  angle?: number;
  /** fraction of the wall the calibrated photo frame occupies (gradient span) */
  cover?: number;
  shadow?: number;
  /** shadow centre and size, relative to the slab */
  shadowOffset?: [number, number];
  shadowScale?: [number, number];
}

export function Backdrop({
  height = 8,
  aspect = 1.35,
  top = '#191418',
  glow = '#4a3a45',
  bottom = '#0d0a0d',
  angle = 0.28,
  cover = 1,
  shadow = 0.72,
  shadowOffset = [0.02, -0.95],
  shadowScale = [1.55, 0.30],
}: BackdropProps) {
  const gradient = useMemo(() => gradientTexture(top, glow, bottom, angle, cover), [top, glow, bottom, angle, cover]);
  const soft = useMemo(() => shadowTexture(), []);
  const wallZ = -6;

  return (
    <>
      <mesh position={[0, 0, wallZ]} renderOrder={-20} raycast={noRaycast}>
        <planeGeometry args={[height * aspect, height]} />
        <meshBasicMaterial map={gradient} toneMapped={false} depthWrite={false} />
      </mesh>
      {shadow > 0.01 && (
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
  // least-squares fit of the photo's background pixels (scripts/analysis/_bgfit.mjs):
  // rms residual 8.4 per channel, against 14.1 for the previous stops and angle
  top: '#b5a3b0',
  glow: '#5b4153',
  bottom: '#35202f',
  // 50 degrees from +x. The old 0.28 rad (16 degrees) made the bottom-right far
  // too bright.
  angle: 0.873,
  shadow: 0.7,
  shadowOffset: [0.0, -0.98] as [number, number],
  shadowScale: [1.35, 0.32] as [number, number],
};

/**
 * The reference's backdrop placed for the hero camera. The photo's frame is
 * 2.24 x 2.23 case units; the wall is 1.82 times farther from the camera than the
 * case front, so the frame is 4.07 wall units square. Every colour then sits at
 * the same place relative to the case as it does in the photo. The default
 * wall (9 units tall, 1.35 wide) left the visible part almost flat mid-mauve.
 *
 * The contact shadow moves to the case's bottom edge at wall depth (y -1.56).
 */
/*
 * The hero camera (fov 38, 3:4 canvas) sees 6.34 x 4.76 world units at the
 * wall's depth; the photo frame is only 4.07 square there, so a 4.07 wall put
 * its own hard edges inside the shot — the pale rectangle and dark strip
 * beside the case. The wall now covers the view, and `cover` keeps the
 * gradient calibrated to the photo frame (the canvas gradient clamps beyond
 * it, so the extra wall is a smooth continuation, not a new edge).
 */
export const HERO_WALL_HEIGHT = 7.0;
export const HERO_BACKDROP = {
  ...REF_BACKDROP,
  cover: 4.07 / 7.0,
  // the photo's contact shadow is ~30 px deep and near black (35) under the case
  shadow: 1.0,
  shadowOffset: [0.0, -1.56] as [number, number],
  shadowScale: [2.1, 0.28] as [number, number],
};
