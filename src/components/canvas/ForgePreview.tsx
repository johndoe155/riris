'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, applyProps } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { OrbitControls, PerspectiveCamera, Environment, Lightformer } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useVaultStore } from '@/store/useVaultStore';
import { Slab } from '@/components/canvas/slab/Slab';
import { Backdrop, HERO_BACKDROP, HERO_WALL_HEIGHT } from '@/components/canvas/slab/Backdrop';
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
  /*
   * Rebuilt from `reference-image.jpg`'s own lighting evidence:
   *   - the case's top edge hairline, the blank plate's sheen and both lip bars
   *     are bright => one broad overhead softbox;
   *   - the backdrop's right column is up to +74 luma over its left at the top
   *     of frame => the key sits high and to the right;
   *   - the cover reads a flat luma 233 across its whole face => a large, weak
   *     frontal fill, not a raking light;
   *   - the rim's bottom steps and the floor smear are pink => a bounce card
   *     below, in the sweep's own hue.
   * Nothing coloured: the photo's case carries the wall's mauve by reflection,
   * not from a tinted source, so every former is near-neutral or pink-grey.
   */
  return (
    <Environment resolution={256} frames={1} environmentIntensity={2.2}>
      {/* overhead softbox: the top hairline + plate sheen + lip bars */}
      <Lightformer form="rect" intensity={2.6} color="#fff5fb" position={[0.4, 6, 1.2]} rotation={[-Math.PI / 2.15, 0, 0]} scale={[10, 5, 1]} />
      {/* the key, high right: the backdrop's horizontal lift and the rim's lit side */}
      <Lightformer form="rect" intensity={1.5} color="#f6e9f3" position={[6, 3.4, 2.2]} rotation={[0, -Math.PI / 2.6, -0.2]} scale={[7, 4, 1]} />
      {/* large weak frontal fill: the cover's flat 233 */}
      <Lightformer form="rect" intensity={0.75} color="#eef1f7" position={[0, 0.2, 7]} rotation={[0, 0, 0]} scale={[7, 7, 1]} />
      {/* pink bounce off the sweep's floor */}
      <Lightformer form="rect" intensity={0.55} color="#c98bb4" position={[0, -5.4, 2.4]} rotation={[Math.PI / 2.3, 0, 0]} scale={[12, 4, 1]} />
      {/* two narrow vertical strips: the hairlines the rim's bevels catch */}
      <Lightformer form="rect" intensity={1.2} color="#ffffff" position={[3.4, 0, 3]} rotation={[0, -Math.PI / 2.1, 0]} scale={[0.5, 7, 1]} />
      <Lightformer form="rect" intensity={0.7} color="#f2e6f0" position={[-3.4, 0, 3]} rotation={[0, Math.PI / 2.1, 0]} scale={[0.5, 7, 1]} />
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
      {/*
        A long lens. The reference is effectively orthographic — its cone is
        under two degrees wide — and at fov 32 the near edge of the case
        projected ~40 px wider than the far one on a 665 px case. fov 16 keeps
        a little parallax for the orbit while holding the measured proportions.
      */}
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 7.4], fov: 16 }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 7.4]} fov={16} />
        {/* the photo's flats: overhead key, high-right key, weak frontal fill */}
        <ambientLight intensity={1.15} />
        <directionalLight position={[3.5, 6, 4]} intensity={1.7} />
        <directionalLight position={[0, 0.5, 7]} intensity={0.55} />
        <directionalLight position={[0, -4, 3]} intensity={0.3} color="#d9a2c4" />

        <StudioEnvironment />
        <MovingHighlights />
        <Backdrop height={HERO_WALL_HEIGHT} aspect={1} {...HERO_BACKDROP} />

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
  const intensity =
    finishType === 'gold' ? 0.85 :
    finishType === 'holo' ? 0.7 :
    finishType === 'cracked-ice' ? 0.4 :
    0.3;
  return (
    <EffectComposer multisampling={0}>
      {/* threshold at the hairlines' luma (230/255 = 0.9): only the case's
          edge fire blooms, never the cover (233 sRGB but tone-mapped under) */}
      <Bloom mipmapBlur intensity={intensity} luminanceThreshold={0.88} luminanceSmoothing={0.12} radius={0.62} />
    </EffectComposer>
  );
}
