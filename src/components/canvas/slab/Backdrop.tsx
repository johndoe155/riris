'use client';
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fluidEngine } from './fluidPalette';

/**
 * The slab stands in front of a plain gradient with a soft drop shadow — the
 * setting the reference photo was shot in. Both are drawn into canvases rather
 * than lit geometry: they cost nothing and never pick up the strip lights that
 * are meant for the plastic.
 *
 * The gradient is *diagonal*, which is what the reference actually shows
 * (fitted to the photo's background in `scripts/analysis/_bgfit.mjs`): a linear
 * ramp at 50 degrees, from #35202f along the bottom-left to #b5a3b0 at the
 * top-right, so the light is off to the right of frame and above. An earlier
 * version painted a vertical ramp with a pool of light behind the slab, which
 * put the brightest part of the wall in the centre and made the case read flat.
 *
 * The shadow sits ON the backdrop plane, not floating just behind the slab, so
 * it behaves like a shadow cast on a wall while the camera orbits, and it is
 * tight against the case's bottom edge — the reference's contact shadow is
 * ~20 px deep on a 1116 px case, not a pool 400 px wide.
 */

let gradientCache: THREE.CanvasTexture | null = null;
let gradientKey = '';

function gradientTexture(top: string, glow: string, bottom: string, angle: number, cover = 1) {
  const key = `${top}|${glow}|${bottom}|${angle}|${cover}`;
  if (gradientCache && gradientKey === key) return gradientCache;
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // direction: 0 = pure horizontal (light on the right), positive tilts the
  // light end up toward the top-right, in radians. `cover` is the fraction of
  // the wall the calibrated photo frame occupies: the gradient line spans only
  // that middle band and the canvas gradient clamps past its ends, so a wall
  // bigger than the photo frame shows no edge of its own.
  const dx = Math.cos(angle) * size * 0.5 * cover;
  const dy = Math.sin(angle) * size * 0.5 * cover;
  const g = ctx.createLinearGradient(size / 2 - dx, size / 2 + dy, size / 2 + dx, size / 2 - dy);
  g.addColorStop(0, bottom);
  g.addColorStop(0.5, glow);
  g.addColorStop(1, top);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  gradientCache = tex;
  gradientKey = key;
  return tex;
}

let shadowCache: THREE.CanvasTexture | null = null;

function shadowTexture() {
  if (shadowCache) return shadowCache;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.4, 'rgba(0,0,0,0.26)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.07)');
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
  /** visible height in world units; the slab is ~1.677 tall */
  height?: number;
  /** plane width / height. The wall is 1.35 wide by default; the hero passes 1 */
  aspect?: number;
  /** the lit end of the gradient (toward the top-right by default) */
  top?: string;
  glow?: string;
  /** the dark end of the gradient */
  bottom?: string;
  /** tilt of the gradient in radians; 0 = light straight to the right */
  angle?: number;
  /** fraction of the wall the calibrated photo frame occupies (gradient span) */
  cover?: number;
  shadow?: number;
  /** shadow centre and size, relative to the slab */
  shadowOffset?: [number, number];
  shadowScale?: [number, number];
}

