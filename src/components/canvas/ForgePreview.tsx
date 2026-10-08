'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { OrbitControls, PerspectiveCamera, Environment, Lightformer } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useVaultStore } from '@/store/useVaultStore';
import { Slab } from '@/components/canvas/slab/Slab';
import { Backdrop } from '@/components/canvas/slab/Backdrop';
import { cardFromNft, DEFAULT_SLAB } from '@/data/slabCards';

/**
 * The baked environment is rotated by the pointer, so highlights slide across
 * the glass instead of sitting still. `environmentRotation` is read by the
 * renderer every frame, so mutating one Euler object is all it takes - no
 * per-frame React state and no re-bake of the cubemap.
 */
const ENV_ROTATION = new THREE.Euler(0, 0, 0);

/**
 * Long strip lights are what real plastic shows: a soft body reflection with
 * one hard streak down the edge.
 */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.9} environmentRotation={ENV_ROTATION}>
      <Lightformer form="rect" intensity={2.6} color="#ffffff" position={[0, 5.5, -4]} rotation={[Math.PI * 0.1, 0, 0]} scale={[14, 1.6, 1]} />
      <Lightformer form="rect" intensity={1.8} color="#e8f1ff" position={[-6, 0.5, -3]} rotation={[0, Math.PI * 0.35, 0]} scale={[12, 2.2, 1]} />
      <Lightformer form="rect" intensity={1.5} color="#fff0e6" position={[6, -0.5, -3]} rotation={[0, -Math.PI * 0.35, 0]} scale={[12, 2.2, 1]} />
      <Lightformer form="ring" intensity={4} color="#FF4D00" position={[-4.5, 2.5, 2]} scale={3} target={[0, 0, 0]} />
      <Lightformer form="circle" intensity={3} color="#00E5FF" position={[4.5, -2, 1.5]} scale={2.4} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={0.7} color="#8fa2b8" position={[0, -6, 2]} rotation={[-Math.PI * 0.4, 0, 0]} scale={[16, 3, 1]} />
    </Environment>
  );
}

/** Rotates the baked environment with the pointer so the streaks slide. */
function MovingHighlights() {
  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const p = state.pointer; // -1..1, R3F keeps this updated
    ENV_ROTATION.x = THREE.MathUtils.damp(ENV_ROTATION.x, -p.y * 0.22, 3, dt);
    ENV_ROTATION.y = THREE.MathUtils.damp(ENV_ROTATION.y, p.x * 0.3, 3, dt);
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
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 5, 6]} intensity={0.9} />
        <pointLight position={[0, 2.2, 2.4]} intensity={0.5} color="#00E5FF" />

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
  const intensity =
    finishType === 'gold' ? 0.85 :
    finishType === 'holo' ? 0.7 :
    finishType === 'cracked-ice' ? 0.4 :
    0.12;
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={intensity} luminanceThreshold={0.9} luminanceSmoothing={0.18} radius={0.7} />
    </EffectComposer>
  );
}
