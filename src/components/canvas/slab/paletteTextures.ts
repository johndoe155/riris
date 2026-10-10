'use client';

import * as THREE from 'three';
import type { SlabCard } from '@/data/slabCards';
import { SLAB_SPEC, trayLayout } from './SlabSpec';
import { drawCardFace, drawFaceMap, drawLabel, drawTray, faceMapHeight, innerArtBox } from './textures';
import { cardFaceText, FACE_TIERS, LABEL_TIERS, labelText } from './useSlabTextures';
import { clonePalette, groupChanged, type PaletteGroup, type SlabPalette } from './slabPalette';

/* ------------------------------------------------------------------ *
 * Palette-scoped baked textures
 *
 * Four of the slab's surfaces are CANVAS paintings (card face, label plate,
 * tray floor, face-plate map), so their palette cannot be a uniform — it has
 * to be re-painted. This set owns one canvas per surface and repaints it IN
 * PLACE (same texture object, `needsUpdate = true`), so materials never swap
 * textures mid-glide and nothing is allocated per frame.
 *
 * Repaints are gated per surface on the slots that surface actually paints
 * (PALETTE_GROUPS) and throttled while the palette is moving: the eye reads
 * a colour glide, not a texture resolution, so 7-11 repaints across a ~1s
 * transition are indistinguishable from continuous, at a fraction of the
 * cost. When the engine settles, a final exact repaint lands (tol 0).
 * ------------------------------------------------------------------ */

export interface PaletteTextureInput {
  card: SlabCard;
  tier: keyof typeof FACE_TIERS;
  art: HTMLImageElement | null;
  logo: HTMLImageElement | null;
}

const INTERVAL: Record<PaletteGroup, number> = { face: 140, label: 120, tray: 90, faceMap: 90 };
/** while moving, ignore palette movement finer than this (0..255 per channel) */
const MOVE_TOL = 3;

interface Slot {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  painted: SlabPalette | null;
  lastAt: number;
  key: string;
}

function makeSlot(w: number, h: number): Slot {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false })!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { canvas, ctx, tex, painted: null, lastAt: 0, key: '' };
}

export class PaletteTextureSet {
  readonly face: Slot;
  readonly label: Slot;
  readonly tray: Slot;
  readonly faceMap: Slot;

  constructor(tier: keyof typeof FACE_TIERS = 'hero') {
    const fw = FACE_TIERS[tier];
    const fh = Math.round(fw * (SLAB_SPEC.cardH / SLAB_SPEC.cardW));
    this.face = makeSlot(fw, fh);
    const lw = LABEL_TIERS[tier];
    this.label = makeSlot(lw, Math.round(lw * (SLAB_SPEC.labelH / SLAB_SPEC.labelW)));
    this.tray = makeSlot(512, 768);
    this.faceMap = makeSlot(1024, faceMapHeight(1024));
  }

  get textures() {
    return { face: this.face.tex, label: this.label.tex, tray: this.tray.tex, faceMap: this.faceMap.tex };
  }

  /**
   * Repaint whichever surfaces the palette has visibly moved. Returns true if
   * anything was repainted this call.
   */
  update(pal: SlabPalette, input: PaletteTextureInput, now: number, moving: boolean): boolean {
    let changed = false;
    const tol = moving ? MOVE_TOL : 0;

    /* card face: inks + field + art letterbox */
    const faceKey = `${input.card.id}:${input.art ? 'art' : 'no'}:${input.tier}`;
    if (this.should(this.face, 'face', pal, faceKey, now, moving, tol)) {
      const o = cardFaceText(input.card, FACE_TIERS[input.tier], pal);
      drawCardFace(this.face.ctx, o, input.art, innerArtBox(o));
      this.face.tex.needsUpdate = true;
      this.commit(this.face, pal, faceKey, now);
      changed = true;
    }

    /* label plate */
    const labelKey = `${input.card.id}:${input.logo ? 'logo' : 'no'}:${input.tier}`;
    if (this.should(this.label, 'label', pal, labelKey, now, moving, tol)) {
      drawLabel(this.label.ctx, labelText(input.card, LABEL_TIERS[input.tier], pal, input.logo));
      this.label.tex.needsUpdate = true;
      this.commit(this.label, pal, labelKey, now);
      changed = true;
    }

    /* tray floor */
    if (this.should(this.tray, 'tray', pal, 'tray', now, moving, tol)) {
      drawTray(this.tray.ctx, 512, 768, trayLayout(), pal);
      this.tray.tex.needsUpdate = true;
      this.commit(this.tray, pal, 'tray', now);
      changed = true;
    }

    /* face-plate map */
    if (this.should(this.faceMap, 'faceMap', pal, 'facemap', now, moving, tol)) {
      drawFaceMap(this.faceMap.ctx, 1024, this.faceMap.canvas.height, pal);
      this.faceMap.tex.needsUpdate = true;
      this.commit(this.faceMap, pal, 'facemap', now);
      changed = true;
    }

    return changed;
  }

  private should(slot: Slot, group: PaletteGroup, pal: SlabPalette, key: string, now: number, moving: boolean, tol: number) {
    if (!slot.painted || slot.key !== key) return true;
    if (!groupChanged(slot.painted, pal, group, tol)) return false;
    return !moving || now - slot.lastAt >= INTERVAL[group];
  }

  private commit(slot: Slot, pal: SlabPalette, key: string, now: number) {
    // clone: the engine mutates its palette in place, so a live reference
    // would compare equal to itself and never trigger the next repaint
    slot.painted = clonePalette(pal);
    slot.key = key;
    slot.lastAt = now;
  }

  setAnisotropy(max: number) {
    const a = Math.min(16, max);
    for (const slot of [this.face, this.label, this.tray, this.faceMap]) slot.tex.anisotropy = a;
  }

  dispose() {
    for (const slot of [this.face, this.label, this.tray, this.faceMap]) slot.tex.dispose();
  }
}
