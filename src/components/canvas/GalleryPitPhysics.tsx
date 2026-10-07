'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider, RapierRigidBody, RapierCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { galleryData } from '@/data/gallery';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HoloCardMaterial, useCardPointer } from '@/components/canvas/HoloMaterial';

/** Card body in world units. */
const CARD = { w: 1.6, h: 2.2, d: 0.1 } as const;
const CARD_ASPECT = CARD.w / CARD.h;
/** Half-extent of the floor/ceiling along z — the pit's "depth". */
const PIT_DEPTH = 4;
/** Wall half-thickness. */
const WALL = 0.5;
/** Where the side walls sit when the viewport is tiny. */
const MIN_HALF_WIDTH = 0.9;

const DRAG = {
  /** spring constant (1/s²) and damping (1/s) for the pointer grab */
  stiffness: 90,
  damping: 16,
  /** release speed cap, world units per second */
  maxToss: 14,
  /** screen-space travel that turns a tap into a drag */
  mouseThreshold: 6,
  touchThreshold: 10,
  /** slowest spin worth pushing to the collider (radians) */
  spinEpsilon: 0.02,
  scaleEpsilon: 0.003,
};

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _planeHit = new THREE.Vector3();
const _sample = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _clamp = THREE.MathUtils.clamp;

