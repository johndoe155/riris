'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, applyProps } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { OrbitControls, PerspectiveCamera, Environment, Lightformer } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useVaultStore } from '@/store/useVaultStore';
import { Slab } from '@/components/canvas/slab/Slab';
import { Backdrop } from '@/components/canvas/slab/Backdrop';
import { cardFromNft, DEFAULT_SLAB } from '@/data/slabCards';

/**
 * Long strip lights are what real plastic shows: a soft body reflection with
 * one hard streak down the edge.
 */
function StudioEnvironment() {
  return (
    /* Rebuilt against the photo. The old rig had a #FF4D00 ring at intensity 4
     * and a #00E5FF circle at 3 flanking the slab; nothing in the reference is
     * that saturated or that hot — sampled over the whole frame, only 7.2 % of
     * pixels clear L 0.75 and the brightest specular on the shell is a neutral
     * #9e919b. What the photo actually shows is one soft key from the upper
     * right (the right rail reads #9e919b against a #7d6b79 backdrop, the left
     * rail #433841 against #412e3d — a 2.6x side-to-side ratio) and a dim
     * warm fill from the lower left (#32212e). */
    <Environment resolution={256} frames={1} environmentIntensity={0.55}>
      {/* key, upper right, slightly in front */}
      <Lightformer form="rect" intensity={2.2} color="#fffaf4" position={[6.5, 3, 2]} rotation={[0, -Math.PI * 0.42, 0]} scale={[13, 3.4, 1]} />
      {/* a soft box front-right, so the shell keeps a body reflection */}
      <Lightformer form="rect" intensity={1.1} color="#f4eef4" position={[3.5, 0.5, 5]} rotation={[0, -Math.PI * 0.3, 0]} scale={[9, 5, 1]} />
      {/* the dark side: a dim strip and nothing else */}
      <Lightformer form="rect" intensity={0.35} color="#6b5a68" position={[-6.5, 0.5, -2]} rotation={[0, Math.PI * 0.4, 0]} scale={[10, 2, 1]} />
      {/* top and bottom fills, both near-neutral */}
      <Lightformer form="rect" intensity={0.9} color="#efe8ef" position={[0, 6, -3]} rotation={[Math.PI * 0.35, 0, 0]} scale={[14, 2, 1]} />
      <Lightformer form="rect" intensity={0.3} color="#4a3a45" position={[0, -6, 2]} rotation={[-Math.PI * 0.35, 0, 0]} scale={[16, 3, 1]} />
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

  return (
    <div className="w-full h-full min-h-[500px] relative bg-[#050505] overflow-hidden">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 4.2], fov: 32 }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 4.2]} fov={32} />
        {/* Ambient down from 0.35: the window interior in the reference sits at
            L 45-50 with a spread of 5, so the shadowed side of the slab is
            genuinely dark and a flat ambient term washes it out. */}
        <ambientLight intensity={0.12} />
        {/* Key from the upper right — the direction the photo's own key comes
            from (see StudioEnvironment). 1.05, not 0.9, because the fill it
            has to balance against was removed with the cyan point light. */}
        <directionalLight position={[3.4, 2.6, 3.8]} intensity={1.05} color="#fff6ec" />
        {/* The old cyan point light had no counterpart in the photo. This is a
            dim neutral bounce off the lower-left of the backdrop instead, at
            the colour the backdrop actually measures there (#4a3a45). */}
        <pointLight position={[-1.8, -1.6, 1.6]} intensity={0.28} color="#c8b4c0" />

        <StudioEnvironment />
        <MovingHighlights />
        <Backdrop height={9} />

        <group
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <Slab
            card={card}
            quality="hero"
            intensity={1.15}
            flipped={flipped}
            active={hovered}
            cardHandlers={handlers}
          />
        </group>

        <FinishBloom />
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

function FinishBloom() {
  const finishType = useVaultStore((s) => s.finishType);
  /* Threshold 0.9 caught essentially nothing on the reference card — only
   * 7.2 % of its pixels exceed 0.75 and the histogram tops out at 0.93, so
   * there is no blown highlight to bloom. 0.78 sits just above the art's
   * 75th percentile (0.49) and its 93rd (0.75), and the intensities come down
   * by roughly a third to match. */
  const intensity =
    finishType === 'gold' ? 0.3 :
    finishType === 'holo' ? 0.26 :
    finishType === 'cracked-ice' ? 0.18 :
    0.05;
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={intensity} luminanceThreshold={0.78} luminanceSmoothing={0.2} radius={0.42} />
    </EffectComposer>
  );
}
