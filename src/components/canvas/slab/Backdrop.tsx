'use client';
import { useMemo } from 'react';
import * as THREE from 'three';

/**
 * The slab stands in front of a plain gradient with a soft drop shadow — the
 * setting the reference photo was shot in. Both are drawn into canvases rather
 * than lit geometry: they cost nothing and never pick up the strip lights that
 * are meant for the plastic.
 *
 * The shadow sits ON the backdrop plane, not floating just behind the slab, so
 * it behaves like a shadow cast on a wall while the camera orbits.
 */

let gradientCache: THREE.CanvasTexture | null = null;
let gradientKey = '';

function gradientTexture(top: string, glow: string, bottom: string) {
  const key = `${top}|${glow}|${bottom}`;
  if (gradientCache && gradientKey === key) return gradientCache;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  /* The reference backdrop is a DIAGONAL ramp, not a vertical one. Sampled in
   * 150 px corner patches it reads #32212e bottom-left, #b3a6b1 top-right and
   * #564351 / #5c4858 on the other two corners, i.e. the mid tone. A vertical
   * gradient lays the brightest band straight across the slab's shoulders,
   * which is the most visible thing the old backdrop got wrong. */
  const g = ctx.createLinearGradient(0, size, size, 0);
  g.addColorStop(0, bottom); // bottom-left, darkest
  g.addColorStop(0.5, glow); // middle of the diagonal
  g.addColorStop(1, top); // top-right, brightest
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  /* The off-diagonal corners sit about 25 L* under the centre (#564351 and
   * #5c4858 against a #745e5e middle) so there IS a vignette, just a gentle
   * one. The old 0.55 alpha black pushed them 55 L* down. */
  const vig = ctx.createRadialGradient(128, 128, 74, 128, 128, 196);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(10,4,9,0.26)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  if (gradientCache) gradientCache.dispose();
  gradientCache = tex;
  gradientKey = key;
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
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.3)');
  g.addColorStop(0.75, 'rgba(0,0,0,0.08)');
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
  /** visible height in world units; the slab is ~1.66 tall */
  height?: number;
  top?: string;
  glow?: string;
  bottom?: string;
  shadow?: number;
  /** shadow centre and size, relative to the slab */
  shadowOffset?: [number, number];
  shadowScale?: [number, number];
}

export function Backdrop({
  height = 8,
  // measured off reference-image.jpg: top-right corner, diagonal middle,
  // bottom-left corner
  top = '#b3a6b1',
  glow = '#5a4856',
  bottom = '#32212e',
  shadow = 0.85,
  shadowOffset = [0.08, -1.42],
  shadowScale = [1.7, 1.05],
}: BackdropProps) {
  const gradient = useMemo(() => gradientTexture(top, glow, bottom), [top, glow, bottom]);
  const soft = useMemo(() => shadowTexture(), []);
  const wallZ = -6;

  return (
    <>
      <mesh position={[0, 0, wallZ]} renderOrder={-20} raycast={noRaycast}>
        <planeGeometry args={[height * 1.35, height]} />
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
