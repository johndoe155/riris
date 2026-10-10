'use client';

import * as THREE from 'three';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shaderMaterial } from '@react-three/drei';
import { applyProps, extend, useFrame, useThree, type ThreeElement, type ThreeEvent } from '@react-three/fiber';
import type { ForgePalette } from './forgePalette';

/* ------------------------------------------------------------------ *
 * Finishes
 * ------------------------------------------------------------------ */

export type FinishName = 'base' | 'holo' | 'cracked-ice' | 'gold';

/** Finish name → the number the shader blends between. */
export const FINISH_INDEX: Record<FinishName, number> = {
  base: 0,
  holo: 1,
  'cracked-ice': 2,
  gold: 3,
};

/* ------------------------------------------------------------------ *
 * Shader
 *
 * Two modes:
 *   0 base     — draws the art itself with the finish mixed in (legacy path)
 *   1 overlay  — a transparent foil pass that sits on the card plane and is
 *                masked to the art window, so the frame, title and attributes
 *                keep their own inks
 * ------------------------------------------------------------------ */

const HoloShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uPointer: new THREE.Vector2(0.5, 0.5),
    uImage: null as THREE.Texture | null,
    /** source width / height — drives the cover-fit crop */
    uImageAspect: 1,
    /** card face width / height */
    uCardAspect: 0.709,
    uFinish: 0,
    uIntensity: 1,
    /** 0 = draw the art, 1 = foil overlay */
    uMode: 0,
    /**
     * x0, y0, x1, y1 of the foil mask, in card UV (v measured from the bottom).
     * These are the measured art window of `reference-image.jpg`: card
     * x 0.0569..0.9431, y 0.0464..0.6325 from the top.
     */
    uMask: new THREE.Vector4(0.0569, 0.3675, 0.9431, 0.9536),
    /**
     * The reference's art frame is a hard 4 px ink line, so the foil has to
     * stop at it: the old 0.06 feather smeared the rainbow ~30 px past the
     * window and onto the card's furniture, which the photo does not show.
     */
    uMaskFeather: 0.012,
    /** how strongly the foil shows outside the mask (the photo shows none) */
    uOutside: 0.015,
    uPaletteBase: new THREE.Color('#ffffff'),
    uPaletteCool: new THREE.Color('#c8e7f0'),
    uPaletteWarm: new THREE.Color('#f1c676'),
    uPaletteEnabled: 0,
  },
  // vertex
  /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vUv = uv;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vViewDir = normalize(-mvPos.xyz);
      gl_Position = projectionMatrix * mvPos;
    }
  `,
  // fragment
  /* glsl */ `
    uniform float uTime;
    uniform vec2 uPointer;
    uniform sampler2D uImage;
    uniform float uImageAspect;
    uniform float uCardAspect;
    uniform float uFinish;
    uniform float uIntensity;
    uniform float uMode;
    uniform vec4 uMask;
    uniform float uMaskFeather;
    uniform float uOutside;
    uniform vec3 uPaletteBase;
    uniform vec3 uPaletteCool;
    uniform vec3 uPaletteWarm;
    uniform float uPaletteEnabled;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    /**
     * Diffraction ramp. A real foil's orders are never fully saturated — they
     * sit on top of the specular white and wash out toward the highlights — so
     * the pure-hue stops are pulled toward their own luma by uFoilSat.
     */
    vec3 holoGradient(float t) {
      vec3 c1 = vec3(1.0, 0.48, 0.22); // orange
      vec3 c2 = vec3(0.32, 0.78, 0.92); // cyan
      vec3 c3 = vec3(1.0, 0.82, 0.34); // yellow
      vec3 c4 = vec3(0.92, 0.35, 0.72); // magenta
      float t2 = fract(t);
      vec3 c = (t2 < 0.33) ? mix(c1, c2, t2 / 0.33)
             : (t2 < 0.66) ? mix(c2, c3, (t2 - 0.33) / 0.33)
             :               mix(c3, c4, (t2 - 0.66) / 0.34);
      // the foil's own orders arrive with roughly equal energy, so the ramp is
      // desaturated toward its luma before it multiplies the base
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return mix(c, vec3(l), 0.42);
    }

    // Cover-fit: crop the source rather than squashing it into the card face.
    vec2 coverUv(vec2 uv, float imageAspect, float cardAspect) {
      float ratio = imageAspect / max(cardAspect, 0.0001);
      vec2 scale = ratio > 1.0 ? vec2(1.0 / ratio, 1.0) : vec2(1.0, ratio);
      return (uv - 0.5) * scale + 0.5;
    }

    // Soft rectangle mask: 1 inside the art window, fading to uOutside beyond.
    float artMask(vec2 uv) {
      vec4 m = uMask;
      float dx = max(max(m.x - uv.x, uv.x - m.z), 0.0);
      float dy = max(max(m.y - uv.y, uv.y - m.w), 0.0);
      float d = length(vec2(dx, dy));
      return 1.0 - smoothstep(0.0, max(uMaskFeather, 0.001), d);
    }

    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vViewDir);
      vec3 img = texture2D(uImage, coverUv(vUv, uImageAspect, uCardAspect)).rgb;

      float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
      vec3 lightDir = normalize(vec3(0.35, 0.6, 0.72));
      vec3 halfVec = normalize(lightDir + v);
      float spec = pow(clamp(dot(n, halfVec), 0.0, 1.0), 34.0);
      float viewShift = (1.0 - abs(dot(n, v))) * 0.6 + spec * 0.5;

      vec2 pointer = uPointer;
      float dist = distance(vUv, pointer);
      float pointerGlow = 1.0 - smoothstep(0.0, 0.75, dist);

      // The foil's orders run as a diffraction grating: a family of near-parallel
      // lines whose spacing sets the colour banding. Kept on a fixed axis plus a
      // view-angle term (rather than the old polar spiral around the pointer) —
      // a grating is anisotropic, and the radial version read as a lens flare.
      float grating = (vUv.x * 0.72 + vUv.y * 0.28) * 18.0
                    + viewShift * 3.0
                    + dist * 1.2
                    + uTime * 0.06;
      float bands = sin(grating) * 0.5 + 0.5;
      // a second, coarser order so the ramp is not a single clean sine
      bands = mix(bands, sin(grating * 0.37 + 1.7) * 0.5 + 0.5, 0.35);
      vec3 foil = holoGradient(bands + viewShift * 0.5 + pointer.x * 0.25);
      // Dynamic Forge palette adapts the finish atmosphere without replacing
      // the foil's identity. Defaults preserve the existing pit behavior.
      float paletteMix = uPaletteEnabled * clamp(0.18 + fresnel * 0.22 + pointerGlow * 0.12, 0.0, 0.46);
      vec3 paletteAccent = mix(uPaletteCool, uPaletteWarm, bands);
      foil = mix(foil, mix(foil, paletteAccent, 0.38), paletteMix);

      /* ---- per-finish colour + strength ---- */
      float w0 = max(0.0, 1.0 - abs(uFinish - 0.0));
      float w1 = max(0.0, 1.0 - abs(uFinish - 1.0));
      float w2 = max(0.0, 1.0 - abs(uFinish - 2.0));
      float w3 = max(0.0, 1.0 - abs(uFinish - 3.0));
      float wSum = max(w0 + w1 + w2 + w3, 0.0001);

      // the foil is only lit where the view angle has moved it off the
      // specular axis, plus where the pointer sits: much tighter than before,
      // so the card's frame and inks stay flat ink at rest
      float foilMask = clamp(fresnel * 0.42 + pointerGlow * 0.22 + 0.025, 0.0, 0.58);
      foilMask *= 0.78 + noise(vUv * 8.0 + uTime * 0.08) * 0.22;

      float n1 = noise(vUv * 12.0 + 3.1);
      float n2 = noise(vUv * 27.0 + 11.0);
      float crack = 1.0 - smoothstep(0.0, 0.16, abs(n1 - n2));
      vec3 ice = vec3(0.78, 0.88, 1.0);
      vec3 goldA = vec3(1.0, 0.86, 0.36);
      vec3 goldB = vec3(0.62, 0.42, 0.09);
      vec3 gold = mix(goldB, goldA, sin(vUv.y * 3.0 + uTime * 0.2 + viewShift * 5.0) * 0.5 + 0.5);

      // base finish: the card's own ink, lifted only slightly by the view angle
      vec3 baseTint = mix(vec3(1.0), uPaletteBase, uPaletteEnabled * 0.08);
      float baseAmt = 0.02 + fresnel * 0.04;

      vec3 holoTint = foil;
      float holoAmt = clamp(foilMask * 0.48 + spec * 0.18 + fresnel * 0.10, 0.0, 0.34);

      vec3 iceTint = mix(ice * (0.6 + crack * 0.4) + vec3(crack * 0.35), uPaletteCool, uPaletteEnabled * 0.16);
      float iceAmt = clamp(0.24 + fresnel * 0.3 + crack * 0.45 + spec * 0.3, 0.0, 0.8);

      vec3 goldTint = mix(gold, uPaletteWarm, uPaletteEnabled * 0.14);
      float goldAmt = clamp(0.4 + fresnel * 0.3 + spec * 0.5, 0.0, 0.95);

      vec3 effectColor = (baseTint * baseAmt * w0 + holoTint * holoAmt * w1 +
                          iceTint * iceAmt * w2 + goldTint * goldAmt * w3) / wSum;
      float effectAmt = (baseAmt * w0 + holoAmt * w1 + iceAmt * w2 + goldAmt * w3) / wSum;

      if (uMode > 0.5) {
        /* ---- foil overlay: masked to the art window ---- */
        float m = artMask(vUv);
        float alpha = effectAmt * mix(uOutside, 1.0, m) * uIntensity;
        vec3 col = effectColor / max(effectAmt, 0.0001);
        // keep the very top end of the foil from clipping to flat white
        col = min(col, vec3(1.6));
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      } else {
        /* ---- base: the art itself, with the finish mixed in ---- */
        vec3 baseTier = img * (0.97 + fresnel * 0.1);
        vec3 holoTier = mix(img, foil, clamp(foilMask * 0.34, 0.0, 0.52));
        holoTier += foil * (fresnel * 0.12 + spec * 0.18);
        vec3 iceTier = mix(img, ice, clamp(0.18 + n1 * 0.22 + fresnel * 0.45, 0.0, 1.0));
        iceTier += ice * crack * (0.35 + pointerGlow * 0.5 + spec * 0.6);
        iceTier += ice * fresnel * 0.25;
        vec3 goldTier = mix(img, gold, clamp(fresnel * 0.85 + pointerGlow * 0.45 + 0.15, 0.0, 1.0) * 0.6);
        goldTier += gold * (fresnel * 0.45 + spec * 0.6);

        vec3 tinted = (baseTier * w0 + holoTier * w1 + iceTier * w2 + goldTier * w3) / wSum;
        vec3 col = mix(img, tinted, uIntensity);

        float vignette = 1.0 - smoothstep(0.5, 1.2, length(vUv - 0.5) * 1.5);
        col *= 0.98 + vignette * 0.08;
        col *= sin(vUv.y * 420.0) * 0.015 + 0.985;

        gl_FragColor = vec4(col, 1.0);
      }

      // Encode for wherever we are: identity when a composer owns the buffer,
      // linear -> sRGB when this draws straight to the canvas.
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
);