/** Deterministic spawn so the pit doesn't reshuffle on every render. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PitBounds {
  x: number;
  y: number;
}

function Card({
  image,
  finish,
  position,
  index,
  bounds,
  onSelect,
}: {
  image: string;
  finish: 'base' | 'holo' | 'cracked-ice' | 'gold';
  position: [number, number, number];
  index: number;
  bounds: PitBounds;
  onSelect: () => void;
}) {
  const rigidRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const texture = useTexture(image);

  const { pointer, hovered, bind } = useCardPointer();
  const [dragging, setDragging] = useState(false);
  const grabbed = hovered || dragging;

  // Visual spin/scale lives on the mesh, so the collider has to be told about
  // it explicitly — otherwise a card hovers 18% larger than it collides.
  const visual = useRef({ spin: index * 0.7, scale: 1, appliedSpin: NaN, appliedScale: NaN });
  /** `CuboidCollider` re-writes the collider transform on every re-render. */
  const colliderDirty = useRef(true);
  useEffect(() => {
    colliderDirty.current = true;
  });

  const drag = useRef({
    active: false,
    dragging: false,
    pointerId: -1,
    moved: 0,
    planeZ: 0,
    /** drag plane: the z slice the card was grabbed in */
    plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    offset: new THREE.Vector3(),
    target: new THREE.Vector3(),
    prev: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    lastClient: new THREE.Vector2(),
    lastTime: 0,
  });

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    const body = rigidRef.current;
    if (!body) return;
    event.stopPropagation();

    const d = drag.current;
    const t = body.translation();
    d.active = true;
    d.dragging = false;
    d.pointerId = event.pointerId;
    d.moved = 0;
    d.planeZ = t.z;
    d.plane.constant = -d.planeZ;
    // keep the grab point under the cursor instead of snapping the centre to it
    d.offset.set(t.x - event.point.x, t.y - event.point.y, 0);
    d.target.set(t.x, t.y, t.z);
    d.prev.copy(d.target);
    d.velocity.set(0, 0, 0);
    d.lastClient.set(event.clientX, event.clientY);
    d.lastTime = performance.now();

    body.enableCcd(true); // the spring can move a 0.1 slab fast enough to tunnel
    body.lockRotations(true, true); // hold it face-on while it's in hand
    body.wakeUp();

    try {
      gl.domElement.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    setDragging(true);
  };

  useEffect(() => {
    const canvas = gl.domElement;

    const onMove = (event: PointerEvent) => {
      const d = drag.current;
      if (!d.active || event.pointerId !== d.pointerId) return;

      const rect = canvas.getBoundingClientRect();
      _ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );
      _raycaster.setFromCamera(_ndc, camera);
      if (!_raycaster.ray.intersectPlane(d.plane, _planeHit)) return;

      // Travel threshold: a tap stays a tap, so it still opens the Forge.
      d.moved += Math.hypot(event.clientX - d.lastClient.x, event.clientY - d.lastClient.y);
      d.lastClient.set(event.clientX, event.clientY);
      const threshold = event.pointerType === 'touch' ? DRAG.touchThreshold : DRAG.mouseThreshold;
      if (!d.dragging && d.moved > threshold) d.dragging = true;

      const limitX = Math.max(bounds.x - CARD.w * 0.3, 0.3);
      const limitY = Math.max(bounds.y - CARD.h * 0.3, 0.5);
      d.target.set(
        _clamp(_planeHit.x + d.offset.x, -limitX, limitX),
        _clamp(_planeHit.y + d.offset.y, -limitY, limitY),
        d.planeZ
      );

      // Smoothed world velocity — this is what gets thrown on release.
      const now = performance.now();
      const dt = Math.max((now - d.lastTime) / 1000, 1 / 240);
      _sample.subVectors(d.target, d.prev).divideScalar(dt);
      d.velocity.lerp(_sample, 0.35);
      d.prev.copy(d.target);
      d.lastTime = now;
    };

    const release = (event: PointerEvent, cancelled = false) => {
      const d = drag.current;
      if (!d.active || (event && event.pointerId !== d.pointerId)) return;
      d.active = false;

      const body = rigidRef.current;
      if (body) {
        body.enableCcd(false);
        body.lockRotations(false, true);
        if (d.dragging && !cancelled) {
          const mass = body.mass() || 0.6;
          const current = body.linvel();
          // Impulse on release: meet the flick, capped so it can't tunnel.
          _sample.set(current.x, current.y, 0).lerp(d.velocity, 0.75).clampLength(0, DRAG.maxToss);
          body.applyImpulse(
            { x: (_sample.x - current.x) * mass, y: (_sample.y - current.y) * mass, z: 0 },
            true
          );
          // a touch of spin so a flick tumbles
          body.applyTorqueImpulse({ x: 0, y: 0, z: -_sample.x * mass * 0.08 }, true);
        }
      }

      setDragging(false);
      if (!cancelled && !d.dragging) onSelect(); // it was a tap: forge one like it
    };

    const onUp = (event: PointerEvent) => release(event);
    const onCancel = (event: PointerEvent) => release(event, true);
    const onBlur = () => release(null as unknown as PointerEvent, true);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
    };
  }, [bounds.x, bounds.y, camera, gl, onSelect]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    const body = rigidRef.current;
    const d = drag.current;
    const v = visual.current;

    // --- pointer spring while held ------------------------------------
    if (d.active && body) {
      const p = body.translation();
      const vel = body.linvel();
      const mass = body.mass() || 0.6;
      // F = m(k·x − c·v), integrated as an impulse
      body.applyImpulse(
        {
          x: ((d.target.x - p.x) * DRAG.stiffness - vel.x * DRAG.damping) * mass * delta,
          y: ((d.target.y - p.y) * DRAG.stiffness - vel.y * DRAG.damping) * mass * delta,
          z: ((d.target.z - p.z) * DRAG.stiffness - vel.z * DRAG.damping) * mass * delta,
        },
        true
      );
      const spin = body.angvel();
      body.setAngvel({ x: spin.x * 0.85, y: spin.y * 0.85, z: spin.z * 0.85 }, true);
    }

    // --- visual spin + lift, mirrored onto the collider ---------------
    v.scale = THREE.MathUtils.damp(v.scale, grabbed ? 1.18 : 1, 8, delta);
    v.spin += delta * (grabbed ? 0.9 : 0.06);

    const mesh = meshRef.current;
    if (mesh) {
      mesh.rotation.y = v.spin;
      mesh.scale.setScalar(v.scale);
    }

    const collider = colliderRef.current;
    const needsSync =
      !!collider &&
      (colliderDirty.current || // a re-render resets the collider transform
        Math.abs(v.spin - v.appliedSpin) > DRAG.spinEpsilon ||
        Math.abs(v.scale - v.appliedScale) > DRAG.scaleEpsilon);
    if (collider && needsSync) {
      colliderDirty.current = false;
      v.appliedSpin = v.spin;
      v.appliedScale = v.scale;
      collider.setHalfExtents({
        x: (CARD.w / 2) * v.scale,
        y: (CARD.h / 2) * v.scale,
        z: (CARD.d / 2) * v.scale,
      });
      _quat.setFromAxisAngle(_up, v.spin);
      collider.setRotationWrtParent(_quat);
    }
  });

  return (
    <RigidBody
      ref={rigidRef}
      position={position}
      colliders={false}
      linearDamping={dragging ? 4 : 1.8}
      angularDamping={1.2}
      mass={0.6}
      restitution={0.7}
      friction={0.5}
      gravityScale={dragging ? 0 : 1}
      canSleep={false}
    >
      <CuboidCollider ref={colliderRef} args={[CARD.w / 2, CARD.h / 2, CARD.d / 2]} />
      <mesh ref={meshRef} onPointerDown={onPointerDown} {...bind}>
        <boxGeometry args={[CARD.w, CARD.h, CARD.d]} />
        <HoloCardMaterial
          image={texture}
          finish={finish}
          pointer={pointer}
          hovered={grabbed}
          intensity={1}
          hoverBoost={1.5}
          cardAspect={CARD_ASPECT}
          timeOffset={index * 1.7}
        />
      </mesh>
    </RigidBody>
  );
}

/**
 * Walls track the camera frustum, so the same pit works on a 320px phone and a
 * 4K desktop instead of parking the slabs at a fixed ±7.5.
 */
