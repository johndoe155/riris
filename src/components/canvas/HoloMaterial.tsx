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

    /** The foil diffraction order runs DOWN the reflection: red, amber,
     * yellow, green, then a very short cyan/blue tail. y is bottom-up UV. */
    vec3 bandRamp(float y) {
      vec3 blue = vivid(mix(uFoilB, vec3(0.10, 0.35, 1.0), 0.48));
      vec3 green = vivid(mix(uFoilB, vec3(0.16, 1.0, 0.12), 0.72));
      vec3 yellow = vivid(mix(uFoilC, vec3(1.0, 0.95, 0.08), 0.58));
      vec3 c = mix(blue, green, smoothstep(0.10, 0.24, y));
      c = mix(c, yellow, smoothstep(0.38, 0.59, y));
      c = mix(c, vec3(1.0, 0.38, 0.07), smoothstep(0.60, 0.77, y));
      return mix(c, vec3(1.25, 0.025, 0.055), smoothstep(0.76, 0.90, y));
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
      float spark = shape * (0.03 + 0.97 * h2 * h2 * (0.25 + 0.75 * tw));
      float tinted = step(0.74, h1);
      vec3 tint = mix(vec3(1.0), foilStop(h2 + phase * 0.05), tinted * 0.85);
      return vec4(tint, spark);
    }

    /** scattered hot sparkle points (orange/white), HDR so they bloom */
    vec3 glintPoints(vec2 uv, float time, float thresh) {
      vec2 g = uv * vec2(90.0, 130.0);
      vec2 id = floor(g);
      float h = hash21(id + 3.7);
      float on = step(thresh, h);
      float tw = 0.5 + 0.5 * sin(time * 2.6 + h * 40.0);
      float d = length(fract(g) - 0.5);
      float dot = 1.0 - smoothstep(0.10, 0.40, d);
      vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0), step(0.5, hash21(id + 8.2)));
      return col * on * dot * (0.5 + 2.3 * tw);
    }

    // A triangle wholly inside its cell, never a disc or a radial fade.
    // Three line distances give crisp AA coverage and a narrow internal rim.
    vec4 goldShards(vec2 uv, float cells, float density, vec3 lightDir,
                    out float edge) {
      vec2 g = uv * vec2(cells * 0.73, cells);
      vec2 id = floor(g);
      vec2 f = fract(g);
      float h = hash21(id + 6.1);
      float angle = 6.2831853 * hash21(id + 1.7);
      vec2 center = 0.5 + (hash22(id + 2.9) - 0.5) * 0.18;
      float radius = mix(0.44, 0.63, hash21(id + 9.3));
      vec2 a = clamp(center + radius * vec2(cos(angle), sin(angle)), 0.04, 0.96);
      vec2 b = clamp(center + radius * vec2(cos(angle + 2.05), sin(angle + 2.05)), 0.04, 0.96);
      vec2 c = clamp(center + radius * vec2(cos(angle + 4.25), sin(angle + 4.25)), 0.04, 0.96);
      float d0 = ((b.x-a.x)*(f.y-a.y) - (b.y-a.y)*(f.x-a.x)) / length(b-a);
      float d1 = ((c.x-b.x)*(f.y-b.y) - (c.y-b.y)*(f.x-b.x)) / length(c-b);
      float d2 = ((a.x-c.x)*(f.y-c.y) - (a.y-c.y)*(f.x-c.x)) / length(a-c);
      float d = min(d0, min(d1, d2));
      float present = step(1.0 - density, hash21(id + 3.3));
      float cover = smoothstep(-0.012, 0.012, d) * present;
      vec3 nFacet = normalize(vec3((hash22(id + 17.1) - 0.5) * 1.7, 0.65));
      float flash = pow(max(dot(nFacet, lightDir), 0.0), 22.0);
      float grazing = pow(1.0 - max(dot(nFacet, lightDir), 0.0), 2.0);
      // White edge stays inside the polygon, leaving genuine clear gaps.
      edge = cover * (1.0 - smoothstep(0.018, 0.095, d))
           * (0.8 + 1.4 * flash);
      vec3 pink = vivid(mix(uFoilD, vec3(1.0, 0.08, 0.48), 0.55));
      vec3 cyan = vivid(mix(uFoilB, vec3(0.04, 0.93, 1.0), 0.60));
      vec3 lime = vivid(mix(uFoilC, vec3(0.15, 1.0, 0.16), 0.70));
      vec3 amber = vivid(mix(uGoldA, vec3(1.0, 0.40, 0.07), 0.58));
      vec3 col = h < 0.37 ? pink : h < 0.59 ? cyan : h < 0.78 ? lime : amber;
      // Gradual interference across a flat flake, never an olive shadow.
      float grad = clamp(dot(f - center, vec2(cos(angle), sin(angle))) * 0.60 + 0.5, 0.0, 1.0);
      col = mix(col, h < 0.37 ? amber : pink, grad * 0.26);
      col *= 0.95 + 0.25 * grazing;
      col += vec3(2.8) * flash * (0.20 + 0.80 * hash21(id + 5.8));
      float grain = 0.94 + 0.12 * hash21(floor(uv * 430.0) + id);
      return vec4(col * grain, cover * mix(0.48, 0.72, hash21(id + 12.7)));
    }

    // Shared boundaries (including the diagonal) form a continuous sheet of
    // triangular planes, rather than opaque, disconnected polygons. A small
    // smooth warp breaks the square lattice without opening any seams.
    vec4 iceFacets(vec2 uv, vec3 lightDir) {
      vec2 warp = vec2(noise(uv * vec2(5.0, 7.0) + 2.7),
                       noise(uv * vec2(6.0, 4.0) + 14.3)) - 0.5;
      vec2 g = (uv + warp * 0.032) * vec2(13.0, 19.0);
      vec2 id = floor(g);
      vec2 f = fract(g);
      float flip = step(0.5, hash21(id + 4.7));
      float diag = mix(f.x - f.y, f.x + f.y - 1.0, flip);
      vec2 fid = id * 2.0 + step(0.0, diag);
      float h = hash21(fid + 11.3);
      vec3 fn = normalize(vec3((hash22(fid + 6.1) - 0.5) * 1.4, 0.78));
      float lit = dot(fn, lightDir);
      float plane = (h - 0.5) * 0.21 + (lit - 0.5) * 0.25;
      float seam = min(min(f.x, 1.0 - f.x), min(min(f.y, 1.0 - f.y), abs(diag) * 0.7071));
      float ridge = 1.0 - smoothstep(0.006, 0.041, seam);
      float glint = ridge * pow(max(lit, 0.0), 14.0);
      return vec4(plane, ridge, glint, h);
    }

    // Occasional narrow refractive splinters sit on top of the continuous
    // relief. Their low coverage lets even dark ink show through the ice.
    vec4 iceSplinters(vec2 uv, vec3 lightDir, out float edge) {
      vec2 g = uv * vec2(9.0, 14.0) + 0.37;
      vec2 id = floor(g);
      vec2 f = fract(g);
      float angle = hash21(id + 1.7) * 6.2831853;
      mat2 rot = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));
      vec2 q = (f - 0.5) * rot;
      vec2 a = vec2(-0.43, -0.12);
      vec2 b = vec2(0.46, -0.07);
      vec2 c = vec2(-0.10, 0.20);
      float d0 = ((b.x-a.x)*(q.y-a.y) - (b.y-a.y)*(q.x-a.x)) / length(b-a);
      float d1 = ((c.x-b.x)*(q.y-b.y) - (c.y-b.y)*(q.x-b.x)) / length(c-b);
      float d2 = ((a.x-c.x)*(q.y-c.y) - (a.y-c.y)*(q.x-c.x)) / length(a-c);
      float d = min(d0, min(d1, d2));
      float cover = smoothstep(-0.01, 0.01, d) * step(0.50, hash21(id + 3.3));
      float lit = dot(normalize(vec3((hash22(id + 9.1) - 0.5) * 1.4, 0.85)), lightDir);
      edge = cover * (1.0 - smoothstep(0.008, 0.045, d)) * pow(max(lit, 0.0), 9.0);
      vec3 tint = mix(vec3(0.86, 0.94, 1.0), mix(uIce, uFoilD, 0.33), 0.30);
      return vec4(tint * (0.65 + 0.55 * lit), cover * 0.16);
    }

    vec3 srgbEnc(vec3 c) {
      vec3 s = step(vec3(0.0031308), c);
      return mix(c * 12.92, 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055, s);
    }

    vec3 srgbDec(vec3 c) {
      vec3 s = step(vec3(0.04045), c);
      return mix(c / 12.92, pow(max(c + 0.055, vec3(0.0)) / 1.055, vec3(2.4)), s);
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
      // the studio light follows the pointer a little, so dragging sweeps a
      // blown specular bloom across the foil like tilting the real card
      vec3 lightDir = normalize(vec3(0.35 + (uPointer.x - 0.5) * 1.1,
                                     0.6 + (uPointer.y - 0.5) * 1.1, 0.72));
      vec3 halfVec = normalize(lightDir + v);
      float ndh = clamp(dot(n, halfVec), 0.0, 1.0);
      float spec = pow(ndh, 34.0);
      float hot = pow(ndh, 90.0); // specular hotspot: the photo's blown core
      float bloomW = pow(ndh, 24.0) * 0.55 * smoothstep(0.965, 0.995, ndh);
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

      float I = clamp(uIntensity, 0.0, 1.5);
      vec3 holoAdd = vec3(0.0);
      float holoKeep = 0.0;
      if (w1 > 0.0) {
        // Cross-fade between the two edges rather than jumping as a drag
        // crosses the card. The diffraction order is vertical within either
        // beam; horizontal distance controls only its width/strength.
        float edgeMix = smoothstep(0.38, 0.62,
          pointer.x + (viewShift - 0.22) * 0.10);
        float ripple = 0.018 * sin(vUv.y * 24.0 + uTime * 0.35)
                     + 0.011 * sin(vUv.y * 57.0 - uTime * 0.23)
                     + 0.012 * (noise(vUv * vec2(5.0, 16.0) + uTime * 0.035) - 0.5);
        float width = 0.33 + 0.045 * sin(vUv.y * 15.0 + uTime * 0.20);
        float dr = 1.0 - vUv.x + ripple - (pointer.x - 0.5) * 0.17;
        float dl = vUv.x + ripple + (pointer.x - 0.5) * 0.17;
        float beamR = 1.0 - smoothstep(width * 0.55, width, dr);
        float beamL = 1.0 - smoothstep(width * 0.55, width, dl);
        float bandP = mix(beamL, beamR, edgeMix);
        // Vertical dripping striations in the hot foil, not a feathered veil.
        float liquid = 0.72 + 0.22 * noise(vUv * vec2(28.0, 5.0) + vec2(0.0, uTime * 0.12))
                     + 0.18 * sin(vUv.x * 92.0 + 3.0 * noise(vUv * vec2(3.0, 12.0)));
        float order = clamp(vUv.y + 0.025 * sin(vUv.x * 19.0 + vUv.y * 9.0)
                    + 0.018 * noise(vUv * vec2(18.0, 11.0)), 0.0, 1.0);
        vec3 bandCol = bandRamp(order);
        float rim = mix(1.0 - smoothstep(0.0, 0.13, dl),
                        1.0 - smoothstep(0.0, 0.13, dr), edgeMix);
        vec4 sp = dotSparkle(vUv, phase * 3.0 + pointerGlow * 1.2);
        vec3 pts = glintPoints(vUv, uTime, 0.975);
        holoAdd = (bandCol * bandP * (1.70 + 0.50 * rim) * liquid
                 + sp.rgb * sp.a * (0.08 + 0.34 * bandP)
                 + pts * (0.16 + 1.10 * bandP)
                 + vec3(bloomW + hot * 1.2) * (0.25 + 0.75 * bandP)) * I;
        holoKeep = clamp((0.84 * bandP + 0.06 * fresnel)
                         * min(uIntensity, 1.0), 0.0, 0.88);
      }

      vec3 iceFinal = srgbEnc(img);
      if (w2 > 0.0) {
        vec3 facetLight = normalize(vec3(lightDir.xy * 0.75 + (v.xy / max(v.z, 0.3)) * 0.18, 0.9));
        vec4 fc = iceFacets(vUv, facetLight);
        float se; vec4 splinter = iceSplinters(vUv, facetLight, se);
        // Preserve the printed ink: planes alternately lighten and darken
        // it, instead of laying opaque white shapes over the illustration.
        float shade = 1.0 + fc.x * 0.70 * I;
        vec3 iceLight = mix(vec3(0.88, 0.94, 1.0), uIce, 0.28);
        float whiteRim = fc.z * 0.65 + se * 1.8;
        vec3 iceLinear = img * shade
          + iceLight * (max(fc.x, 0.0) * 0.12 + fc.y * 0.025) * I
          + splinter.rgb * splinter.a * I
          + vec3(whiteRim + hot * 0.32 + bloomW * 0.20) * I;
        iceFinal = srgbEnc(max(iceLinear, vec3(0.0)));
      }

      vec3 goldAdd = vec3(0.0);
      float goldKeep = 0.0;
      if (w3 > 0.0) {
        // Two sparse scales of flat facets; the untouched gaps are the ink.
        // The warm reflection is a narrow metallic grazing wash, not a
        // mustard tint over the entire image.
        vec3 facetLight = normalize(vec3(lightDir.xy + v.xy * 0.22, 0.75));
        float e0; vec4 g0 = goldShards(vUv + 0.11, 6.0, 0.86, facetLight, e0);
        float e1; vec4 g1 = goldShards(vUv + 0.39, 10.0, 0.50, facetLight, e1);
        float warm = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.0);
        goldAdd = (g0.rgb * g0.a * 1.05 + g1.rgb * g1.a * 0.66
                 + vec3(2.8) * (e0 * 0.78 + e1 * 0.55)
                 + uGoldA * warm * 0.10
                 + glintPoints(vUv, uTime, 0.991) * 0.55
                 + vec3(bloomW + hot * 1.2) * 0.60) * I;
        goldKeep = clamp((g0.a * 0.60 + g1.a * 0.45)
                         * min(uIntensity, 1.0), 0.0, 0.70);
      }

      /* ---- base: the card's own ink, barely lifted ---- */
      vec3 baseSrc = vec3(0.02);
      float baseStr = 0.02 + fresnel * 0.04;
      vec3 baseTint = min(baseSrc / max(baseStr, 0.0001), vec3(2.2));
      float baseAlpha = clamp(baseStr, 0.0, 0.96) * uIntensity;

      /* All reflective light is added in linear space; base keeps its
       * original encoded-space blend, including the no-image fallback. */
      vec3 P = srgbEnc(img);
      vec3 baseFinal = mix(P, srgbEnc(baseTint), baseAlpha);
      vec3 holoFinal = srgbEnc(img * (1.0 - holoKeep) + holoAdd);
      vec3 goldFinal = srgbEnc(img * (1.0 - goldKeep) + goldAdd);
      vec3 final = (baseFinal * w0 + holoFinal * w1 +
                    iceFinal * w2 + goldFinal * w3) / wSum;

      if (uMode > 0.5) {
        /* ---- foil overlay, laminated over the whole face ---- */
        gl_FragColor = vec4(srgbDec(final), 1.0);
      } else {
        /* ---- base: the art itself, with the foil laminated on ---- */
        vec3 col = final;
        float vignette = 1.0 - smoothstep(0.5, 1.2, length(vUv - 0.5) * 1.5);
        col *= 0.98 + vignette * 0.08;
        col *= sin(vUv.y * 420.0) * 0.015 + 0.985;
        gl_FragColor = vec4(srgbDec(col), 1.0);
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
    if (overlay) {
      // premultiplied output: the foil ADDS its light while the print shows
      // through by (1 - alpha); ice/base emit tint*alpha so they reduce to
      // the ordinary normal blend and their pixels are unchanged.
      material.blending = THREE.CustomBlending;
      material.blendSrc = THREE.OneFactor;
      material.blendDst = THREE.OneMinusSrcAlphaFactor;
      material.blendEquation = THREE.AddEquation;
    } else {
      material.blending = THREE.NormalBlending;
    }
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
