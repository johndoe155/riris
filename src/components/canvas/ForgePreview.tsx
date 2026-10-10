'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, applyProps } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls, PerspectiveCamera, Environment, Lightformer } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useVaultStore } from '@/store/useVaultStore';
import { Slab } from '@/components/canvas/slab/Slab';
import { VoidBackdrop, HERO_BACKDROP, HERO_WALL_HEIGHT } from '@/components/canvas/slab/Backdrop';
import { cardFromNft, DEFAULT_SLAB } from '@/data/slabCards';
import { DEFAULT_FORGE_PALETTE, extractForgePalette, type ForgePalette } from './forgePalette';

function lerpHex(a: string, b: string, t: number) {
  const ca = new THREE.Color(a); const cb = new THREE.Color(b);
  ca.lerp(cb, t);
  return `#${ca.getHexString()}`;
}

function lerpPalette(current: ForgePalette, target: ForgePalette, t: number): ForgePalette {
  return {
    ...current,
    backdrop: {
      dark: lerpHex(current.backdrop.dark, target.backdrop.dark, t),
      glow: lerpHex(current.backdrop.glow, target.backdrop.glow, t),
      pale: lerpHex(current.backdrop.pale, target.backdrop.pale, t),
    },
    surfaces: {
      shell: lerpHex(current.surfaces.shell, target.surfaces.shell, t),
      shellLight: lerpHex(current.surfaces.shellLight, target.surfaces.shellLight, t),
      face: lerpHex(current.surfaces.face, target.surfaces.face, t),
      tray: lerpHex(current.surfaces.tray, target.surfaces.tray, t),
      label: lerpHex(current.surfaces.label, target.surfaces.label, t),
      card: lerpHex(current.surfaces.card, target.surfaces.card, t),
      ridge: lerpHex(current.surfaces.ridge, target.surfaces.ridge, t),
      tab: lerpHex(current.surfaces.tab, target.surfaces.tab, t),
    },
    lights: {
      key: lerpHex(current.lights.key, target.lights.key, t),
      fill: lerpHex(current.lights.fill, target.lights.fill, t),
      bounce: lerpHex(current.lights.bounce, target.lights.bounce, t),
      specular: lerpHex(current.lights.specular, target.lights.specular, t),
    },
    shader: {
      base: lerpHex(current.shader.base, target.shader.base, t),
      cool: lerpHex(current.shader.cool, target.shader.cool, t),
      warm: lerpHex(current.shader.warm, target.shader.warm, t),
    },
    source: target.source,
  };
}

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
function StudioEnvironment({ palette }: { palette: ForgePalette }) {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={2.4}>
      <Lightformer form="rect" intensity={2.2} color={palette.lights.key} position={[5.5, 5, -3]} rotation={[Math.PI * 0.12, 0, -Math.PI * 0.16]} scale={[13, 2.4, 1]} />
      <Lightformer form="rect" intensity={0.4} color={palette.lights.fill} position={[-6, 1.5, -3]} rotation={[0, Math.PI * 0.32, 0]} scale={[12, 2.6, 1]} />
      <Lightformer form="rect" intensity={0.5} color={palette.lights.bounce} position={[0, -6, 2]} rotation={[-Math.PI * 0.4, 0, 0]} scale={[16, 3, 1]} />
      {/* a narrow vertical strip: the hairline the moulding's bevel catches */}
      <Lightformer form="rect" intensity={1.1} color={palette.lights.specular} position={[3.2, 0, 3]} rotation={[0, -Math.PI * 0.18, 0]} scale={[0.7, 7, 1]} />
      {/* overhead softbox: the long body reflection that runs down the apron and
          turns on the clearcoat — the reference's bright top strip */}
      <Lightformer form="rect" intensity={1.3} color={palette.lights.key} position={[0, 6, 2]} rotation={[-Math.PI / 2.2, 0, 0]} scale={[12, 3.5, 1]} />
      {/* faint counter-strip on the left so the dark chamfer still carries a
          hairline of reflected light instead of reading flat */}
      <Lightformer form="rect" intensity={0.8} color={palette.lights.fill} position={[-3.4, 0, 3]} rotation={[0, Math.PI * 0.2, 0]} scale={[0.5, 7, 1]} />
      {/* rear-side fill: every front-hemisphere former above left the case's
          BACK-facing normals an almost empty environment to sample, which is
          why the casing read flat and darker under the 180-degree orbit. A
          soft key and a narrow strip mirrored behind give the rear the same
          specular vocabulary (a long body streak plus a hard hairline) at
          about a third of the front's intensity. Lightformers aim at the
          scene origin by default, so these face the case; they live wholly
          in the rear hemisphere, so the front look is untouched. */}
      <Lightformer form="rect" intensity={0.7} color={palette.lights.fill} position={[-4.5, 4.5, -4]} scale={[9, 2.2, 1]} />
      <Lightformer form="rect" intensity={0.65} color={palette.lights.specular} position={[-3.2, 0, -3.2]} scale={[0.6, 7, 1]} />
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

function ForgeScene({ card, targetPalette, flipped, hovered, handlers, setHovered }: {
  card: typeof DEFAULT_SLAB;
  targetPalette: ForgePalette;
  flipped: boolean;
  hovered: boolean;
  handlers: { onDoubleClick: () => void };
  setHovered: (value: boolean) => void;
}) {
  const [palette, setPalette] = useState(DEFAULT_FORGE_PALETTE);
  const paletteRef = useRef(DEFAULT_FORGE_PALETTE);
  useFrame((_, delta) => {
    const next = lerpPalette(paletteRef.current, targetPalette, 1 - Math.exp(-3.8 * Math.min(delta, 1 / 30)));
    paletteRef.current = next;
    if (next.source !== palette.source || next.backdrop.glow !== palette.backdrop.glow) setPalette(next);
  });
  return (
    <>
      <color attach="background" args={[palette.backdrop.dark]} />
      <PerspectiveCamera makeDefault position={[0, 0, 3.2]} fov={38} near={0.1} far={60} />
      <ambientLight intensity={1.5} color={palette.lights.fill} />
      <directionalLight position={[4, 5, 6]} intensity={2.1} color={palette.lights.key} />
      <StudioEnvironment palette={palette} />
      <MovingHighlights />
      <VoidBackdrop height={HERO_WALL_HEIGHT} {...HERO_BACKDROP} top={palette.backdrop.pale} glow={palette.backdrop.glow} bottom={palette.backdrop.dark} />
      <group onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <Slab card={card} quality="hero" intensity={0.82} palette={palette} flipped={flipped} active={hovered} cardHandlers={handlers} />
      </group>
      <SpringOrbit />
    </>
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
  const [targetPalette, setTargetPalette] = useState(DEFAULT_FORGE_PALETTE);
  useEffect(() => {
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (live) setTargetPalette(extractForgePalette(image, card.art));
    };
    image.onerror = () => {
      if (live) setTargetPalette({ ...DEFAULT_FORGE_PALETTE, source: card.art });
    };
    image.src = card.art;
    return () => { live = false; };
  }, [card.art]);

  const toggleFlip = useCallback(() => setFlipped((f) => !f), []);
  const handlers = useMemo(() => ({ onDoubleClick: () => toggleFlip() }), [toggleFlip]);

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
        <ForgeScene card={card} targetPalette={targetPalette} flipped={flipped} hovered={hovered} setHovered={setHovered} handlers={handlers} />
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
