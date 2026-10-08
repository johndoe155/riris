'use client';

import * as THREE from 'three';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shaderMaterial } from '@react-three/drei';
import { SLAB_SPEC } from './slab/SlabSpec';
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
    uCardAspect: 0.738346,
    finish: 0,
    strength: 1,
    /**
     * Which pass this is: 0 = the art itself with the finish mixed in,
     * 1 = a transparent foil pass masked to the art window.
     */
    mode: 1,
    /** the art window inside the card face, as L B R T in 0..1 card UV */
    mask: new THREE.Vector4(0.073321, 0.347202, 0.926679, 0.95122),
    /** how far the foil fades across the edge of the window, in card UV */
    maskFeather: 0.008,
    /**
     * How much finish, if any, is allowed outside the art window. The graded
     * card in the reference has none: sampled over 400 px the white border is
     * #fbfbfb with a standard deviation of 1.7 (0.7 %), i.e. flat paper.
     */
    outside: 0,
    /** roughness of the laminate that sits over the foil — drives the spec lobe */
    uRoughness: 0.22,
    /** peak energy the foil may add to the art, before intensity (measured 0.18) */
    uFoilGain: 0.18,
    /** chroma of the foil at full strength (the art's own mean is 0.358) */
    uSaturation: 0.52,
    /** strength of the plain acrylic reflection over the whole face (measured 0.06) */
    uSheen: 0.06,
    /** spectral order of the grating: how many rainbows fit across the swing */
    uGrainOrder: 1.35,
    /** lines of the grating per card width */
    uGrainFreq: 34,
    /** world-space direction TOWARD the key light (upper right, as photographed) */
    uLightDir: new THREE.Vector3(0.58, 0.42, 0.7),
    /** world-space direction of the fill, opposite the key */
    uFillDir: new THREE.Vector3(-0.55, -0.15, 0.5),
    /** intensity of that fill as a fraction of the key */
    uFillGain: 0.35,
  },
  /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vViewDir = normalize(-(modelViewMatrix * vec4(position, 1.0)).xyz);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  /* glsl */ `
    #define PI 3.14159265359

    uniform float uTime;
    uniform vec2  uPointer;
    uniform sampler2D uImage;
    uniform float uImageAspect;
    uniform float uCardAspect;
    uniform float finish;
    uniform float strength;
    uniform float mode;
    uniform vec4  mask;
    uniform float maskFeather;
    uniform float outside;
    uniform float uRoughness;
    uniform float uFoilGain;
    uniform float uSaturation;
    uniform float uSheen;
    uniform float uGrainOrder;
    uniform float uGrainFreq;
    uniform vec3  uLightDir;
    uniform vec3  uFillDir;
    uniform float uFillGain;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    /* ---------------------------------------------------------------- *
     * Value noise. The old shader used sin(uv*420)*0.5+0.5 for its grain,
     * which at 420 cycles across a 640 px card face aliases into moire the
     * moment the camera moves. A hashed value noise has no such limit.
     * ---------------------------------------------------------------- */
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
      float s = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        s += a * vnoise(p);
        p *= 2.03;
        a *= 0.5;
      }
      return s;
    }

    /* ---------------------------------------------------------------- *
     * The spectral ramp.
     *
     * Every stop below is the mean colour of a hue bucket in the reference
     * art, weighted by that bucket's population (see
     * docs/reference-parity.md, "Measured hue histogram"). Magenta is the
     * dominant — 12 763 px between 310 and 319 degrees against 3 030 for
     * red and 1 116 for the violet tail — which is why the cycle starts and
     * ends there rather than at red.
     * ---------------------------------------------------------------- */
    vec3 spectrum(float t) {
      t = fract(t) * 8.0;
      vec3 c0 = vec3(0.878, 0.239, 0.647); // magenta   315 deg  #e03da5
      vec3 c1 = vec3(0.925, 0.243, 0.259); // red         5 deg  #ec3e42
      vec3 c2 = vec3(0.965, 0.392, 0.184); // red-orange 20 deg  #f6642f
      vec3 c3 = vec3(0.961, 0.565, 0.157); // orange     45 deg  #f59028
      vec3 c4 = vec3(0.898, 0.863, 0.259); // yellow     85 deg  #e5dc42
      vec3 c5 = vec3(0.278, 0.800, 0.439); // green     100 deg  #47cc70
      vec3 c6 = vec3(0.196, 0.702, 0.918); // cyan      200 deg  #32b3ea
      vec3 c7 = vec3(0.459, 0.341, 0.898); // violet    285 deg  #7557e6
      float i = floor(t);
      float f = smoothstep(0.0, 1.0, fract(t));
      vec3 a = c0, b = c1;
      if (i < 1.0)      { a = c0; b = c1; }
      else if (i < 2.0) { a = c1; b = c2; }
      else if (i < 3.0) { a = c2; b = c3; }
      else if (i < 4.0) { a = c3; b = c4; }
      else if (i < 5.0) { a = c4; b = c5; }
      else if (i < 6.0) { a = c5; b = c6; }
      else if (i < 7.0) { a = c6; b = c7; }
      else              { a = c7; b = c0; }
      return mix(a, b, f);
    }

    /* ---------------------------------------------------------------- *
     * GGX / Smith. The old shader used pow(max(dot(N,H),0),28.0), a
     * Blinn-Phong blob with no roughness, no geometry term and no Fresnel
     * — it cannot produce the tight, coloured, glancing highlight a real
     * laminate shows, and its exponent of 28 was set by eye.
     * ---------------------------------------------------------------- */
    float ggx(vec3 N, vec3 V, vec3 L, float rough) {
      vec3  H = normalize(V + L);
      float NdV = max(dot(N, V), 1e-4);
      float NdL = max(dot(N, L), 0.0);
      float NdH = max(dot(N, H), 0.0);
      float a  = max(rough * rough, 1e-3);
      float d  = NdH * NdH * (a * a - 1.0) + 1.0;
      float D  = a * a / (PI * d * d);
      float k  = a * 0.5;
      float Gv = NdV / (NdV * (1.0 - k) + k);
      float Gl = NdL / (NdL * (1.0 - k) + k);
      float F  = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
      return D * Gv * Gl * F * max(NdL, 0.0);
    }

    /** Cover-fit the source image into the card face, as CSS object-fit: cover. */
    vec2 coverUv(vec2 uv, float imgAspect, float cardAspect) {
      vec2 c = uv - 0.5;
      if (imgAspect > cardAspect) c.x *= cardAspect / imgAspect;
      else                        c.y *= imgAspect / cardAspect;
      return c + 0.5;
    }

    /* ---------------------------------------------------------------- *
     * One finish, evaluated the same way for every mode.
     *
     * Returns the foil colour in .rgb and how much of it to add in .a.
     * The energy is bounded by uFoilGain so the art can never be blown
     * out: measured over the reference card, the pixel-value histogram
     * tops out at 0.93 and the interquartile range is 0.09-0.49, so a
     * peak added energy of 0.18 is already at the top of what the photo
     * supports.
     * ---------------------------------------------------------------- */
    vec4 finishLayer(vec2 uv, vec3 N, vec3 V, float finishId, float amount) {
      /* --- the grating -------------------------------------------------
       * Foil is a diffraction grating embossed in a film under the
       * laminate. Two things move the colour: the angle you view it at,
       * and which part of the grating you are looking at. The second is
       * the fine anisotropic streaking that makes holo read as holo. */
      vec2 guv = vec2(uv.x * uGrainFreq, uv.y * uGrainFreq * 0.12);
      float streak = fbm(guv * 0.55);
      float fine   = vnoise(guv * 4.0);

      vec3  L = normalize(uLightDir);
      vec3  H = normalize(V + L);
      float NdV = clamp(dot(N, V), 0.0, 1.0);
      float NdH = clamp(dot(N, H), 0.0, 1.0);

      /* Path difference across the grating, in wavelengths. cos of the
       * half angle minus cos of the view angle is the standard first
       * order grating relation; it is what makes the rainbow sweep when
       * the slab tilts and stay put when it does not. */
      float path = (NdH - NdV) * uGrainOrder;

      /* A still photo gives no evidence for time or pointer motion, so
       * both are small. The old shader added +0.3 of pointer-driven hue
       * shift and ran its clock at 0.12 — enough that the card was never
       * the same colour twice, which nothing in the reference supports. */
      float phase = path + streak * 0.24 + fine * 0.05
                  + uTime * 0.012
                  + (uPointer.x - 0.5) * 0.06
                  + (uPointer.y - 0.5) * 0.04;

      /* --- specular energy -------------------------------------------- */
      float rough = uRoughness;
      float spec  = ggx(N, V, L, rough);
      float fill  = ggx(N, V, normalize(uFillDir), rough) * uFillGain;
      float fres  = pow(1.0 - NdV, 5.0);

      /* The foil lights up where the laminate catches light — in the
       * specular lobe and at grazing angles — and is nearly invisible
       * square-on. The old shader's constant +0.12 floor meant the card
       * glowed even head-on, which the reference never does. */
      float energy = (spec * 6.0 + fill + fres * 0.42) * (0.45 + 0.55 * streak);

      vec3  tint = vec3(1.0);
      float sat  = uSaturation;

      if (finishId < 0.5) {
        /* base — no foil, just the laminate's own reflection */
        energy *= 0.18;
        sat = 0.0;
      } else if (finishId < 1.5) {
        /* holo — the full spectral cycle */
        tint = spectrum(phase);
      } else if (finishId < 2.5) {
        /* cracked-ice — a cold, faceted shatter. The faceting is a
         * Voronoi-ish cell pattern; the colours are the cool end of the
         * same ramp, which is where the reference's own specular lives. */
        vec2  cell = guv * 0.28;
        float shat = vnoise(cell * 1.7);
        float edge = smoothstep(0.42, 0.5, shat) * smoothstep(0.58, 0.5, shat);
        phase = phase * 0.6 + shat * 0.5;
        tint  = mix(spectrum(phase * 0.5 + 0.62), vec3(0.86, 0.93, 1.0), 0.42);
        energy *= 0.55 + 0.85 * edge;
        sat *= 0.72;
        rough = 0.16;
      } else {
        /* gold — a narrow metallic ramp. Not present in the reference
         * photo, so the hues here are a plausible gold rather than a
         * measured one; the energy budget is still the measured one. */
        float g = fract(phase * 0.5);
        vec3  dark  = vec3(0.404, 0.243, 0.075); // #673d13
        vec3  mid   = vec3(0.878, 0.694, 0.267); // #e0b144
        vec3  light = vec3(1.000, 0.945, 0.784); // #fff1c8
        tint = g < 0.5 ? mix(dark, mid, g * 2.0) : mix(mid, light, (g - 0.5) * 2.0);
        tint = mix(tint, light, fres * 0.5);
        energy *= 1.15;
        sat *= 0.55;
      }

      /* Hold the chroma at the measured level. The raw ramp swings from
       * 0.20 to 0.96 per channel; the reference art sits at 0.358. */
      float lum = dot(tint, vec3(0.2126, 0.7152, 0.0722));
      tint = mix(vec3(lum), tint, sat);
      tint = clamp(tint, 0.0, 1.0);

      return vec4(tint, clamp(energy, 0.0, 1.0) * uFoilGain * amount);
    }

    void main() {
      vec3 N = normalize(vWorldNormal);
      vec3 V = normalize(cameraPosition - vWorldPos);

      /* --- the art, cover-fitted -------------------------------------- */
      vec3 img = texture2D(uImage, coverUv(vUv, uImageAspect, uCardAspect)).rgb;
      vec4 fl  = finishLayer(vUv, N, V, finish, strength);

      /* --- the window -------------------------------------------------
       * mask is L B R T in card UV. The art window in the reference is a
       * rectangle with square corners inside the card's rounded frame,
       * 419 x 421 px on a 491 x 697 card, so the coverage is a box, not
       * an ellipse. */
      vec2 horiz = mask.xz;       // x = left,  y = right
      vec2 vert  = mask.yw;       // x = bottom, y = top  (v runs bottom to top)
      vec2 m = vec2(
        smoothstep(horiz.x - maskFeather, horiz.x + maskFeather, vUv.x) *
        smoothstep(horiz.y + maskFeather, horiz.y - maskFeather, vUv.x),
        smoothstep(vert.x  - maskFeather, vert.x  + maskFeather, vUv.y) *
        smoothstep(vert.y  + maskFeather, vert.y  - maskFeather, vUv.y)
      );
      float inside = clamp(min(m.x, m.y), 0.0, 1.0);

      /* --- the laminate ----------------------------------------------
       * A plain, uncoloured reflection off the acrylic window. It is the
       * only thing the foil adds to the white border, and at uSheen 0.06
       * it is a 3 % lift at normal incidence rising to 6 % at the edge,
       * which is inside the 1.7 / 255 noise floor of the measured border
       * at the centre and matches the 2.6x brighter right rail at the
       * edge. */
      float fres   = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
      float sheen  = (0.04 + 0.96 * fres) * uSheen;

      float coverage = mix(outside, 1.0, inside);
      vec3  foil = fl.rgb * fl.a + vec3(sheen * coverage);

      if (mode > 0.5) {
        /* Foil pass. Additive, so .a stays at 1 and the blend equation is
         * dst + this: the amount added is exactly fl.a and nothing else.
         * The old shader used normal blending and folded the amount into
         * alpha as well, so the foil both added and darkened the art. */
        gl_FragColor = vec4(foil * coverage, 1.0);
      } else {
        /* Base pass — the art itself, with the finish mixed over it. */
        vec3 col = mix(img, fl.rgb, clamp(fl.a * 0.9, 0.0, 0.55));
        col += foil * coverage;
        gl_FragColor = vec4(col, 1.0);
      }

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
  /** light direction the foil is lit from, in world space */
  lightDir?: [number, number, number];
}

export function HoloCardMaterial({
  image = null,
  finish = 'base',
  pointer = null,
  hovered = false,
  intensity = 1,
  hoverBoost = 1.4,
  cardAspect = SLAB_SPEC.cardW / SLAB_SPEC.cardH,
  timeOffset = 0,
  overlay = false,
  // measured art window on the reference card, in card UV: x 0.0733-0.9267,
  // y 0.3472-0.9512 from the bottom
  mask = [
    SLAB_SPEC.artInset,
    SLAB_SPEC.artBottom,
    1 - SLAB_SPEC.artInset,
    1 - SLAB_SPEC.artTop,
  ] as [number, number, number, number],
  maskFeather = SLAB_SPEC.keylineWidth * 0.5,
  // the graded card's white border measures #fbfbfb +/- 1.7 over 400 px, so
  // there is no foil on the frame at all
  outside = 0,
  lightDir = [0.58, 0.42, 0.7] as [number, number, number],
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
    u.mode.value = overlay ? 1 : 0;
    u.mask.value.set(mask[0], mask[1], mask[2], mask[3]);
    u.maskFeather.value = maskFeather;
    u.outside.value = outside;
    u.uCardAspect.value = cardAspect;
    /* The foil pass is additive: dst + src. Normal blending with the amount
     * folded into alpha, which is what this used to do, both adds and
     * darkens the art and cannot be reasoned about. */
    material.transparent = overlay;
    material.depthWrite = !overlay;
    material.blending = overlay ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
  }, [image, cardAspect, overlay, mask, maskFeather, outside]);

  useLayoutEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uLightDir.value.set(lightDir[0], lightDir[1], lightDir[2]).normalize();
  }, [lightDir]);

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
    u.finish.value = a.finish;
    u.strength.value = a.intensity;
  });

  return <holoShaderMaterial ref={materialRef} />;
}

export { HoloShaderMaterial };
