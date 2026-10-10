'use client';

import * as THREE from 'three';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { shaderMaterial } from '@react-three/drei';
import { applyProps, extend, useFrame, useThree, type ThreeElement, type ThreeEvent } from '@react-three/fiber';
import type { PaletteDriver } from '@/components/canvas/slab/slabPalette';

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
    /* Dynamic palette: the foil's diffraction orders, the ice tint and the
     * gold pair. Defaults are the hand-tuned constants; a palette driver
     * writes the derived family in here every frame. The ramp's FIRST stop
     * stays the brand orange in the shader — the logo accent is a constant
     * anchor across every palette. Values are LINEAR light, matching how the
     * constants were authored. */
    uFoilB: new THREE.Vector3(0.32, 0.78, 0.92),
    uFoilC: new THREE.Vector3(1.0, 0.82, 0.34),
    uFoilD: new THREE.Vector3(0.92, 0.35, 0.72),
    uIce: new THREE.Vector3(0.78, 0.88, 1.0),
    uGoldA: new THREE.Vector3(1.0, 0.86, 0.36),
    uGoldB: new THREE.Vector3(0.62, 0.42, 0.09),
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
    uniform vec3 uFoilB;
    uniform vec3 uFoilC;
    uniform vec3 uFoilD;
    uniform vec3 uIce;
    uniform vec3 uGoldA;
    uniform vec3 uGoldB;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    float hash21(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    vec2 hash22(vec2 p) {
      float n = hash21(p);
      return vec2(hash21(p + n + 1.71), hash21(p + n * 2.31 + 5.13));
    }

    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    /** push hard away from luma: the references are saturated, HDR foil */
    vec3 vivid(vec3 c) {
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return max(mix(vec3(l), c, 3.0), 0.0);
    }

    /**
     * Saturated confetti stops: aqua, lime, yellow, golden orange, magenta,
     * pink, blue and a clear shard - derived from the palette uniforms.
     */
    vec3 foilStop(float t) {
      float hs = floor(fract(t) * 8.0);
      vec3 cLime = vivid(mix(uFoilB, uFoilC, 0.5));
      vec3 cGold = vivid(mix(vec3(1.0, 0.48, 0.22), uGoldA, 0.5));
      vec3 cPink = mix(vivid(uFoilD), vec3(1.0), 0.45);
      vec3 cBlue = vivid(mix(uFoilB, vec3(0.10, 0.25, 1.0), 0.55));
      return (hs < 1.0) ? vivid(uFoilB)
           : (hs < 2.0) ? cLime
           : (hs < 3.0) ? vivid(uFoilC)
           : (hs < 4.0) ? cGold
           : (hs < 5.0) ? vivid(uFoilD)
           : (hs < 6.0) ? cPink
           : (hs < 7.0) ? cBlue
           :              vec3(0.90, 0.88, 0.95);
    }

    /** cracked-ice tints: white, pale pink, lavender, cyan, clear */
    vec3 iceStop(float t) {
      float hs = floor(fract(t) * 5.0);
      vec3 cPink = mix(vivid(uFoilD), vec3(1.0), 0.55);
      vec3 cLav = mix(vivid(mix(uFoilD, uFoilB, 0.5)), vec3(1.0), 0.45);
      vec3 cCyan = mix(vivid(uFoilB), vec3(1.0), 0.35);
      return (hs < 1.0) ? vec3(1.0)
           : (hs < 2.0) ? cPink
           : (hs < 3.0) ? cLav
           : (hs < 4.0) ? cCyan
           :              vec3(0.85, 0.92, 1.0);
    }

    /** holo band spectrum, blue at the bottom edge to red at the top */
    vec3 bandRamp(float t) {
      vec3 cBlue = vivid(mix(uFoilB, vec3(0.10, 0.25, 1.0), 0.55));
      vec3 cTeal = vivid(uFoilB);
      vec3 cGreen = vivid(mix(uFoilC, uFoilB, 0.5));
      vec3 cYellow = vivid(uFoilC);
      vec3 cOrange = vec3(1.0, 0.48, 0.22);
      vec3 cRed = mix(vivid(uFoilD), vec3(0.95, 0.08, 0.10), 0.75);
      vec3 c = mix(cBlue, cTeal, smoothstep(0.00, 0.20, t));
      c = mix(c, cGreen, smoothstep(0.20, 0.45, t));
      c = mix(c, cYellow, smoothstep(0.45, 0.65, t));
      c = mix(c, cOrange, smoothstep(0.65, 0.82, t));
      c = mix(c, cRed, smoothstep(0.82, 1.00, t));
      return c;
    }

    /** fine foil dot-matrix over the whole face; .rgb tint, .a sparkle */
    vec4 dotSparkle(vec2 uv, float phase) {
      vec2 g = uv * vec2(120.0, 170.0);
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      vec2 jr = hash22(id) - 0.5;
      float d = length(f - jr * 0.35);
      float shape = 1.0 - smoothstep(0.20, 0.46, d);
      float h1 = hash21(id);
      float h2 = hash21(id + 7.31);
      float tw = 0.5 + 0.5 * sin(phase * 2.0 + h1 * 6.2831);
      float spark = shape * (0.06 + 0.94 * h2 * h2 * (0.30 + 0.70 * tw));
      float tinted = step(0.74, h1);
      vec3 tint = mix(vec3(1.0), foilStop(h2 + phase * 0.05), tinted * 0.85);
      return vec4(tint, spark);
    }

    /** scattered hot sparkle points (orange/white), HDR so they bloom */
    vec3 glintPoints(vec2 uv, float time) {
      vec2 g = uv * vec2(90.0, 130.0);
      vec2 id = floor(g);
      float h = hash21(id + 3.7);
      float on = step(0.985, h);
      float tw = 0.5 + 0.5 * sin(time * 2.6 + h * 40.0);
      float d = length(fract(g) - 0.5);
      float dot = 1.0 - smoothstep(0.10, 0.40, d);
      vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0), step(0.5, hash21(id + 8.2)));
      return col * on * dot * (0.5 + 2.3 * tw);
    }

    /**
     * Angular foil shards: per cell a convex triangle from three hashed
     * half-planes. pal 0 = saturated foil stops (gold), 1 = pastel ice stops.
     * Opacity varies per shard and some read fully clear; edge returns a thin
     * bright outline for the glassy read. .rgb colour, .a coverage.
     */
    vec4 shardField(vec2 uv, float cells, float phase, float density,
                    float soft, float pal, out float edge) {
      vec2 g = uv * vec2(cells * 0.72, cells);
      vec2 id = floor(g);
      vec2 f = fract(g);
      float r = hash21(id + 1.7);
      float tri = 1.0;
      float e = 0.0;
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float a = 6.2831 * hash21(id + fk * 3.71 + 9.2);
        vec2 nrm = vec2(cos(a), sin(a));
        float off = mix(-0.15, 0.55, hash21(id + fk * 9.13 + 4.7));
        float cut = 1.0 - smoothstep(0.0, max(soft, 0.02), dot(f - 0.5, nrm) - off);
        e = max(e, cut * (1.0 - cut) * 4.0);
        tri *= cut;
      }
      float present = step(1.0 - density, hash21(id + 3.3));
      float lit = 0.75 + 0.25 * sin(phase * 1.6 + r * 6.2831);
      float h = hash21(id + 6.1);
      vec3 col = (pal < 0.5) ? foilStop(h + phase * 0.04) : iceStop(h);
      float opac = mix(0.45, 1.0, hash21(id + 12.7));
      edge = e * present * smoothstep(0.0, 0.3, tri);
      return vec4(col * lit, tri * present * opac * (0.65 + 0.30 * lit));
    }

    /** fine tone-on-tone facet mosaic for the ice base layer */
    vec4 iceFacets(vec2 uv) {
      vec2 g = uv * vec2(16.0, 22.0);
      vec2 id = floor(g);
      vec2 f = fract(g);
      float dg = step(0.5, hash21(id + 4.7));
      float sMain = mix(f.x - f.y, f.x + f.y - 1.0, dg);
      vec2 fid = id * 2.0 + step(0.0, sMain);
      vec2 g2 = uv.yx * vec2(9.0, 12.5) + 0.31;
      vec2 id2 = floor(g2);
      vec2 f2 = fract(g2);
      float dg2 = step(0.5, hash21(id2 + 8.1));
      float s2 = mix(f2.x - f2.y, f2.x + f2.y - 1.0, dg2);
      vec2 fid2 = id2 * 2.0 + step(0.0, s2);
      float lum = mix(hash21(fid), hash21(fid2 + 11.3), 0.45);
      return vec4(lum, 0.0, hash21(fid + 2.17), 1.0);
    }

    // Cover-fit: crop the source rather than squashing it into the card face.
    vec2 coverUv(vec2 uv, float imageAspect, float cardAspect) {
      float ratio = imageAspect / max(cardAspect, 0.0001);
      vec2 scale = ratio > 1.0 ? vec2(1.0 / ratio, 1.0) : vec2(1.0, ratio);
      return (uv - 0.5) * scale + 0.5;
    }

    void main() {
      vec3 n = normalize(vNormal);
      vec3 v = normalize(vViewDir);
      vec3 img = texture2D(uImage, coverUv(vUv, uImageAspect, uCardAspect)).rgb;

      float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
      vec3 lightDir = normalize(vec3(0.35, 0.6, 0.72));
      vec3 halfVec = normalize(lightDir + v);
      float ndh = clamp(dot(n, halfVec), 0.0, 1.0);
      float spec = pow(ndh, 34.0);
      float hot = pow(ndh, 90.0); // specular hotspot: the photo's blown core
      float viewShift = (1.0 - abs(dot(n, v))) * 0.6 + spec * 0.5;

      vec2 pointer = uPointer;
      float dist = distance(vUv, pointer);
      float pointerGlow = 1.0 - smoothstep(0.0, 0.75, dist);

      // shared phase; uPointer is damped CPU-side so drags glide
      float phase = viewShift * 2.0
                  + (pointer.x - 0.5) * 1.35
                  + (pointer.y - 0.5) * 0.55
                  + uTime * 0.05;

      /* ---- per-finish blend weights ---- */
      float w0 = max(0.0, 1.0 - abs(uFinish - 0.0));
      float w1 = max(0.0, 1.0 - abs(uFinish - 1.0));
      float w2 = max(0.0, 1.0 - abs(uFinish - 2.0));
      float w3 = max(0.0, 1.0 - abs(uFinish - 3.0));
      float wSum = max(w0 + w1 + w2 + w3, 0.0001);

      /* ---- holo: a liquid spectral band that rides the light ----
       * Position and width are relative to the view angle and the pointer -
       * the photo simply caught one lighting state. Outside the band the face
       * carries the glitter dot-matrix and hot sparkle points. */
      float bx = 0.62 + (pointer.x - 0.5) * 1.4
               + (viewShift - 0.20) * 2.5 + sin(uTime * 0.07) * 0.06;
      float bw = 0.12 + 0.16 * (0.5 + 0.5 * sin(uTime * 0.11 + pointer.y * 2.4 + 1.3));
      float ripple = sin(vUv.y * 24.0 + uTime * 0.35) * 0.5
                   + sin(vUv.y * 53.0 - uTime * 0.27 + 1.7) * 0.3
                   + sin(vUv.x * 41.0 + uTime * 0.21) * 0.2;
      float bxp = vUv.x + ripple * 0.012;
      float band = smoothstep(bx - bw, bx - bw * 0.35, bxp)
                 * (1.0 - smoothstep(bx + bw * 0.35, bx + bw, bxp));
      float micro = 0.75 + 0.25 * sin(vUv.y * 140.0
                    + sin(vUv.x * 90.0 + uTime * 0.4) * 3.0);
      vec3 bandCol = bandRamp(clamp(vUv.y + 0.05 * ripple, 0.0, 1.0));
      vec4 sp = dotSparkle(vUv, phase * 3.0 + pointerGlow * 1.2);
      vec3 pts = glintPoints(vUv, uTime);
      vec3 holoSrc = bandCol * band * (0.95 + 0.45 * micro)
                   + sp.rgb * sp.a * (0.25 + 1.10 * band)
                   + pts * (0.35 + 0.75 * band)
                   + vec3(1.3) * hot * 0.8;
      float holoStr = clamp(band * (0.95 + 0.30 * micro) + sp.a * (0.12 + 0.30 * band)
                          + dot(pts, vec3(0.333)) * 0.30 + fresnel * 0.10
                          + hot * 0.7, 0.0, 1.8);

      /* ---- cracked ice: glassy pastel shards over a fine facet sheen ---- */
      vec4 fc = iceFacets(vUv);
      float facetLum = (fc.x - 0.35) * 0.35;
      float eA; vec4 sA = shardField(vUv, 6.0, phase * 0.9 + 2.0, 0.50, 0.02, 1.0, eA);
      float eB; vec4 sB = shardField(vUv + 0.23, 16.0, phase * 1.2 + 5.0, 0.60, 0.02, 1.0, eB);
      vec3 iceSrc = vec3(0.16) * (0.30 + max(facetLum, -0.10))
                  + sA.rgb * sA.a * 0.80 + sB.rgb * sB.a * 0.70
                  + vec3(0.90, 0.95, 1.0) * (eA * 0.35 + eB * 0.25)
                  + uIce * fresnel * 0.10 + vec3(1.2) * hot * 0.4;
      float iceStr = clamp(0.06 + max(facetLum, 0.0) * 0.50 + sA.a * 0.70 + sB.a * 0.60
                         + (eA + eB) * 0.25 + fresnel * 0.10 + hot * 0.4, 0.0, 1.2);

      /* ---- gold: cracked ice pushed hard - clustered vivid shards ---- */
      float cluster = smoothstep(0.25, 0.75, noise(vUv * 3.5 + 1.7));
      float e1; vec4 g1 = shardField(vUv, 6.0, phase, 0.55 + 0.45 * cluster, 0.02, 0.0, e1);
      float e2; vec4 g2 = shardField(vUv + 0.31, 12.0, phase * 1.15 + 3.1,
                                     0.55 + 0.45 * cluster, 0.02, 0.0, e2);
      g1.rgb *= 1.35;
      g2.rgb *= 1.30;
      g1.a *= 0.95;
      g2.a *= 0.85;
      float cov = 1.0 - (1.0 - g1.a) * (1.0 - g2.a);
      vec3 shardCol = (g1.rgb * g1.a + g2.rgb * g2.a) / max(cov, 0.0001);
      vec3 warm = mix(uGoldB, uGoldA,
                      0.5 + 0.5 * sin(vUv.y * 3.0 + uTime * 0.2 + viewShift * 5.0));
      vec3 gpts = glintPoints(vUv, uTime);
      vec3 goldSrc = shardCol * cov
                   + vec3(0.90, 0.95, 1.0) * (e1 * 0.30 + e2 * 0.25)
                   + gpts * 0.5
                   + vec3(1.4) * hot * 0.9 + warm * 0.05;
      float goldStr = clamp(cov + (e1 + e2) * 0.20 + dot(gpts, vec3(0.333)) * 0.20
                          + hot * 0.7 + fresnel * 0.06, 0.0, 1.6);

      /* ---- base: the card's own ink, barely lifted ---- */
      vec3 baseSrc = vec3(0.02);
      float baseStr = 0.02 + fresnel * 0.04;

      // The foil is a lit laminate: its tints are emissive-bright (values
      // above 1 blow to white after encoding) so compositing only ever
      // brightens the print beneath - the references never darken it.
      vec3 src = (baseSrc * baseStr * w0 + holoSrc * holoStr * w1 +
                  iceSrc * iceStr * w2 + goldSrc * goldStr * w3) / wSum;
      float str = (baseStr * w0 + holoStr * w1 + iceStr * w2 + goldStr * w3) / wSum;
      vec3 tint = min(src / max(str, 0.0001), vec3(2.2));
      float alpha = clamp(str, 0.0, 0.96) * uIntensity;

      if (uMode > 0.5) {
        /* ---- foil overlay, laminated over the whole face ---- */
        gl_FragColor = vec4(tint, alpha);
      } else {
        /* ---- base: the art itself, with the foil laminated on ---- */
        vec3 col = mix(img, tint, alpha);
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
  /** dynamic palette driver: the foil's orders/tints follow the artwork */
  palette?: PaletteDriver | null;
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
  palette = null,
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
    material.transparent = overlay;
    material.depthWrite = !overlay;
    // the printed face is unlit and untonemapped; the foil must match that
    // pipeline or ACES greys its hues - raw sRGB keeps the foil vivid and
    // lets hotspots blow to white like the reference photos.
    material.toneMapped = !overlay;
    material.blending = THREE.NormalBlending;
    material.needsUpdate = true;
  }, [image, cardAspect, overlay, mask, maskFeather, outside]);

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

    /* the palette glides in the engine; the shader just tracks it */
    if (palette) {
      const sh = palette.current.shader;
      u.uFoilB.value.set(sh.foilB[0], sh.foilB[1], sh.foilB[2]);
      u.uFoilC.value.set(sh.foilC[0], sh.foilC[1], sh.foilC[2]);
      u.uFoilD.value.set(sh.foilD[0], sh.foilD[1], sh.foilD[2]);
      u.uIce.value.set(sh.ice[0], sh.ice[1], sh.ice[2]);
      u.uGoldA.value.set(sh.goldA[0], sh.goldA[1], sh.goldA[2]);
      u.uGoldB.value.set(sh.goldB[0], sh.goldB[1], sh.goldB[2]);
    }
  });

  return <holoShaderMaterial ref={materialRef} />;
}

export { HoloShaderMaterial };
