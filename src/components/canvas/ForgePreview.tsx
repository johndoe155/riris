'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, applyProps } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls, PerspectiveCamera, Environment, Lightformer } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useVaultStore } from '@/store/useVaultStore';
import { Slab } from '@/components/canvas/slab/Slab';
import { VoidBackdrop, HERO_BACKDROP, HERO_WALL_HEIGHT } from '@/components/canvas/slab/Backdrop';
import { deriveFluidTarget, extractPalette, fluidEngine } from '@/components/canvas/slab/fluidPalette';
import { loadImage } from '@/components/canvas/slab/useSlabTextures';
import { cardFromNft, DEFAULT_SLAB } from '@/data/slabCards';

/**
 * Long strip lights are what real plastic shows: a soft body reflection with
 * one hard streak down the edge.
 *
 * Tuned to the reference, which is a neutral studio with the key off to the
 * upper right: the case's face measures #91808c with a #baa9b5 top strip, i.e.
 * a mauve-neutral acrylic under light that carries no hue of its own. The
 * orange ring and cyan circle an earlier version added were the single biggest
 * source of the case's colour cast — nothing in the photo supports them — so
 * the rig is now one soft key, a cool fill opposite it and a dim bounce from
 * below, all near-neutral with the faintest mauve.
 */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={2.4}>
      <Lightformer form="rect" intensity={2.2} color="#fff6fa" position={[5.5, 5, -3]} rotation={[Math.PI * 0.12, 0, -Math.PI * 0.16]} scale={[13, 2.4, 1]} />
      <Lightformer form="rect" intensity={0.4} color="#e6dce8" position={[-6, 1.5, -3]} rotation={[0, Math.PI * 0.32, 0]} scale={[12, 2.6, 1]} />
      <Lightformer form="rect" intensity={0.5} color="#6d5b66" position={[0, -6, 2]} rotation={[-Math.PI * 0.4, 0, 0]} scale={[16, 3, 1]} />
      {/* a narrow vertical strip: the hairline the moulding's bevel catches */}
      <Lightformer form="rect" intensity={1.1} color="#ffffff" position={[3.2, 0, 3]} rotation={[0, -Math.PI * 0.18, 0]} scale={[0.7, 7, 1]} />
      {/* overhead softbox: the long body reflection that runs down the apron and
          turns on the clearcoat — the reference's bright top strip */}
      <Lightformer form="rect" intensity={1.3} color="#fff4fa" position={[0, 6, 2]} rotation={[-Math.PI / 2.2, 0, 0]} scale={[12, 3.5, 1]} />
      {/* faint counter-strip on the left so the dark chamfer still carries a
          hairline of reflected light instead of reading flat */}
      <Lightformer form="rect" intensity={0.8} color="#f6eef6" position={[-3.4, 0, 3]} rotation={[0, Math.PI * 0.2, 0]} scale={[0.5, 7, 1]} />
      {/* rear-side fill: every front-hemisphere former above left the case's
          BACK-facing normals an almost empty environment to sample, which is
          why the casing read flat and darker under the 180-degree orbit. A
          soft key and a narrow strip mirrored behind give the rear the same
          specular vocabulary (a long body streak plus a hard hairline) at
          about a third of the front's intensity. Lightformers aim at the
          scene origin by default, so these face the case; they live wholly
          in the rear hemisphere, so the front look is untouched. */}
      <Lightformer form="rect" intensity={0.7} color="#efe5ee" position={[-4.5, 4.5, -4]} scale={[9, 2.2, 1]} />
      <Lightformer form="rect" intensity={0.65} color="#ffffff" position={[-3.2, 0, -3.2]} scale={[0.6, 7, 1]} />
    </Environment>
  );
}

/**
 * Rotates the baked environment with the pointer, so the strip highlights
 * slide across the glass instead of sitting still. No re-bake and no React
 * state: the renderer reads scene.environmentRotation every frame, and
 * applyProps writes through to the scene's own Euler.
 */
function MovingHighlights() {
  const scene = useThree((s) => s.scene);
  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const p = state.pointer; // -1..1, R3F keeps this updated
    const rot = scene.environmentRotation;
    const x = THREE.MathUtils.damp(rot.x, -p.y * 0.22, 3, dt);
    const y = THREE.MathUtils.damp(rot.y, p.x * 0.3, 3, dt);
    applyProps(scene, { environmentRotation: [x, y, 0] });
  });
  return null;
}

/** Orbit with a spring-back: drag to inspect, and it settles straight-on. */
function SpringOrbit() {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const interacting = useRef(false);
  const target = useMemo(() => ({ azimuth: 0, polar: Math.PI / 2 }), []);
  useFrame((_, delta) => {
    const c = controls.current;
    if (!c || interacting.current) return;
    const dt = Math.min(delta, 1 / 30);
    const az = c.getAzimuthalAngle();
    const pol = c.getPolarAngle();
    if (Math.abs(az - target.azimuth) > 1e-4) {
      c.setAzimuthalAngle(THREE.MathUtils.damp(az, target.azimuth, 2.4, dt));
    }
    if (Math.abs(pol - target.polar) > 1e-4) {
      c.setPolarAngle(THREE.MathUtils.damp(pol, target.polar, 2.4, dt));
    }
  });
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableZoom={false}
      minPolarAngle={Math.PI / 3}
      maxPolarAngle={Math.PI / 1.8}
      rotateSpeed={0.5}
      onStart={() => {
        interacting.current = true;
      }}
      onEnd={() => {
        interacting.current = false;
      }}
    />
  );
}

