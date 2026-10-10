'use client';

import { useEffect, useMemo, useState } from 'react';
import { deriveAnchors, sampleArtwork, type ArtworkSample } from '../../../lib/palette';
import {
  clonePalette,
  deriveSlabPalette,
  hexDistance,
  lerpPaletteInto,
  REFERENCE_PALETTE,
  type PaletteDriver,
  type SlabPalette,
} from './slabPalette';

export type { PaletteDriver };
import { loadImage } from './useSlabTextures';

/* ------------------------------------------------------------------ *
 * The palette engine: one damped palette, many consumers
 *
 * Selection of a preset or an uploaded image derives a target palette; the
 * engine then glides `current` toward it exponentially in OKLab, every
 * frame, so the scene's colours LERP rather than cut. Consumers read
 * `current` inside their own frame loops (materials, lights, uniforms, the
 * void), which keeps the transition off React entirely; the few consumers
 * that must re-render (the studio Lightformers, whose environment needs a
 * re-bake, and the HUD) take a throttled snapshot instead.
 *
 * With no target the engine sits on REFERENCE_PALETTE, so an untouched
 * Forge renders exactly the measured reference look.
 * ------------------------------------------------------------------ */

/** exponential approach rate: ~95% of the way in ~0.9s */
const LAMBDA = 3.4;

function paletteDelta(a: SlabPalette, b: SlabPalette): number {
  let d = 0;
  d = Math.max(d, hexDistance(a.voidGlow, b.voidGlow));
  d = Math.max(d, hexDistance(a.voidPale, b.voidPale));
  d = Math.max(d, hexDistance(a.faceMid, b.faceMid));
  d = Math.max(d, hexDistance(a.field, b.field));
  d = Math.max(d, hexDistance(a.ink, b.ink));
  d = Math.max(d, hexDistance(a.glassBody, b.glassBody));
  const sa = a.shader;
  const sb = b.shader;
  for (const k of Object.keys(sa) as (keyof typeof sa)[]) {
    for (let i = 0; i < 3; i++) d = Math.max(d, Math.abs(sa[k][i] - sb[k][i]) * 255);
  }
  return d;
}

class PaletteEngine implements PaletteDriver {
  current: SlabPalette = clonePalette(REFERENCE_PALETTE);
  target: SlabPalette = clonePalette(REFERENCE_PALETTE);
  moving = false;
  private listeners = new Set<(reason: 'target' | 'settle') => void>();

  setTarget(p: SlabPalette | null) {
    const next = p ?? REFERENCE_PALETTE;
    if (next === this.target || next.id === this.target.id) {
      if (next === this.target) return;
    }
    this.target = next;
    this.moving = true;
    this.listeners.forEach((fn) => fn('target'));
  }

  step(delta: number): boolean {
    if (!this.moving) return false;
    const dt = Math.min(Math.max(delta, 0), 1 / 20);
    const k = 1 - Math.exp(-LAMBDA * dt);
    lerpPaletteInto(this.current, this.current, this.target, k);
    if (paletteDelta(this.current, this.target) < 1.2) {
      this.current = clonePalette(this.target);
      this.moving = false;
      this.listeners.forEach((fn) => fn('settle'));
    }
    return this.moving;
  }

  subscribe(fn: (reason: 'target' | 'settle') => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

/** the Forge's single palette engine (module singleton, like the wear maps) */
export const paletteEngine = new PaletteEngine();

/* ------------------------------------------------------------------ *
 * Artwork -> palette, with a cache and a safe CORS fallback
 * ------------------------------------------------------------------ */

/** longest side of the buffer the sampler works on */
const SAMPLE_SIZE = 112;

/**
 * Sample a loaded image into artwork statistics. Returns null when the
 * pixels cannot be read (a cross-origin image without CORS taints the
 * canvas), which the caller treats as "keep the current palette".
 */
export function sampleImageElement(img: HTMLImageElement | ImageBitmap): ArtworkSample | null {
  try {
    const w0 = 'naturalWidth' in img ? img.naturalWidth : img.width;
    const h0 = 'naturalHeight' in img ? img.naturalHeight : img.height;
    if (!w0 || !h0) return null;
    const k = SAMPLE_SIZE / Math.max(w0, h0);
    const w = Math.max(8, Math.round(w0 * Math.min(1, k)));
    const h = Math.max(8, Math.round(h0 * Math.min(1, k)));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    return sampleArtwork(data, w, h, 4);
  } catch {
    return null; // tainted canvas: no pixels, no palette, no crash
  }
}

const deriveCache = new Map<string, Promise<SlabPalette | null>>();

/**
 * Load (or reuse) an artwork and derive its palette. Null means "the pixels
 * were unreadable — stay on the reference palette".
 */
export function paletteFromArtwork(src: string): Promise<SlabPalette | null> {
  let hit = deriveCache.get(src);
  if (!hit) {
    hit = (async () => {
      const img = await loadImage(src);
      if (!img) return null;
      const sample = sampleImageElement(img);
      if (!sample) return null;
      return deriveSlabPalette(sample, deriveAnchors(sample));
    })();
    deriveCache.set(src, hit);
  }
  return hit;
}

/* ------------------------------------------------------------------ *
 * React: a throttled snapshot for the consumers that must re-render
 * ------------------------------------------------------------------ */

/**
 * Re-renders at most every `intervalMs` while the engine is gliding, plus
 * once when a target is set and once when it settles. The Lightformers need
 * this (their cube environment re-bakes on re-render); everything smoother
 * reads `engine.current` per frame instead.
 */
export function usePaletteSnapshot(driver: PaletteDriver = paletteEngine, intervalMs = 80): SlabPalette {
  const [snap, setSnap] = useState<SlabPalette>(() => clonePalette(driver.current));
  useEffect(() => {
    let live = true;
    let last = 0;
    let raf = 0;
    const tick = (now: number) => {
      if (!live) return;
      if (driver.moving && now - last >= intervalMs) {
        last = now;
        setSnap(clonePalette(driver.current));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const off = driver.subscribe(() => {
      if (!live) return;
      last = 0;
      setSnap(clonePalette(driver.current));
    });
    return () => {
      live = false;
      cancelAnimationFrame(raf);
      off();
    };
  }, [driver, intervalMs]);
  return snap;
}

/** convenience: the snapshot memoised by id, for prop-driven consumers */
export function usePaletteId(snap: SlabPalette) {
  return useMemo(() => snap.id, [snap]);
}