function Walls({ bounds }: { bounds: PitBounds }) {
  return (
    <>
      <RigidBody type="fixed" position={[0, -(bounds.y + WALL), 0]}>
        <CuboidCollider args={[bounds.x + WALL, WALL, PIT_DEPTH]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, bounds.y + WALL, 0]}>
        <CuboidCollider args={[bounds.x + WALL, WALL, PIT_DEPTH]} />
      </RigidBody>
      <RigidBody type="fixed" position={[-(bounds.x + WALL), 0, 0]}>
        <CuboidCollider args={[WALL, bounds.y + WALL * 2, PIT_DEPTH]} />
      </RigidBody>
      <RigidBody type="fixed" position={[bounds.x + WALL, 0, 0]}>
        <CuboidCollider args={[WALL, bounds.y + WALL * 2, PIT_DEPTH]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, 0, -(PIT_DEPTH / 2 - WALL)]}>
        <CuboidCollider args={[bounds.x + WALL, bounds.y + WALL, WALL]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, 0, PIT_DEPTH / 2 - WALL]}>
        <CuboidCollider args={[bounds.x + WALL, bounds.y + WALL, WALL]} />
      </RigidBody>
    </>
  );
}

function Scene({ cards }: { cards: typeof galleryData }) {
  const viewport = useThree((state) => state.viewport);
  const bounds: PitBounds = useMemo(
    () => ({
      x: Math.max(viewport.width / 2, MIN_HALF_WIDTH),
      y: Math.max(viewport.height / 2, CARD.h * 0.75),
    }),
    [viewport.width, viewport.height]
  );

  // A jittered 3D deck, dropped from the top of the pit. Cards outnumber the
  // floor space, so the lattice spreads them across the pit's depth as well —
  // the solver then fans them out sideways instead of resolving one deep,
  // degenerate overlap. Seeded, so a re-render can't reshuffle the pile.
  const spawns = useMemo(() => {
    const rng = mulberry32(0x5eed);
    const halfW = Math.max(bounds.x - CARD.w * 0.6, 0.35);
    const top = Math.max(bounds.y - CARD.h * 0.5 - 0.2, 0.4);
    const bottom = -bounds.y + CARD.h * 0.5;
    const cols = Math.max(1, Math.floor((halfW * 2 + CARD.w * 0.12) / (CARD.w * 1.06)));
    const gap = Math.max((top - bottom) / 16, 0.18);
    const rows = Math.max(1, Math.floor((top - bottom) / gap) + 1);
    const depthRange = Math.max(PIT_DEPTH / 2 - WALL - CARD.d / 2, CARD.d);
    const layers = Math.max(1, Math.floor((depthRange * 2) / (CARD.d * 1.5)));
    return cards.map((_, i) => {
      const col = i % cols;
      const lane = Math.floor(i / cols);
      const row = lane % rows;
      const layer = Math.floor(lane / rows) % layers;
      const x = cols === 1 ? 0 : -halfW + (col / (cols - 1)) * halfW * 2;
      const y = top - row * gap;
      const z = layers === 1 ? 0 : (layer / (layers - 1) - 0.5) * depthRange * 1.8;
      return [
        x + (rng() - 0.5) * 0.14,
        y + (rng() - 0.5) * 0.1,
        z + (rng() - 0.5) * 0.06,
      ] as [number, number, number];
    });
  }, [cards, bounds.x, bounds.y]);

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <directionalLight position={[-5, -2, 3]} intensity={0.5} color="#FF4D00" />
      <Physics gravity={[0, -1.5, 0]}>
        <Walls bounds={bounds} />
        {cards.map((card, i) => (
          <Card
            key={card.id}
            image={card.image}
            finish={card.style}
            position={spawns[i] || [0, 2, 0]}
            index={i}
            bounds={bounds}
            onSelect={() => {
              document.getElementById('forge')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        ))}
      </Physics>
    </>
  );
}

export default function GalleryPitPhysics({ cards }: { cards: typeof galleryData }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // The canvas swap (0 -> 70vh placeholder -> 75vh canvas) lands a frame or
    // two after the viewMode flip — re-measure ScrollTriggers once it's real.
    let refresh = 0;
    const swap = requestAnimationFrame(() => {
      setMounted(true);
      refresh = requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    return () => {
      cancelAnimationFrame(swap);
      cancelAnimationFrame(refresh);
    };
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-[70vh] bg-[#050505] border border-[#1A1A1A] grid place-items-center">
        <div className="font-mono text-[10px] tracking-widest text-[#F5F3EF]/30">INITIALIZING RAPIER • LOADING PHYSICS...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-[75vh] relative border border-[#1A1A1A] bg-[#050505] overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <Scene cards={cards} />
      </Canvas>

      <div className="absolute top-0 left-0 right-0 p-3 flex justify-between pointer-events-none">
        <div className="font-mono text-[10px] tracking-widest text-[#F5F3EF]/60 bg-black/70 px-3 py-1.5 border border-white/10 backdrop-blur">
          RAPIER PHYSICS • {cards.length} SLABS • MASS 0.6 • RESTITUTION 0.7
        </div>
        <div className="font-mono text-[10px] text-[#FF4D00] bg-black/70 px-3 py-1.5 border border-[#FF4D00]/30 backdrop-blur animate-pulse">
          ● DRAG • TOSS • COLLIDE • CLICK → FORGE
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <div className="flex justify-between font-mono text-[9px] text-[#F5F3EF]/40">
          <span>Each card is a RigidBody with CuboidCollider • Walls follow the viewport</span>
          <span className="text-[#F5F3EF]/60">Drag to toss • tap to forge one like it</span>
        </div>
      </div>
    </div>
  );
}