/** white, in three's linear working space, for the light tint mixes */
const LIGHT_WHITE = new THREE.Color('#ffffff');

/**
 * The forge's live light rig: same intensities and placement as the static
 * pair it replaces, plus a per-frame tint from the fluid palette's former
 * channel (the extracted accent, pulled 72% back toward white — a gleam
 * colour, not a gel). Idle (engine unmounted) it stays pure white.
 */
function PaletteLights() {
  const ambient = useRef<THREE.AmbientLight>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    if (!fluidEngine.mounted) return;
    ambient.current?.color.copy(LIGHT_WHITE).lerp(fluidEngine.current.former, 0.5);
    key.current?.color.copy(LIGHT_WHITE).lerp(fluidEngine.current.former, 0.35);
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={1.5} />
      <directionalLight ref={key} position={[4, 5, 6]} intensity={2.1} />
    </>
  );
}

/**
 * The fluid palette's engine: ticks the ~1 s interpolation once per frame
 * and mirrors the smoothed background into the scene. Mounting it is what
 * marks the engine active — the void's stop uniforms, the cloned glass and
 * the holo colour uniforms all gate on `fluidEngine.mounted`, so nothing
 * anywhere else (the pit, the reference view) ever animates.
 */
function FluidPaletteDriver() {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    fluidEngine.mounted = true;
    return () => {
      fluidEngine.mounted = false;
      fluidEngine.reset();
    };
  }, []);
  useFrame((_, delta) => {
    fluidEngine.tick(delta);
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(fluidEngine.current.background);
    }
  });
  return null;
}

export function ForgePreviewCanvas() {
  const finishType = useVaultStore((s) => s.finishType);
  const nftData = useVaultStore((s) => s.nftData);
  const [flipped, setFlipped] = useState(false);
  const [hovered, setHovered] = useState(false);

  // an uploaded / fetched NFT becomes a card of its own; otherwise show the
  // default slab from the gallery set
  const card = useMemo(
    () => (nftData ? cardFromNft(nftData, finishType) : { ...DEFAULT_SLAB, style: finishType }),
    [nftData, finishType]
  );

  const toggleFlip = useCallback(() => setFlipped((f) => !f), []);
  const handlers = useMemo(() => ({ onDoubleClick: () => toggleFlip() }), [toggleFlip]);

  /* --- fluid palette: whenever the subject image lands (default asset,
         fetched NFT or local upload), sample it once and queue the derived
         palette; the driver eases every channel over ~1 s --- */
  useEffect(() => {
    let live = true;
    loadImage(card.art).then((img) => {
      if (!live) return;
      if (img) fluidEngine.setTarget(deriveFluidTarget(extractPalette(img)));
      else fluidEngine.reset();
    });
    return () => {
      live = false;
    };
  }, [card.art]);

  return (
    <div className="w-full h-full min-h-[500px] relative bg-transparent overflow-hidden">
      {/*
        A long lens. The reference is effectively orthographic — its cone is
        under two degrees wide — and at fov 32 the near edge of the case
        projected ~40 px wider than the far one on a 665 px case. fov 16 keeps
        a little parallax for the orbit while holding the measured proportions.
      */}
      <Canvas
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#352334']} />
        {/* Long-lens framing keeps the case filling the portrait Forge canvas while
            retaining the reference's nearly orthographic straight-on proportions. */}
        <PerspectiveCamera makeDefault position={[0, 0, 3.2]} fov={38} near={0.1} far={60} />
        {/* scaled ~2.7x from the first rig so front-facing surfaces return their measured tones (scripts/analysis/_tones.mjs).
            These are the scene's LIVE lights (the lightformers are baked once
            by <Environment frames={1}> and cannot animate), so they are what
            carries the fluid palette's lighting tint: every lit surface and
            its speculars pick it up per frame. White at rest. */}
        <PaletteLights />

        <StudioEnvironment />
        <MovingHighlights />
        <FluidPaletteDriver />
        {/* deep stationary void: fixed ray directions, no edges to reveal */}
        <VoidBackdrop height={HERO_WALL_HEIGHT} {...HERO_BACKDROP} />

        <group
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <Slab
            card={card}
            quality="hero"
            intensity={0.82}
            flipped={flipped}
            active={hovered}
            cardHandlers={handlers}
            fluid
          />
        </group>

        <SpringOrbit />
      </Canvas>

      <div className="absolute top-4 left-4 font-mono text-[9px] px-2 py-1 bg-black/60 text-white/60 border border-white/10 backdrop-blur">
        ● LIVE • WEBGL • DRAG TO SPIN
      </div>

      <div className="absolute top-4 right-4 flex gap-2">
        <button
          type="button"
          onClick={toggleFlip}
          className="font-mono text-[9px] px-2 py-1 bg-black/60 text-white/70 border border-white/15 backdrop-blur hover:text-white"
        >
          {flipped ? '● SHOW FRONT' : '○ FLIP CARD'}
        </button>
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex justify-between">
        <div className="font-mono text-[9px] text-[#F5F3EF]/30">
          SHADER: GLSL • {`${card.title}`} • {card.style.toUpperCase()}
        </div>
        <div className="font-mono text-[9px] text-[#FF4D00]">TRUE OPTICAL PREVIEW</div>
      </div>
    </div>
  );
}
