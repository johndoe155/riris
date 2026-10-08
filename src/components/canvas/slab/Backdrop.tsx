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

function gradientTexture(top: string, glow: string, bottom: string) {
  if (gradientCache) return gradientCache;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, top);
  g.addColorStop(0.55, glow);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // a wide, soft pool of light behind the slab
  const pool = ctx.createRadialGradient(128, 118, 10, 128, 118, 190);
  pool.addColorStop(0, 'rgba(255,246,238,0.16)');
  pool.addColorStop(0.5, 'rgba(255,246,238,0.05)');
  pool.addColorStop(1, 'rgba(255,246,238,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, size, size);
  // and a vignette so the corners fall away
  const vig = ctx.createRadialGradient(128, 128, 60, 128, 128, 190);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  gradientCache = tex;
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
  top = '#191418',
  glow = '#4a3a45',
  bottom = '#0d0a0d',
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
