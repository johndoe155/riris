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
     * Foil is laminated over the entire printed face, including the frame and
     * text panel; the rounded card-face geometry supplies the silhouette clip.
     */
    uMask: new THREE.Vector4(0, 0, 1, 1),
    /** A small edge feather keeps the foil from aliasing at the card silhouette. */
    uMaskFeather: 0.012,
    /** how strongly the foil shows outside the mask (full-face defaults to 0) */
    uOutside: 0,
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
    uniform vec4 uMask;
    uniform float uMaskFeather;
    uniform float uOutside;
    uniform vec3 uFoilB;
    uniform vec3 uFoilC;
    uniform vec3 uFoilD;
    uniform vec3 uIce;
    uniform vec3 uGoldA;
    uniform vec3 uGoldB;

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

    float hash21(vec2 p) {
      p = fract(p * vec2(234.34, 435.345));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    vec2 hash22(vec2 p) {
      float n = hash21(p);
      return vec2(hash21(p + n + 1.71), hash21(p + n * 2.31 + 5.13));
    }

    /**
     * Fully saturated spectral ramp — the foil's diffraction orders, shared by
     * every finish (the holo sweep desaturates it slightly before use).
     */
    vec3 prismRamp(float t) {
      vec3 c1 = vec3(1.0, 0.48, 0.22); // orange: the brand constant
      vec3 c2 = uFoilB; // cool order
      vec3 c3 = uFoilC; // warm order
      vec3 c4 = uFoilD; // magenta order
      float t2 = fract(t);
      return (t2 < 0.33) ? mix(c1, c2, t2 / 0.33)
           : (t2 < 0.66) ? mix(c2, c3, (t2 - 0.33) / 0.33)
           :               mix(c3, c4, (t2 - 0.66) / 0.34);
    }

    /** push a linear colour away from its luma so foil orders stay chromatic */
    vec3 vivid(vec3 c) {
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      return max(mix(vec3(l), c, 2.2), 0.0);
    }

    /**
     * Discrete iridescent stop colours. A smooth spectral ramp blends through
     * grey between far-apart orders, but real foil shards and specks pick ONE
     * order each — so the confetti hues are quantised: aqua, lime, yellow,
     * golden orange, magenta, pink, blue and a clear/white shard, all derived
     * from the palette uniforms so the driver still steers them.
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

    /**
     * The holo band's smooth spectrum, blue at the card's bottom edge through
     * teal, green, yellow and orange to red at the top — the continuous
     * rainbow the reference shows, with the palette uniforms anchoring the
     * cool/warm stops.
     */
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

    /**
     * The holo foil's micro-dot grain: a fine grid of round foil dots, each
     * cell twinkling on its own hash as the view angle slides. Most dots read
     * silver; a minority carry a spectral tint, exactly like the reference's
     * occasional warm/cool specks. .rgb = tint, .a = sparkle strength.
     */
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

    /**
     * Confetti shards: per grid cell a random convex triangle cut by three
     * hashed half-planes, present in only some cells, coloured as a single
     * iridescent stop and lit by the view angle; the soft parameter widens
     * the edge fade (soft pastel flashes vs hard glass shards).
     * .rgb = colour, .a = coverage.
     */
    vec4 shardField(vec2 uv, float cells, float phase, float density, float soft) {
      vec2 g = uv * vec2(cells * 0.72, cells);
      vec2 id = floor(g);
      vec2 f = fract(g);
      float r = hash21(id + 1.7);
      float tri = 1.0;
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float a = 6.2831 * hash21(id + fk * 3.71 + 9.2);
        vec2 nrm = vec2(cos(a), sin(a));
        float off = mix(-0.15, 0.55, hash21(id + fk * 9.13 + 4.7));
        tri *= 1.0 - smoothstep(0.0, max(soft, 0.02), dot(f - 0.5, nrm) - off);
      }
      float present = step(1.0 - density, hash21(id + 3.3));
      float lit = 0.75 + 0.25 * sin(phase * 1.6 + r * 6.2831);
      vec3 col = foilStop(hash21(id + 6.1) + phase * 0.04);
      return vec4(col * lit, tri * present * (0.65 + 0.30 * lit));
    }

    /**
     * Cracked ice: a contiguous mosaic of straight-edged triangular facets —
     * each grid cell split on a hashed diagonal, plus a coarser octave for the
     * large sheen planes. .x = per-facet luma hash, .y = thin bright crack
     * line along the facet boundaries, .z = hash for prismatic tint / glint.
     */
    vec4 iceFacets(vec2 uv) {
      // fine triangular mosaic: each cell split on a hashed diagonal
      vec2 g = uv * vec2(16.0, 22.0);
      vec2 id = floor(g);
      vec2 f = fract(g);
      float dg = step(0.5, hash21(id + 4.7));
      float sMain = mix(f.x - f.y, f.x + f.y - 1.0, dg);
      vec2 fid = id * 2.0 + step(0.0, sMain);
      // crack lines are rare and faint: facets read as luma steps, not wires
      float lineA = (1.0 - smoothstep(0.0, 0.04, abs(sMain) * 0.7071))
                  * 0.35 * step(0.72, hash21(fid + 9.4));
      // coarser counter-posed mosaic breaks the grid's regularity
      vec2 g2 = uv.yx * vec2(9.0, 12.5) + 0.31;
      vec2 id2 = floor(g2);
      vec2 f2 = fract(g2);
      float dg2 = step(0.5, hash21(id2 + 8.1));
      float s2 = mix(f2.x - f2.y, f2.x + f2.y - 1.0, dg2);
      vec2 fid2 = id2 * 2.0 + step(0.0, s2);
      float lineB = (1.0 - smoothstep(0.0, 0.035, abs(s2) * 0.7071))
                  * 0.25 * step(0.70, hash21(fid2 + 5.8));
      float line = max(lineA, lineB);
      float lum = mix(hash21(fid), hash21(fid2 + 11.3), 0.45);
      return vec4(lum, line, hash21(fid + 2.17), 1.0);
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

      // Shared view/pointer phase. uPointer is damped on the CPU side, so
      // every term derived from this glides rather than jumps while dragging.
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

      /* ---- holo: one smooth spectral band on an otherwise matte face ----
       * The reference shows a continuous vertical rainbow (red top through
       * yellow/green to blue bottom) hugging one side, with a faint rippled,
       * water-like edge; the rest of the art stays dark and matte until the
       * view angle or the pointer slides the band across it. Dot-grain
       * sparkle lives inside the band. */
      float ripple = sin(vUv.y * 21.0 + uTime * 0.30) * 0.020
                   + sin(vUv.y * 47.0 - uTime * 0.22 + 1.7) * 0.012;
      float bx = 0.50 + (pointer.x - 0.5) * 0.72 + (pointer.y - 0.5) * 0.18
               + (viewShift - 0.25) * 0.78;
      float band = smoothstep(bx - 0.38 + ripple, bx - 0.12 + ripple, vUv.x)
                 * (1.0 - smoothstep(bx + 0.10 + ripple, bx + 0.38 + ripple, vUv.x));
      float water = 0.5 + 0.5 * sin(vUv.x * 90.0
                    + sin(vUv.y * 60.0 + uTime * 0.30) * 2.0);
      vec3 bandCol = bandRamp(vUv.y + 0.03 * sin(vUv.x * 30.0 + uTime * 0.15));
      vec4 sp = dotSparkle(vUv, phase * 3.0 + pointerGlow * 1.2);
      float sparkIn = sp.a * (0.10 + 0.90 * band);
      vec3 holoTint = bandCol * (0.80 + 0.30 * band + 0.08 * water)
                    + sp.rgb * sparkIn * 1.10
                    + vec3(0.90, 0.95, 1.0) * spec * 0.30;
      float holoDots = sp.a * (0.18 + 0.82 * pointerGlow);
      float holoHot = pow(max(dot(n, halfVec), 0.0), 18.0);
      float holoAmt = clamp(band * (0.95 + 0.18 * water) + sparkIn * 0.55
                          + holoDots * 0.45 + fresnel * 0.16 + spec * 0.18
                          + holoHot * 0.24, 0.0, 1.35);

      /* ---- cracked ice: fine tone-on-tone facet mosaic ----
       * The reference is the subtle finish: a fine network of small
       * translucent facets that read as faint lighter/darker patches over the
       * art, with only a few pale pink iridescent flashes near the edges.
       * Text stays fully readable, so alphas stay low. */
      vec4 fc = iceFacets(vUv);
      float facetLum = (fc.x - 0.5) * 0.42;
      float glint = pow(0.5 + 0.5 * sin(phase * 2.2 + fc.z * 43.0), 3.0)
                  * (0.4 + 0.6 * pointerGlow);
      vec4 flash = shardField(vUv + 0.13, 13.0, phase * 1.3 + 4.0, 0.16, 0.018);
      flash.rgb = mix(flash.rgb, vec3(1.0), 0.45);
      flash.a *= 0.58;
      vec4 heroIce = shardField(vUv + 0.41, 6.0, phase * 0.72 + 1.4, 0.30, 0.012);
      heroIce.rgb = mix(heroIce.rgb, vec3(0.94, 0.90, 1.0), 0.34);
      heroIce.a *= 0.78;
      float iceShardA = 1.0 - (1.0 - flash.a) * (1.0 - heroIce.a);
      vec3 iceShardCol = (flash.rgb * flash.a + heroIce.rgb * heroIce.a)
                       / max(iceShardA, 0.0001);
      vec3 iceTint = mix(uIce, vec3(1.0), 0.35) * (0.52 + facetLum + glint * 0.38)
                   + iceShardCol * iceShardA * (0.78 + glint * 0.22)
                   + vec3(0.90, 0.96, 1.0) * fc.y * 0.35;
      float iceAmt = clamp(0.08 + abs(facetLum) * 0.64 + fc.y * 0.18
                         + glint * 0.18 + iceShardA * 0.62
                         + fresnel * 0.18 + spec * 0.16, 0.0, 1.05);

      /* ---- gold: the loudest finish — dense shattered-glass confetti ----
       * Three octaves: broad pale lavender washes, mid saturated shards and
       * small bright slivers, each flashing its own stop colour, scattered
       * densely enough to wash out ink underneath, plus glowing sparkle dots.
       * The gold pair stays as a faint warm sheen between the shards. */
      vec4 gw = shardField(vUv + 0.37, 5.0, phase * 0.7 + 2.1, 0.48, 0.012);
      gw.rgb = vivid(gw.rgb);
      gw.a *= 0.62;
      vec4 gm = shardField(vUv, 10.0, phase, 0.54, 0.010);
      gm.rgb = vivid(gm.rgb) * 1.16;
      gm.a *= 0.92;
      vec4 gs = shardField(vUv + 0.11, 18.0, phase * 1.2 + 4.2, 0.34, 0.008);
      gs.rgb = vivid(gs.rgb) * 1.28;
      gs.a *= 0.86;
      float shardA = 1.0 - (1.0 - gw.a) * (1.0 - gm.a) * (1.0 - gs.a);
      vec3 shardCol = (gw.rgb * gw.a + gm.rgb * gm.a + gs.rgb * gs.a)
                    / max(shardA, 0.0001);
      float cluster = mix(0.42, 1.0, smoothstep(0.28, 0.78, noise(vUv * 3.2 + phase * 0.08)));
      shardA *= cluster;
      float goldHot = pow(max(dot(n, halfVec), 0.0), 14.0);
      vec3 warm = mix(uGoldB, uGoldA,
                      0.5 + 0.5 * sin(vUv.y * 3.0 + uTime * 0.2 + viewShift * 5.0));
      vec3 goldTint = shardCol + warm * (0.22 + goldHot * 0.42)
                    + vec3(1.0, 0.88, 0.42) * goldHot * 0.34;
      float goldAmt = clamp(shardA * 1.10 + spec * 0.18 + fresnel * 0.08
                          + goldHot * 0.38, 0.0, 1.35);

      // base finish: the card's own ink, lifted only slightly by the view angle
      vec3 baseTint = vec3(1.0);
      float baseAmt = 0.02 + fresnel * 0.04;

      vec3 effectColor = (baseTint * baseAmt * w0 + holoTint * holoAmt * w1 +
                          iceTint * iceAmt * w2 + goldTint * goldAmt * w3) / wSum;
      float effectAmt = (baseAmt * w0 + holoAmt * w1 + iceAmt * w2 + goldAmt * w3) / wSum;

      if (uMode > 0.5) {
        /* ---- foil overlay: masked to the art window ---- */
        float m = artMask(vUv);
        float alpha = effectAmt * mix(uOutside, 1.0, m) * uIntensity;
        vec3 col = effectColor / max(effectAmt, 0.0001);
        // keep the very top end of the foil from clipping to flat white
        col = min(col, vec3(2.6));
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
      } else {
        /* ---- base: the art itself, with the finish mixed in ---- */
        vec3 baseTier = img * (0.97 + fresnel * 0.1);

        // matte art; the band replaces it with the spectrum where it sits
        vec3 holoTier = mix(img, bandCol * 1.15, band * 0.72);
        holoTier += bandCol * band * 0.22;
        holoTier += sp.rgb * sparkIn * (0.50 + pointerGlow * 0.30) + vec3(spec) * 0.20;

        // per-facet refraction: the art resampled with a facet-hash offset
        vec2 refr = (hash22(vec2(fc.z * 91.7, fc.z * 47.3)) - 0.5) * 0.012;
        vec3 imgR = texture2D(uImage, coverUv(vUv + refr, uImageAspect, uCardAspect)).rgb;
        vec3 iceTier = mix(img, imgR, 0.35) * (1.0 + facetLum * 0.60 + glint * 0.10);
        iceTier += uIce * (0.02 + glint * 0.08 + fresnel * 0.05) + fc.y * 0.10;
        iceTier += flash.rgb * flash.a * 0.45;

        vec3 goldTier = mix(img, gw.rgb, gw.a);
        goldTier = mix(goldTier, gm.rgb, gm.a);
        goldTier = mix(goldTier, gs.rgb, gs.a);
        goldTier += gd.rgb * gd.a * 0.40 + warm * (0.03 + spec * 0.25);

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
  mask = [0, 0, 1, 1],
  maskFeather = 0.012,
  outside = 0,
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
    material.blending = overlay ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.toneMapped = false;
    material.depthWrite = !overlay;
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
