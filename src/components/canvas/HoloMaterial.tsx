'use client';

import * as THREE from 'three';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shaderMaterial } from '@react-three/drei';
import { applyProps, extend, useFrame, useThree, type ThreeElement, type ThreeEvent } from '@react-three/fiber';

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
 * ------------------------------------------------------------------ */

const HoloShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uPointer: new THREE.Vector2(0.5, 0.5),
    uImage: null as THREE.Texture | null,
    /** source width / height — drives the cover-fit crop */
    uImageAspect: 1,
    /** card face width / height (a 3:4 slab by default) */
    uCardAspect: 0.75,
    uFinish: 0, // 0 base, 1 holo, 2 cracked, 3 gold
    uIntensity: 1,
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

    vec3 holoGradient(float t) {
      vec3 c1 = vec3(1.0, 0.3, 0.0); // orange
      vec3 c2 = vec3(0.0, 0.9, 1.0); // cyan
      vec3 c3 = vec3(1.0, 0.9, 0.0); // yellow
      vec3 c4 = vec3(1.0, 0.0, 0.9); // magenta
      float t2 = fract(t);
      if (t2 < 0.33) return mix(c1, c2, t2 / 0.33);
      if (t2 < 0.66) return mix(c2, c3, (t2 - 0.33) / 0.33);
      return mix(c3, c4, (t2 - 0.66) / 0.34);
    }

    // Cover-fit: crop the source instead of squashing it into the card face,
    // so a square NFT keeps its aspect on a 3:4 slab.
    vec2 coverUv(vec2 uv, float imageAspect, float cardAspect) {
      float ratio = imageAspect / max(cardAspect, 0.0001);
      vec2 scale = ratio > 1.0 ? vec2(1.0 / ratio, 1.0) : vec2(1.0, ratio);
      return (uv - 0.5) * scale + 0.5;
    }

    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vViewDir);

      vec3 img = texture2D(uImage, coverUv(vUv, uImageAspect, uCardAspect)).rgb;

      // View-angle terms. Fresnel gives the grazing sheen, the half vector gives
      // the tight highlight: both ride the surface normal, so tilting the card —
      // or the phone — shifts the foil with no pointer motion at all.
      float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
      vec3 lightDir = normalize(vec3(0.35, 0.6, 0.72)); // view space
      vec3 halfVec = normalize(lightDir + v);
      float spec = pow(clamp(dot(n, halfVec), 0.0, 1.0), 28.0);
      float viewShift = (1.0 - abs(dot(n, v))) * 0.6 + spec * 0.5;

      vec2 pointer = uPointer;
      float dist = distance(vUv, pointer);
      float pointerGlow = 1.0 - smoothstep(0.0, 0.75, dist);

      float bands = sin(atan(vUv.y - pointer.y, vUv.x - pointer.x) * 6.0
                     + uTime * 0.5 + dist * 10.0 + viewShift * 6.0) * 0.5 + 0.5;
      vec3 foil = holoGradient(bands + viewShift + pointer.x * 0.4 + uTime * 0.05);

      // --- the four finish tiers -------------------------------------
      // 0 base: the art, plus a whisper of glass sheen
      vec3 baseTier = img * (0.97 + fresnel * 0.1);

      // 1 holo foil
      float foilMask = clamp(fresnel * 0.8 + pointerGlow * 0.55 + 0.12, 0.0, 1.0);
      foilMask *= 0.55 + noise(vUv * 8.0 + uTime * 0.08) * 0.45;
      vec3 holoTier = mix(img, foil, foilMask * 0.75);
      holoTier += foil * (fresnel * 0.35 + spec * 0.45);

      // 2 cracked ice
      float n1 = noise(vUv * 12.0 + 3.1);
      float n2 = noise(vUv * 27.0 + 11.0);
      float crack = 1.0 - smoothstep(0.0, 0.16, abs(n1 - n2));
      vec3 ice = vec3(0.78, 0.88, 1.0);
      vec3 iceTier = mix(img, ice, clamp(0.18 + n1 * 0.22 + fresnel * 0.45, 0.0, 1.0));
      iceTier += ice * crack * (0.35 + pointerGlow * 0.5 + spec * 0.6);
      iceTier += ice * fresnel * 0.25;

      // 3 gold
      vec3 goldA = vec3(1.0, 0.86, 0.36);
      vec3 goldB = vec3(0.62, 0.42, 0.09);
      vec3 gold = mix(goldB, goldA, sin(vUv.y * 3.0 + uTime * 0.2 + viewShift * 5.0) * 0.5 + 0.5);
      float goldMask = clamp(fresnel * 0.85 + pointerGlow * 0.45 + 0.15, 0.0, 1.0);
      vec3 goldTier = mix(img, gold, goldMask * 0.6);
      goldTier += gold * (fresnel * 0.45 + spec * 0.6);

      // --- blend by weight so a finish change morphs instead of cutting
      float w0 = max(0.0, 1.0 - abs(uFinish - 0.0));
      float w1 = max(0.0, 1.0 - abs(uFinish - 1.0));
      float w2 = max(0.0, 1.0 - abs(uFinish - 2.0));
      float w3 = max(0.0, 1.0 - abs(uFinish - 3.0));
      float wSum = max(w0 + w1 + w2 + w3, 0.0001);
      vec3 tinted = (baseTier * w0 + holoTier * w1 + iceTier * w2 + goldTier * w3) / wSum;

      vec3 col = mix(img, tinted, uIntensity);

      // Vignette + micro scratches (kept subtle to avoid moiré)
      float vignette = 1.0 - smoothstep(0.5, 1.2, length(vUv - 0.5) * 1.5);
      col *= 0.88 + vignette * 0.12;
      col *= sin(vUv.y * 420.0) * 0.015 + 0.985;

      gl_FragColor = vec4(col, 1.0);

      // Encode for wherever we are: identity when a composer owns the buffer,
      // linear → sRGB when this draws straight to the canvas.
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
  /** true once a real orientation event has landed */
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

  // Rotate the raw device tilt into screen space so landscape holds up too.
  const angle = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle ?? 0 : 0;
  const rad = (angle * Math.PI) / 180;
  const b = beta ?? 0;
  const g = gamma ?? 0;
  const x = g * Math.cos(rad) + b * Math.sin(rad);
  const y = -g * Math.sin(rad) + b * Math.cos(rad);

  tiltState.x = clamp01(0.5 + x / 70); // ±35° of roll → full width
  tiltState.y = clamp01((y - 25) / 60); // flat-ish → bottom of the card, upright → top
  tiltState.active = true;
}

