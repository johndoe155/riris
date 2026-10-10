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
import { paletteEngine, paletteFromArtwork, usePaletteSnapshot } from '@/components/canvas/slab/paletteEngine';

/**
 * Long strip lights are what real plastic shows: a soft body reflection with
 * one hard streak down the edge.
 *
 * Tuned to the reference, which is a neutral studio with the key off to the
 * upper right: the case's face measures #91808c with a #baa9b5 top strip, i.e.
 * a mauve-neutral acrylic under light that carries no hue of its own. The
 * orange ring and cyan circle an earlier version added were the single biggest
 * source of the case's colour cast — nothing in the photo supports them — so
 * the rig is now one soft key, a cool fill and a dim bounce, all near-neutral
 * with the faintest mauve.
 *
 * The eight former colours are palette-driven: `colors` carries the derived
 * family (a near-neutral gel of it, so the measured material tones stay in
 * charge), and any change re-bakes the 256 px cube environment — which is why
 * the Forge feeds this component a throttled palette snapshot rather than the
 * per-frame palette.
 */
function StudioEnvironment({ colors, envRotation }: { colors: string[]; envRotation: [number, number, number] }) {
  const c = (i: number) => colors[i] ?? '#ffffff';
  return (
    <Environment resolution={256} frames={1} environmentIntensity={2.4} environmentRotation={envRotation}>
      <Lightformer form="rect" intensity={2.2} color={c(0)} position={[5.5, 5, -3]} rotation={[Math.PI * 0.12, 0, -Math.PI * 0.16]} scale={[13, 2.4, 1]} />
      <Lightformer form="rect" intensity={0.4} color={c(1)} position={[-6, 1.5, -3]} rotation={[0, Math.PI * 0.32, 0]} scale={[12, 2.6, 1]} />
      <Lightformer form="rect" intensity={0.5} color={c(2)} position={[0, -6, 2]} rotation={[-Math.PI * 0.4, 0, 0]} scale={[16, 3, 1]} />
      {/* a narrow vertical strip: the hairline the moulding's bevel catches */}
      <Lightformer form="rect" intensity={1.1} color={c(3)} position={[3.2, 0, 3]} rotation={[0, -Math.PI * 0.18, 0]} scale={[0.7, 7, 1]} />
      {/* overhead softbox: the long body reflection that runs down the apron and
          turns on the clearcoat — the reference's bright top strip */}
      <Lightformer form="rect" intensity={1.3} color={c(4)} position={[0, 6, 2]} rotation={[-Math.PI / 2.2, 0, 0]} scale={[12, 3.5, 1]} />
      {/* faint counter-strip on the left so the dark chamfer still carries a
          hairline of reflected light instead of reading flat */}
      <Lightformer form="rect" intensity={0.8} color={c(5)} position={[-3.4, 0, 3]} rotation={[0, Math.PI * 0.2, 0]} scale={[0.5, 7, 1]} />
      {/* rear-side fill: every front-hemisphere former above left the case's
          BACK-facing normals an almost empty environment to sample, which is
          why the casing read flat and darker under the 180-degree orbit. A
          soft key and a narrow strip mirrored behind give the rear the same
          specular vocabulary (a long body streak plus a hard hairline) at
          about a third of the front's intensity. Lightformers aim at the
          scene origin by default, so these face the case; they live wholly
          in the rear hemisphere, so the front look is untouched. */}
      <Lightformer form="rect" intensity={0.7} color={c(6)} position={[-4.5, 4.5, -4]} scale={[9, 2.2, 1]} />
      <Lightformer form="rect" intensity={0.65} color={c(7)} position={[-3.2, 0, -3.2]} scale={[0.6, 7, 1]} />
    </Environment>
  );
}

/**
 * Rotates the baked environment with the pointer, so the strip highlights
 * slide across the glass instead of sitting still. No re-bake and no React
 * state: the renderer reads scene.environmentRotation every frame, and
 * applyProps writes through to the scene's own Euler. The same values are
 * mirrored into `envRotation`, the array <Environment> re-applies whenever it
 * re-bakes for the palette — without that mirror a palette re-bake would
 * reset the rotation to zero and the highlights would stutter.
 */
/**
 * The environment rotation, shared between MovingHighlights (which writes it
 * every frame) and <Environment> (which re-applies it whenever a palette
 * change forces a re-bake). Module scope on purpose: it is renderer state,
 * not React state, and only one Forge canvas is ever mounted.
 */