export function Backdrop({
  height = 8,
  aspect = 1.35,
  top = '#191418',
  glow = '#4a3a45',
  bottom = '#0d0a0d',
  angle = 0.28,
  cover = 1,
  shadow = 0.72,
  shadowOffset = [0.02, -0.95],
  shadowScale = [1.55, 0.30],
}: BackdropProps) {
  const gradient = useMemo(() => gradientTexture(top, glow, bottom, angle, cover), [top, glow, bottom, angle, cover]);
  const soft = useMemo(() => shadowTexture(), []);
  const wallZ = -6;

  return (
    <>
      <mesh position={[0, 0, wallZ]} renderOrder={-20} raycast={noRaycast}>
        <planeGeometry args={[height * aspect, height]} />
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

/**
 * The measured backdrop of `reference-image.jpg`, ready to hand to `<Backdrop>`
 * when a view is meant to reproduce the photo's frame rather than a studio.
 */
export const REF_BACKDROP = {
  // least-squares fit of the photo's background pixels (scripts/analysis/_bgfit.mjs):
  // rms residual 8.4 per channel, against 14.1 for the previous stops and angle
  top: '#b5a3b0',
  glow: '#5b4153',
  bottom: '#35202f',
  // 50 degrees from +x. The old 0.28 rad (16 degrees) made the bottom-right far
  // too bright.
  angle: 0.873,
  shadow: 0.7,
  shadowOffset: [0.0, -0.98] as [number, number],
  shadowScale: [1.35, 0.32] as [number, number],
};

/**
 * The reference's backdrop placed for the hero camera. The photo's frame is
 * 2.24 x 2.23 case units; the wall is 1.82 times farther from the camera than the
 * case front, so the frame is 4.07 wall units square. Every colour then sits at
 * the same place relative to the case as it does in the photo. The default
 * wall (9 units tall, 1.35 wide) left the visible part almost flat mid-mauve.
 *
 * The contact shadow moves to the case's bottom edge at wall depth (y -1.56).
 */
/*
 * The hero camera (fov 38, 3:4 canvas) sees 6.34 x 4.76 world units at the
 * wall's depth; the photo frame is only 4.07 square there, so a 4.07 wall put
 * its own hard edges inside the shot — the pale rectangle and dark strip
 * beside the case. The wall now covers the view, and `cover` keeps the
 * gradient calibrated to the photo frame (the canvas gradient clamps beyond
 * it, so the extra wall is a smooth continuation, not a new edge).
 */
export const HERO_WALL_HEIGHT = 7.0;
export const HERO_BACKDROP = {
  ...REF_BACKDROP,
  cover: 4.07 / 7.0,
  // The void renders NO contact shadow: its key light reads as sitting
  // behind the case (the pale zone it radiates from is deeper than the
  // frame), so there is nothing behind the slab for a cast shadow to land
  // on. REF_BACKDROP's shadow / shadowOffset / shadowScale keys are
  // intentionally not overridden here — <VoidBackdrop> has no shadow to
  // configure and ignores the inherited keys.
};

/* ------------------------------------------------------------------ *
 * VoidBackdrop — the Forge's backdrop as a deep, stationary void
 *
 * The flat <Backdrop> wall is a finite quad at z = -6: when the Forge
 * camera orbits, its gradient pans and its edges swing into frame, which
 * reads as a painted wall rather than a world. This replaces the quad
 * with an enclosing dome whose colour is computed from the *fixed world
 * ray direction* of each fragment — the void is anchored to the scene,
 * not to the drag, the camera or any surface, so no orbit can ever
 * reveal an edge of it.
 *
 * Colour accuracy: the gradient is the SAME three-stop ramp the canvas
 * gradientTexture() lays out (same stops #35202f / #5b4153 / #b5a3b0,
 * same 50-degree line, same transition points). Each fragment builds the
 * true camera ray (vWorldPos - cameraPosition), intersects it with the
 * anchored plane (world z = -WALL_DEPTH) and evaluates that exact wall
 * layout — so the resting frame is the calibrated frame, verified delta
 * 0/255. The layout extends infinitely along the rays, so there are no
 * edges. Rays that leave the front hemisphere (a full 180-degree orbit)
 * fade to a bounded direction-space ramp over the same axis — the old
 * epsilon-clamped projection used to shatter there into a diagonal line
 * of absolute dark against absolute pale. The depth-only terms — nadir
 * falloff, behind-the-viewer darkness, the halo and the dither —
 * evaluate to zero (or a whisper at the pale corner) across the resting
 * view.
 * ------------------------------------------------------------------ */

/** the old wall plane's depth; the ramp's coordinates are anchored there */
const WALL_DEPTH = 6;
/** dome radius: the Forge camera orbits at 3.2 with far = 60, so 30 encloses */
const DOME_RADIUS = 30;
/** canvas the gradientTexture maths is expressed in (its 1024 canvas) */
const GRAD_CANVAS = 1024;

const VOID_VERTEX = /* glsl */ `
  varying vec3 vWorldPos;

  void main() {
    // world position of the dome fragment; the fragment shader builds the
    // CAMERA RAY from this (vWorldPos - cameraPosition) - the dome is centred
    // on the scene but the camera is not, and the calibrated wall layout is
    // defined along camera rays, so an origin-based direction would shift
    // the whole gradient by the camera's 3.2-unit offset
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const VOID_FRAGMENT = /* glsl */ `
  uniform vec3 uDark;
  uniform vec3 uGlow;
  uniform vec3 uPale;
  // the ramp's line in wall units: start point and (P1 - P0)
  uniform vec2 uP0;
  uniform vec2 uGrad;
  uniform float uGradDD;
  // the anchored plane's depth: ray direction -> wall-plane coordinates
  uniform float uPlaneZ;
  // unit axis of the ramp line, for the direction-space rear ramp
  uniform vec2 uAxis;
  // direction of the distant key light, deeper than the frame
  uniform vec3 uLight;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  // exact sRGB transfer curves, so the three stops mix exactly as the old
  // canvas texture did once the GPU decoded it on sampling
  vec3 srgbToLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }
  vec3 linearToSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
  }

  void main() {
    // fixed world ray direction: independent of camera, drag and model
    // the true camera ray through this fragment: world-anchored (the field
    // of directions is fixed in the scene, so no drag or model motion can
    // shift it), and exact against the wall layout the calibrated quad
    // painted, because the wall's coordinates were measured along these rays
    vec3 dir = normalize(vWorldPos - cameraPosition);

    /* The ramp coordinate. The front (resting) view uses the perspective-
     * correct projection onto the anchored plane: every ray the resting
     * camera can see lands on the exact wall layout the calibrated quad
     * painted. But that projection diverges as |dir.z| -> 0: the epsilon
     * clamp shatters everything beyond it onto the ramp's END STOPS, and
     * the boundary between them — a diagonal line of absolute dark against
     * absolute pale — is exactly what a full 180-degree orbit used to
     * reveal. The rear hemisphere therefore fades to a bounded direction-
     * space ramp over the SAME axis (sweeps the full stop range smoothly
     * as the ray swings, no threshold anywhere), with the blend weight
     * itself a smoothstep: the resting frame sits deep in the zero-weight
     * region, so its colours are untouched bit for bit. */
    float sgn = dir.z >= 0.0 ? 1.0 : -1.0;
    float t = (uPlaneZ - cameraPosition.z) / (sgn * max(abs(dir.z), 1e-4));
    vec2 p = cameraPosition.xy + t * dir.xy;    float sPlane = clamp(dot(p - uP0, uGrad) / uGradDD, 0.0, 1.0);
    float sRear = clamp(0.5 + dot(dir.xy, uAxis) * 0.6, 0.0, 1.0);
    float s = mix(sPlane, sRear, smoothstep(-0.30, -0.02, dir.z));
    vec3 lin = s < 0.5
      ? mix(srgbToLinear(uDark), srgbToLinear(uGlow), s * 2.0)
      : mix(srgbToLinear(uGlow), srgbToLinear(uPale), (s - 0.5) * 2.0);
    vec3 col = linearToSrgb(lin);

    /* ---- the void: depth terms, all of which vanish inside the frame ---- */
    // below the frame the gradient falls away into near-black: no floor
    col *= 1.0 - 0.72 * smoothstep(0.62, 0.98, -dir.y);
    // and it stays dark through and behind the viewer: no lit wall out there
    col *= 1.0 - 0.55 * smoothstep(0.15, 0.75, dir.z);

    // No contact shadow: the void's key light reads as sitting behind the
    // case (the pale zone it radiates from is deeper than the frame), so a
    // shadow cast on the surface behind the slab has nothing to land on —
    // the old wall's grounding ellipse was a property of the wall, not of
    // the void, and it is gone with the wall.

    // the pale zone radiates from deeper than the frame: a whisper of bloom
    // with an inverse-angle fall-off, effectively zero across the dark half
    col += uPale * 0.055 * pow(max(dot(dir, uLight), 0.0), 8.0);

    // dither: kills 8-bit banding on the long smooth ramps, which is what
    // makes a gradient read as paint instead of depth
    col += (hash(gl_FragCoord.xy) - 0.5) * (1.5 / 255.0);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export interface VoidBackdropProps {
  /** wall size the gradient anchors were calibrated against */
  height?: number;
  /** the dark / glow / pale stops of the calibrated ramp */
  top?: string;
  glow?: string;
  bottom?: string;
  /** tilt of the gradient line, radians from +x (0 = horizontal) */
  angle?: number;
  /** fraction of the wall the calibrated gradient line spans */
  cover?: number;
}

/**
 * Parse a #rrggbb into RAW sRGB components. THREE.Color's setters convert to
 * linear working space; this shader writes straight to the canvas exactly as
 * the old `toneMapped={false}` quad did, so the hex values must stay raw.
 */
function rawSrgb(hex: string): THREE.Color {
  const v = parseInt(hex.replace('#', ''), 16);
  return new THREE.Color(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255);
}

export function VoidBackdrop({
  height = HERO_WALL_HEIGHT,
  top = '#b5a3b0',
  glow = '#5b4153',
  bottom = '#35202f',
  angle = 0.873,
  cover = 1,
}: VoidBackdropProps) {
  const uniforms = useMemo(() => {
    // the ramp's endpoints in wall units — the same layout gradientTexture()
    // paints (gradient line centred, span = cover of the wall, angle tilt)
    const half = GRAD_CANVAS / 2;
    const gx = Math.cos(angle) * half * cover;
    const gy = Math.sin(angle) * half * cover;
    const wx = (cx: number) => (cx / GRAD_CANVAS - 0.5) * height;
    const wy = (cy: number) => (0.5 - cy / GRAD_CANVAS) * height; // canvas y is down
    const p0 = new THREE.Vector2(wx(half - gx), wy(half + gy));
    const grad = new THREE.Vector2(wx(half + gx) - p0.x, wy(half - gy) - p0.y);
    // the key light sits just outside the visible top-right corner, deeper
    // along -z: the halo's shoulder grazes the frame corner, its core never
    const light = new THREE.Vector3(0.55, 0.55, -0.55).normalize();
    return {
      uDark: { value: rawSrgb(bottom) },
      uGlow: { value: rawSrgb(glow) },
      uPale: { value: rawSrgb(top) },
      uP0: { value: p0 },
      uGrad: { value: grad },
      uGradDD: { value: grad.lengthSq() },
      uPlaneZ: { value: -WALL_DEPTH },
      // unit axis of the ramp line (the 50-degree direction), for the
      // bounded rear-hemisphere ramp
      uAxis: { value: grad.clone().normalize() },
      uLight: { value: light },
    };
  }, [height, top, glow, bottom, angle, cover]);

  // fluid palette: while the Forge's driver is mounted, ease the three
  // stops toward its already-smoothed channels (the engine's values move,
  // this copy just follows — one frame of lag at most). Unmounted — the
  // tooling, or any future static use — and the uniforms never move.
  useFrame(() => {
    if (!fluidEngine.mounted) return;
    uniforms.uDark.value.copy(fluidEngine.current.dark);
    uniforms.uGlow.value.copy(fluidEngine.current.glowStop);
    uniforms.uPale.value.copy(fluidEngine.current.paleStop);
  });

  return (
    <mesh frustumCulled={false} renderOrder={-20} raycast={() => null}>
      <sphereGeometry args={[DOME_RADIUS, 48, 32]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VOID_VERTEX}
        fragmentShader={VOID_FRAGMENT}
        side={THREE.BackSide}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
};
