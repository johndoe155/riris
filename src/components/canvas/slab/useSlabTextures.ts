'use client';

import * as THREE from 'three';
import type { SlabCard } from '@/data/slabCards';
import { SLAB_SPEC, trayLayout } from './SlabSpec';
import {
  drawCardBack,
  drawCardFace,
  drawLabel,
  drawTray,
  mixHex,
  type CardFaceText,
  type LabelText,
} from './textures';
import type { BackStyle } from '@/data/slabCards';

/**
 * Card textures are built per card, but loaders, images and results are cached
 * at module level so the 42 pit slabs and the Forge share everything.
 */

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!imageCache.has(src)) {
    imageCache.set(
      src,
      new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null); // a missing art file still renders the face
        img.src = src;
      })
    );
  }
  return imageCache.get(src)!;
}

/** Pixel box of the art panel inside the drawn face. */
function artBox(o: CardFaceText) {
  return {
    x: o.width * o.artInset,
    y: o.height * o.artTop,
    w: o.width * o.artWidth,
    h: o.height * o.artHeight,
  };
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void, w: number, h: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ *
 * Card faces
 * ------------------------------------------------------------------ */

const faceCache = new Map<string, THREE.CanvasTexture>();

export const FACE_TIERS = { hero: 2048, cheap: 768 } as const;
export const LABEL_TIERS = { hero: 2048, cheap: 1024 } as const;
/** canvas aspects follow the slab spec, or the drawn text comes out stretched */
const FACE_ASPECT = SLAB_SPEC.cardH / SLAB_SPEC.cardW;
const LABEL_ASPECT = SLAB_SPEC.labelH / SLAB_SPEC.labelW;

export function cardFaceText(card: SlabCard, width: number = FACE_TIERS.hero): CardFaceText {
  const traits: [string, string][] = card.id === 'reference'
    ? [
        ['BACKGROUNDS', 'Pink Starry (5%)'],
        ['BASES', 'Rainbow (4%)'],
        ['BODYWEAR', 'Hawaiian (2%)'],
        ['EYES', 'None (36%)'],
        ['HANDS', 'Plutonium (3%)'],
        ['HATS', 'None (41%)'],
      ]
    : [
        ['BACKGROUND', 'Graded'],
        ['RARITY', card.type === '1/1' ? 'Unique (0.01%)' : 'Batch (2.4%)'],
        ['GRADE', card.grade],
        ['COLLECTION', card.collection],
        ['SERIAL', card.serial],
        ['OWNER', card.handle],
      ];
  return {
    title: card.title,
    collection: card.collection,
    serial: card.serial,
    handle: card.handle,
    grade: card.grade,
    traits,
    dark: card.frame === 'dark',
    tint: card.color2,
    width,
    height: Math.round(width * FACE_ASPECT),
    // one silhouette, shared with the extruded card body
    bodyRadius: SLAB_SPEC.cardRadius / SLAB_SPEC.cardW,
    cornerPower: SLAB_SPEC.cornerPower,
    // the frame and art window, measured off the reference photo
    ringInset: SLAB_SPEC.ringInset,
    ringWidth: SLAB_SPEC.ringWidth,
    ringRadius: SLAB_SPEC.cardRadius / SLAB_SPEC.cardW,
    artInset: SLAB_SPEC.artInset,
    artWidth: 1 - SLAB_SPEC.artInset * 2,
    artTop: SLAB_SPEC.artTop,
    artHeight: 1 - SLAB_SPEC.artTop - SLAB_SPEC.artBottom,
    artStroke: SLAB_SPEC.artStroke,
  };
}

/**
 * The newest texture for a card+tier (the art version once it has loaded).
 * The pit mounts all forty slabs at once but their art arrives asynchronously,
 * so a newly mounted slab asks here first instead of drawing a placeholder.
 */
const latestFace = new Map<string, THREE.CanvasTexture>();

export function latestCardTexture(card: SlabCard, tier: keyof typeof FACE_TIERS = 'hero') {
  return latestFace.get(`${card.id}:${tier}`) ?? null;
}

/**
 * Build (or return the cached) face texture for a card. `art` may be null.
 * `tier` sets the pixel width: the Forge renders a big one, the pit a small
 * one, so forty-odd slabs do not eat a hundred megabytes of texture memory.
 */
export function getCardFaceTexture(
  card: SlabCard,
  art: HTMLImageElement | null,
  tier: keyof typeof FACE_TIERS = 'hero'
): THREE.CanvasTexture {
  // a placeholder request for a card whose art has already landed gets the
  // finished texture: mounting order must not decide how a slab looks
  if (!art) {
    const upgraded = latestCardTexture(card, tier);
    if (upgraded) return upgraded;
  }
  const key = `${card.id}:${tier}:${art ? 'art' : 'noart'}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const o = cardFaceText(card, FACE_TIERS[tier]);
  const tex = canvasTexture((ctx) => {
    drawCardFace(ctx, o, art, artBox(o));
  }, o.width, o.height);
  faceCache.set(key, tex);
  return tex;
}

/** A tiny subscription helper: one per texture kind. */
function channel<T extends unknown[]>() {
  const set = new Set<(...args: T) => void>();
  return {
    add(fn: (...args: T) => void) {
      set.add(fn);
      return () => set.delete(fn);
    },
    fire(...args: T) {
      set.forEach((fn) => fn(...args));
    },
  };
}

/** Fired when a face texture is rebuilt because its art finally loaded. */
const faceChannel = channel<[SlabCard, keyof typeof FACE_TIERS]>();
export const onCardTextureReady = (fn: (card: SlabCard, tier: keyof typeof FACE_TIERS) => void) =>
  faceChannel.add(fn);

/** Load a card's art and rebuild its face. Safe to call from several slabs. */
export async function ensureCardTexture(
  card: SlabCard,
  tier: keyof typeof FACE_TIERS = 'hero'
): Promise<THREE.CanvasTexture> {
  const artKey = `${card.id}:${tier}:art`;
  const done = faceCache.get(artKey);
  if (done) {
    latestFace.set(`${card.id}:${tier}`, done);
    return done;
  }

  const art = await loadImage(card.art);
  const tex = getCardFaceTexture(card, art, tier);
  latestFace.set(`${card.id}:${tier}`, tex);

  if (art) {
    // release the placeholder, but not before every mounted slab has had a
    // frame to swap over to the finished texture
    const placeholderKey = `${card.id}:${tier}:noart`;
    const placeholder = faceCache.get(placeholderKey);
    if (placeholder && placeholder !== tex) {
      setTimeout(() => {
        if (faceCache.get(placeholderKey) === placeholder) faceCache.delete(placeholderKey);
        placeholder.dispose();
      }, 5000);
    }
  }
  faceChannel.fire(card, tier);
  return tex;
}

/* ------------------------------------------------------------------ *
 * Labels, backs, trays
 * ------------------------------------------------------------------ */

const labelCache = new Map<string, THREE.CanvasTexture>();

export function getLabelTexture(
  card: SlabCard,
  blank = false,
  tier: keyof typeof LABEL_TIERS = 'hero'
): THREE.CanvasTexture {
  const key = `${card.id}:${blank ? 'blank' : 'full'}:${tier}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const accent = blank ? '#D8D5D0' : card.color;
  const width = LABEL_TIERS[tier];
  const o: LabelText = {
    title: `${card.title.replace(/\s*#?\d+$/, '')}\nCOLLECTION`.toUpperCase(),
    grade: card.grade,
    serial: card.serial,
    width,
    height: Math.round(width * LABEL_ASPECT),
    accent,
    // the reference plate reads neutral dark (~#383037) with only a hint of the
    // card's own colour — a saturated moulding photographs far hotter than the
    // real part; the colour belongs in the accent border, not the plate
    plate: blank ? '#FFFFFF' : mixHex('#3f343c', card.color2, 0.06),
    ink: blank ? '#141414' : '#F7F5F2',
    qr: !blank,
    blank,
  };
  const tex = canvasTexture((ctx) => drawLabel(ctx, o), o.width, o.height);
  labelCache.set(key, tex);
  return tex;
}

const backCache = new Map<string, THREE.CanvasTexture>();
const backChannel = channel<[BackStyle]>();
export const onBackTextureReady = (fn: (style: BackStyle) => void) => backChannel.add(fn);

const BACK_W = 512;
const BACK_H = 722;
const backSilhouette = { radius: (SLAB_SPEC.cardRadius / SLAB_SPEC.cardW) * BACK_W, power: SLAB_SPEC.cornerPower };

/** The drawn fallback, used until (and if) the branded photo arrives. */
export function getBackTexture(): THREE.CanvasTexture {
  const key = 'generic';
  const hit = backCache.get(key);
  if (hit) return hit;
  const tex = canvasTexture(
    (ctx) => drawCardBack(ctx, 'generic', BACK_W, BACK_H, backSilhouette.radius, backSilhouette.power),
    BACK_W,
    BACK_H
  );
  backCache.set(key, tex);
  return tex;
}

export function latestBackTexture(style: BackStyle): THREE.CanvasTexture | null {
  return backCache.get(`photo:${style}`) ?? null;
}

export async function ensureBackTexture(style: BackStyle): Promise<THREE.CanvasTexture> {
  const key = `photo:${style}`;
  const done = backCache.get(key);
  if (done) return done;
  const photo = await loadImage(`/backs/${style}.jpg`);
  if (!photo) return getBackTexture();
  const tex = canvasTexture(
    (ctx) => drawCardBack(ctx, 'photo', BACK_W, BACK_H, backSilhouette.radius, backSilhouette.power, photo),
    BACK_W,
    BACK_H
  );
  backCache.set(key, tex);
  backChannel.fire(style);
  return tex;
}

let trayTex: THREE.CanvasTexture | null = null;

/** The window floor: painted from the same spec the geometry is cut from. */
export function getTrayTexture(): THREE.CanvasTexture {
  if (!trayTex) {
    trayTex = canvasTexture((ctx) => drawTray(ctx, 512, 768, trayLayout()), 512, 768);
  }
  return trayTex;
}