function bindOrientation() {
  if (orientationBound || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
  orientationBound = true;
  window.addEventListener('deviceorientation', onDeviceOrientation, true);
}

/**
 * iOS 13+ gates motion sensors behind an explicit prompt that has to run inside
 * a user gesture. Everywhere else this just starts listening.
 */
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

/** Ask on the first tap — the same gesture the page already uses to wake audio. */
function bindFirstGesture() {
  if (gestureBound || typeof window === 'undefined') return;
  gestureBound = true;
  const onGesture = () => {
    window.removeEventListener('pointerdown', onGesture, true);
    requestDeviceTilt();
  };
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
}

/** The shared, mutable tilt reading. Read it in a frame loop, not in render. */
export function useDeviceTilt(): DeviceTiltState {
  useEffect(() => {
    bindOrientation();
    bindFirstGesture();
  }, []);
  return tiltState;
}

/* ------------------------------------------------------------------ *
 * Pointer binding — R3F's onPointerMove + e.uv, so the glow tracks the
 * cursor on the card instead of the whole window.
 * ------------------------------------------------------------------ */

export interface CardPointer {
  /** live hover point in card UV space (mutated in place, no re-render) */
  pointer: THREE.Vector2;
  hovered: boolean;
  bind: {
    onPointerMove: (event: ThreeEvent<PointerEvent>) => void;
    onPointerEnter: (event: ThreeEvent<PointerEvent>) => void;
    onPointerLeave: (event: ThreeEvent<PointerEvent>) => void;
  };
}

export function useCardPointer(): CardPointer {
  const pointer = useMemo(() => new THREE.Vector2(0.5, 0.5), []);
  const [hovered, setHovered] = useState(false);
  const setHover = useCallback((next: boolean) => setHovered(next), []);

  const bind = useMemo(
    () => ({
      onPointerMove: (event: ThreeEvent<PointerEvent>) => {
        if (!event.uv) return;
        event.stopPropagation();
        pointer.set(event.uv.x, event.uv.y);
      },
      onPointerEnter: (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        setHover(true);
      },
      onPointerLeave: () => setHover(false),
    }),
    [pointer, setHover]
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
  /** damped target for the foil highlight, in card UV space */
  pointer?: THREE.Vector2 | null;
  hovered?: boolean;
  /** baseline strength; `hoverBoost` multiplies it while hovered */
  intensity?: number;
  hoverBoost?: number;
  /** card face width / height — match the geometry so the crop is right */
  cardAspect?: number;
  /** phase offset so cards don't animate in lockstep */
  timeOffset?: number;
}

export function HoloCardMaterial({
  image = null,
  finish = 'base',
  pointer = null,
  hovered = false,
  intensity = 1,
  hoverBoost = 1.4,
  cardAspect = 0.75,
  timeOffset = 0,
}: HoloCardMaterialProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const gl = useThree((state) => state.gl);
  const tilt = useDeviceTilt();

  const coarsePointer = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    []
  );

  // Damped, per-instance state. `useRef` initialisers only run once, so the
  // first finish/intensity is applied instantly and later ones animate.
  const anim = useRef({
    pointer: new THREE.Vector2(0.5, 0.5),
    finish: FINISH_INDEX[finish],
    intensity,
  });

  const imageAspect = useMemo(() => textureAspect(image), [image]);

  // sRGB decode + filtering: the pit used to skip this and looked different
  // from the Forge even with identical art.
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
    material.uniforms.uImage.value = image;
    material.uniforms.uImageAspect.value = textureAspect(image);
    material.uniforms.uCardAspect.value = cardAspect;
  }, [image, cardAspect]);

  useFrame((state, rawDelta) => {
    const material = materialRef.current;
    if (!material) return;

    const a = anim.current;
    const delta = Math.min(rawDelta, 1 / 30); // clamp so a tab hitch can't pop the damping
    const u = material.uniforms;

    // textures can arrive after the layout effect (suspense / uploads)
    if (u.uImage.value !== image) {
      u.uImage.value = image;
      u.uImageAspect.value = imageAspect;
    }
    u.uCardAspect.value = cardAspect;

    // Phones have no pointer: fall back to the gyro, then to centre.
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