const ENV_ROTATION: [number, number, number] = [0, 0, 0];

function MovingHighlights() {
  const scene = useThree((s) => s.scene);
  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const p = state.pointer; // -1..1, R3F keeps this updated
    const rot = scene.environmentRotation;
    const x = THREE.MathUtils.damp(rot.x, -p.y * 0.22, 3, dt);
    const y = THREE.MathUtils.damp(rot.y, p.x * 0.3, 3, dt);
    ENV_ROTATION[0] = x;
    ENV_ROTATION[1] = y;
    ENV_ROTATION[2] = 0;
    applyProps(scene, { environmentRotation: [x, y, 0] });
  });
  return null;
}

/**
 * The palette's continuous half of the rig: steps the engine, then writes the
 * live palette into the scene background and the two lights. Runs at a
 * negative frame priority so every other consumer (materials, the void, the
 * foil shader) reads an already-advanced palette this frame.
 */
function PaletteSceneRig({
  bgRef,
  ambientRef,
  keyRef,
}: {
  bgRef: React.RefObject<THREE.Color | null>;
  ambientRef: React.RefObject<THREE.AmbientLight | null>;
  keyRef: React.RefObject<THREE.DirectionalLight | null>;
}) {
  useFrame((_, delta) => {
    paletteEngine.step(Math.min(delta, 1 / 30));
    const pal = paletteEngine.current;
    bgRef.current?.set(pal.sceneBg);
    ambientRef.current?.color.set(pal.ambient);
    keyRef.current?.color.set(pal.key);
  }, -10);
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

  /* ---- the dynamic palette: derive it from the SELECTED artwork ----
   * The Forge's default slab is the measured reference, so with nothing
   * selected the engine stays on REFERENCE_PALETTE and the scene is the
   * calibrated reference look, bit for bit. Choosing a preset or uploading
   * an image derives a palette and the whole scene lerps to it; resetting
   * glides back. */
  const artSource = nftData?.image ?? null;
  useEffect(() => {
    let live = true;
    if (!artSource) {
      paletteEngine.setTarget(null);
      return;
    }
    paletteFromArtwork(artSource).then((pal) => {
      if (live) paletteEngine.setTarget(pal);
    });
    return () => {
      live = false;
    };
  }, [artSource]);

  // throttled snapshot: the Lightformer environment re-bakes on re-render and
  // the HUD label's ink follows the contrast rule
  const snap = usePaletteSnapshot(paletteEngine, 80);
  const envColors = useMemo(
    () => [snap.envKey, snap.envFill, snap.envBounce, snap.envHair, snap.envSoftbox, snap.envCounter, snap.envRearKey, snap.envRearStrip],
    [snap]
  );

  const bgRef = useRef<THREE.Color | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const keyRef = useRef<THREE.DirectionalLight | null>(null);

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
        <color attach="background" args={['#352334']} ref={bgRef} />
        {/* Long-lens framing keeps the case filling the portrait Forge canvas while
            retaining the reference's nearly orthographic straight-on proportions. */}
        <PerspectiveCamera makeDefault position={[0, 0, 3.2]} fov={38} near={0.1} far={60} />
        {/* scaled ~2.7x from the first rig so front-facing surfaces return their measured tones (scripts/analysis/_tones.mjs) */}
        <ambientLight ref={ambientRef} intensity={1.5} />
        <directionalLight ref={keyRef} position={[4, 5, 6]} intensity={2.1} />

        <PaletteSceneRig bgRef={bgRef} ambientRef={ambientRef} keyRef={keyRef} />
        <StudioEnvironment colors={envColors} envRotation={ENV_ROTATION} />
        <MovingHighlights />
        {/* deep stationary void: fixed ray directions, no edges to reveal */}
        <VoidBackdrop height={HERO_WALL_HEIGHT} {...HERO_BACKDROP} driver={paletteEngine} />

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
            palette={paletteEngine}
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
        <div className="font-mono text-[9px] transition-colors duration-500" style={{ color: `${snap.uiInk}4D` }}>
          SHADER: GLSL • {`${card.title}`} • {card.style.toUpperCase()}
          {snap.id !== 'reference' ? ` • PALETTE ${snap.mood.toUpperCase()}` : ''}
        </div>
        <div className="font-mono text-[9px] text-[#FF4D00]">TRUE OPTICAL PREVIEW</div>
      </div>
    </div>
  );
}