extend({ HoloShaderMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    holoShaderMaterial: ThreeElement<typeof HoloShaderMaterial>;
  }
}

/* ------------------------------------------------------------------ *
 * Gyro / device tilt — the pointer for phones
 * ------------------------------------------------------------------ */

export interface DeviceTiltState {
  x: number;
  y: number;
  active: boolean;
}

const tiltState: DeviceTiltState = { x: 0.5, y: 0.5, active: false };

let orientationBound = false;
let gestureBound = false;
let permission: 'unknown' | 'pending' | 'granted' | 'denied' | 'unsupported' = 'unknown';

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

function onDeviceOrientation(event: DeviceOrientationEvent) {
  const { beta, gamma } = event;
  if (beta == null && gamma == null) return;
  const angle = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle ?? 0 : 0;
  const rad = (angle * Math.PI) / 180;
  const b = beta ?? 0;
  const g = gamma ?? 0;
  const x = g * Math.cos(rad) + b * Math.sin(rad);
  const y = -g * Math.sin(rad) + b * Math.cos(rad);
  tiltState.x = clamp01(0.5 + x / 70);
  tiltState.y = clamp01((y - 25) / 60);
  tiltState.active = true;
}

function bindOrientation() {
  if (orientationBound || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
  orientationBound = true;
  window.addEventListener('deviceorientation', onDeviceOrientation, true);
}

/** iOS 13+ gates motion sensors behind a prompt that must run in a gesture. */
export function requestDeviceTilt() {
  if (permission !== 'unknown' || typeof window === 'undefined') return;
  const DeviceOrientation = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
    .DeviceOrientationEvent;
  if (!DeviceOrientation) {
    permission = 'unsupported';
    return;
  }
  if (typeof DeviceOrientation.requestPermission !== 'function') {
    permission = 'granted';
    bindOrientation();
    return;
  }
  permission = 'pending';
  Promise.resolve(DeviceOrientation.requestPermission())
    .then((result) => {
      permission = result === 'granted' ? 'granted' : 'denied';
      if (result === 'granted') bindOrientation();
    })
    .catch(() => {
      permission = 'denied';
    });
}

function bindFirstGesture() {
  if (gestureBound || typeof window === 'undefined') return;
  gestureBound = true;
  const onGesture = () => {
    window.removeEventListener('pointerdown', onGesture, true);
    requestDeviceTilt();
  };
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
}

export function useDeviceTilt(): DeviceTiltState {
  useEffect(() => {
    bindOrientation();
    bindFirstGesture();
  }, []);
  return tiltState;
}

/* ------------------------------------------------------------------ *
 * Pointer binding
 * ------------------------------------------------------------------ */

export interface CardPointer {
  /** live hover point in card UV space (mutated in place, no re-render) */
  pointer: THREE.Vector2;
  hovered: boolean;
  bind: {
    onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
    onPointerEnter: (event: ThreeEvent<PointerEvent>) => void;
    onPointerLeave: () => void;
  };
}

/**
 * Pointer in card space. Extruded geometry carries shape-space UVs, so when the
 * card's size is known the UV is rebuilt from the local hit point instead —
 * that keeps the foil highlight exactly under the cursor.
 */
export function useCardPointer(sizeW?: number, sizeH?: number): CardPointer {
  const pointer = useMemo(() => new THREE.Vector2(0.5, 0.5), []);
  const [hovered, setHovered] = useState(false);
  const setHover = useCallback((next: boolean) => setHovered(next), []);
  const local = useMemo(() => new THREE.Vector3(), []);

  const bind = useMemo(
    () => ({
      onPointerMove: (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        if (sizeW && sizeH) {
          local.copy(event.point);
          event.object.worldToLocal(local);
          pointer.set(clamp01(local.x / sizeW + 0.5), clamp01(local.y / sizeH + 0.5));
        } else if (event.uv) {
          pointer.set(event.uv.x, event.uv.y);
        }
      },
      onPointerEnter: (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        setHover(true);
      },
      onPointerLeave: () => setHover(false),
    }),
    [pointer, setHover, local, sizeW, sizeH]
  );

  return { pointer, hovered, bind };
}

/* ------------------------------------------------------------------ *
 * Material component
 * ------------------------------------------------------------------ */

function textureAspect(texture: THREE.Texture | null | undefined): number {
  const image = texture?.image as
    | { width?: number; height?: number; videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number }
    | undefined;
  const w = image?.videoWidth ?? image?.naturalWidth ?? image?.width ?? 0;
  const h = image?.videoHeight ?? image?.naturalHeight ?? image?.height ?? 0;
  return w > 0 && h > 0 ? w / h : 1;
}

export interface HoloCardMaterialProps {
  image?: THREE.Texture | null;
  finish?: FinishName;
  pointer?: THREE.Vector2 | null;
  hovered?: boolean;
  intensity?: number;
  hoverBoost?: number;
  cardAspect?: number;
  timeOffset?: number;
  /** 1 = foil overlay (transparent, mask-driven), 0 = draw the art */
  overlay?: boolean;
  /** art window rect in card UV for the overlay mask */
  mask?: [number, number, number, number];
  maskFeather?: number;
  /** foil strength outside the mask (0 = card plane only) */
  outside?: number;
  /** Optional Forge-only atmosphere colors; omitted in the Gallery Pit. */
  palette?: ForgePalette['shader'];
}

export function HoloCardMaterial({
  image = null,
  finish = 'base',
  pointer = null,
  hovered = false,
  intensity = 1,
  hoverBoost = 1.4,
  cardAspect = 0.709,
  timeOffset = 0,
  overlay = false,
  mask = [0.0569, 0.3675, 0.9431, 0.9536],
  maskFeather = 0.012,
  outside = 0.015,
  palette,
}: HoloCardMaterialProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const gl = useThree((state) => state.gl);
  const tilt = useDeviceTilt();

  const coarsePointer = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    []
  );

  const anim = useRef({
    pointer: new THREE.Vector2(0.5, 0.5),
    finish: FINISH_INDEX[finish],
    intensity,
  });

  const imageAspect = useMemo(() => textureAspect(image), [image]);

  // sRGB decode + filtering for the legacy image path.
  useLayoutEffect(() => {
    if (!image) return;
    applyProps(image, {
      colorSpace: THREE.SRGBColorSpace,
      anisotropy: Math.min(8, gl.capabilities.getMaxAnisotropy()),
      needsUpdate: true,
    });
  }, [image, gl]);

  useLayoutEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    const u = material.uniforms;
    u.uImage.value = image;
    u.uImageAspect.value = textureAspect(image);
    u.uCardAspect.value = cardAspect;
    u.uMode.value = overlay ? 1 : 0;
    u.uMask.value.set(mask[0], mask[1], mask[2], mask[3]);
    u.uMaskFeather.value = maskFeather;
    u.uOutside.value = outside;
    u.uPaletteBase.value.set(palette?.base ?? '#ffffff');
    u.uPaletteCool.value.set(palette?.cool ?? '#c8e7f0');
    u.uPaletteWarm.value.set(palette?.warm ?? '#f1c676');
    u.uPaletteEnabled.value = palette ? 1 : 0;
    material.transparent = overlay;
    material.depthWrite = !overlay;
    material.needsUpdate = true;
  }, [image, cardAspect, overlay, mask, maskFeather, outside, palette]);

  useFrame((state, rawDelta) => {
    const material = materialRef.current;
    if (!material) return;
    const a = anim.current;
    const delta = Math.min(rawDelta, 1 / 30);
    const u = material.uniforms;

    if (u.uImage.value !== image) {
      u.uImage.value = image;
      u.uImageAspect.value = imageAspect;
    }
    u.uCardAspect.value = cardAspect;

    let targetX = 0.5;
    let targetY = 0.5;
    if (coarsePointer && tilt.active) {
      targetX = tilt.x;
      targetY = tilt.y;
    } else if (pointer) {
      targetX = pointer.x;
      targetY = pointer.y;
    }
    const k = 1 - Math.exp(-10 * delta);
    a.pointer.x += (targetX - a.pointer.x) * k;
    a.pointer.y += (targetY - a.pointer.y) * k;

    a.finish = THREE.MathUtils.damp(a.finish, FINISH_INDEX[finish], 5, delta);
    a.intensity = THREE.MathUtils.damp(a.intensity, intensity * (hovered ? hoverBoost : 1), 8, delta);

    u.uTime.value = state.clock.elapsedTime + timeOffset;
    u.uPointer.value.copy(a.pointer);
    u.uFinish.value = a.finish;
    u.uIntensity.value = a.intensity;
  });

  return <holoShaderMaterial ref={materialRef} />;
}

export { HoloShaderMaterial };
