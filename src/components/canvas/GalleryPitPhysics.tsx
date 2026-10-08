'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider, RapierRigidBody } from '@react-three/rapier';
import type { ComponentRef } from 'react';
import * as THREE from 'three';
import { Environment, Lightformer } from '@react-three/drei';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Slab } from '@/components/canvas/slab/Slab';
import { SLAB_SPEC } from '@/components/canvas/slab/SlabSpec';
import { slabCards, type SlabCard } from '@/data/slabCards';

/* ------------------------------------------------------------------ *
 * Pit tuning
 * ------------------------------------------------------------------ */

const PIT_DEPTH = 3.2;
const WALL = 0.5;
const MIN_HALF_WIDTH = 0.9;
/** collider is the shell's box, a little generous so the rounded corners read */
const BODY = {
  w: SLAB_SPEC.w * 0.98,
  h: SLAB_SPEC.h * 0.99,
  d: SLAB_SPEC.zFront * 2 * 1.05,
};
const MASS = 0.62;

const DRAG = {
  stiffness: 90,
  damping: 16,
  maxToss: 15,
  mouseThreshold: 6,
  touchThreshold: 10,
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

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

function Card({
  card,
  position,
  index,
  bounds,
  onSelect,
}: {
  card: SlabCard;
  position: [number, number, number];
  index: number;
  bounds: PitBounds;
  onSelect: () => void;
}) {
  const rigidRef = useRef<RapierRigidBody>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const colliderRef = useRef<ComponentRef<typeof CuboidCollider>>(null);
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const grabbed = hovered || dragging;

  /** visual spin (hover flourish), mirrored onto the collider each frame */
  const visual = useRef({ spin: index * 0.7, scale: 1, appliedSpin: NaN, appliedScale: NaN });
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
    d.offset.set(t.x - event.point.x, t.y - event.point.y, 0);
    d.target.set(t.x, t.y, t.z);
    d.prev.copy(d.target);
    d.velocity.set(0, 0, 0);
    d.lastClient.set(event.clientX, event.clientY);
    d.lastTime = performance.now();

    body.enableCcd(true); // the spring can move a slab fast enough to tunnel
    body.lockRotations(true, true); // hold it face-on while it is in hand
    body.wakeUp();
    try {
      gl.domElement.setPointerCapture(event.pointerId);
    } catch {
      /* best effort */
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

      d.moved += Math.hypot(event.clientX - d.lastClient.x, event.clientY - d.lastClient.y);
      d.lastClient.set(event.clientX, event.clientY);
      const threshold = event.pointerType === 'touch' ? DRAG.touchThreshold : DRAG.mouseThreshold;
      if (!d.dragging && d.moved > threshold) d.dragging = true;

      const limitX = Math.max(bounds.x - BODY.w * 0.35, 0.35);
      const limitY = Math.max(bounds.y - BODY.h * 0.35, 0.6);
      d.target.set(
        _clamp(_planeHit.x + d.offset.x, -limitX, limitX),
        _clamp(_planeHit.y + d.offset.y, -limitY, limitY),
        d.planeZ
      );

      const now = performance.now();
      const dt = Math.max((now - d.lastTime) / 1000, 1 / 240);
      _sample.subVectors(d.target, d.prev).divideScalar(dt);
      d.velocity.lerp(_sample, 0.35);
      d.prev.copy(d.target);
      d.lastTime = now;
    };

    const release = (event: PointerEvent | null, cancelled = false) => {
      const d = drag.current;
      if (!d.active || (event && event.pointerId !== d.pointerId)) return;
      d.active = false;
      const body = rigidRef.current;
      if (body) {
        body.enableCcd(false);
        body.lockRotations(false, true);
        if (d.dragging && !cancelled) {
          const mass = body.mass() || MASS;
          const current = body.linvel();
          _sample.set(current.x, current.y, 0).lerp(d.velocity, 0.8).clampLength(0, DRAG.maxToss);
          body.applyImpulse({ x: (_sample.x - current.x) * mass, y: (_sample.y - current.y) * mass, z: 0 }, true);
          body.applyTorqueImpulse(
            { x: -_sample.y * mass * 0.02, y: 0, z: -_sample.x * mass * 0.05 },
            true
          );
        }
      }
      setDragging(false);
      if (!cancelled && !d.dragging) onSelect();
    };

    const onUp = (e: PointerEvent) => release(e);
    const onCancel = (e: PointerEvent) => release(e, true);
    const onBlur = () => release(null, true);
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

    // spring the held slab toward the pointer
    if (d.active && body) {
      const p = body.translation();
      const vel = body.linvel();
      const mass = body.mass() || MASS;
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

    // hover flourish: a slow turn and a small lift, mirrored onto the collider
    v.scale = THREE.MathUtils.damp(v.scale, grabbed ? 1.06 : 1, 8, delta);
    if (grabbed && !d.active) v.spin += delta * 0.5;

    // the visual spin rides the body's own rotation for a natural tumble:
    // we only add the extra flourish, and keep collider + mesh in step.
    const collider = colliderRef.current;
    const needsSync =
      !!collider &&
      (colliderDirty.current ||
        Math.abs(v.spin - v.appliedSpin) > DRAG.spinEpsilon ||
        Math.abs(v.scale - v.appliedScale) > DRAG.scaleEpsilon);
    if (collider && needsSync) {
      colliderDirty.current = false;
      v.appliedSpin = v.spin;
      v.appliedScale = v.scale;
      collider.setHalfExtents({
        x: (BODY.w / 2) * v.scale,
        y: (BODY.h / 2) * v.scale,
        z: (BODY.d / 2) * v.scale,
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
      linearDamping={dragging ? 4.5 : 1.6}
      angularDamping={1.1}
      mass={MASS}
      restitution={0.42}
      friction={0.62}
      gravityScale={dragging ? 0 : 1}
      canSleep={false}
      ccd={false}
    >
      <CuboidCollider ref={colliderRef} args={[BODY.w / 2, BODY.h / 2, BODY.d / 2]} />
      <group
        ref={bodyRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <Slab
          card={card}
          quality="cheap"
          intensity={0.95}
          active={grabbed}
          upgradeGlass={grabbed}
          spinSource={() => visual.current.spin}
          timeOffset={index * 1.7}
          cardHandlers={{ onPointerDown }}
        />
        {/* collider-sized hover target: the shell is thin, this is not */}
        <mesh
          visible={false}
          onPointerDown={onPointerDown}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[BODY.w * 1.04, BODY.h * 1.02, BODY.d * 1.6]} />
        </mesh>
      </group>
    </RigidBody>
  );
}

/* ------------------------------------------------------------------ *
 * Pit shell
 * ------------------------------------------------------------------ */

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
      <RigidBody type="fixed" position={[0, 0, -(PIT_DEPTH / 2 + WALL)]}>
        <CuboidCollider args={[bounds.x + WALL, bounds.y + WALL, WALL]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, 0, PIT_DEPTH / 2 + WALL]}>
        <CuboidCollider args={[bounds.x + WALL, bounds.y + WALL, WALL]} />
      </RigidBody>
    </>
  );
}

/** A small studio for the pit: cheap glass still needs something to reflect. */
function PitEnvironment() {
  return (
    <Environment resolution={128} frames={1} environmentIntensity={0.75}>
      <Lightformer form="rect" intensity={2.4} color="#ffffff" position={[0, 4, -5]} scale={[10, 2, 1]} />
      <Lightformer form="rect" intensity={1.4} color="#dce8ff" position={[-5, 0, 2]} scale={[8, 2, 1]} />
      <Lightformer form="rect" intensity={1.2} color="#ffe6d6" position={[5, 0, 2]} scale={[8, 2, 1]} />
      <Lightformer form="ring" intensity={2.6} color="#FF4D00" position={[-3, 2, 1]} scale={2.4} target={[0, 0, 0]} />
    </Environment>
  );
}

function Scene({ cards }: { cards: SlabCard[] }) {
  const viewport = useThree((s) => s.viewport);
  const bounds: PitBounds = useMemo(
    () => ({
      x: Math.max(viewport.width / 2, MIN_HALF_WIDTH),
      y: Math.max(viewport.height / 2, SLAB_SPEC.h * 0.75),
    }),
    [viewport.width, viewport.height]
  );

  // a jittered 3D deck dropped from the top of the pit
  const spawns = useMemo(() => {
    const rng = mulberry32(0x5eed);
    const halfW = Math.max(bounds.x - BODY.w * 0.7, 0.3);
    const top = Math.max(bounds.y - BODY.h * 0.6, 0.6);
    const bottom = -bounds.y + BODY.h * 0.5;
    const cols = Math.max(1, Math.floor((halfW * 2 + BODY.w * 0.1) / (BODY.w * 1.12)));
    const gap = Math.max(BODY.d * 1.15, 0.06);
    const rows = Math.max(1, Math.floor((top - (bottom + BODY.h * 0.5)) / gap));
    const depthRange = Math.max(PIT_DEPTH / 2 - WALL - BODY.d, BODY.d * 2);
    const layers = Math.max(1, Math.floor((depthRange * 2) / (BODY.d * 2.2)));
    return cards.map((_, i) => {
      const col = i % cols;
      const lane = Math.floor(i / cols);
      const row = lane % rows;
      const layer = Math.floor(lane / rows) % layers;
      const x = cols === 1 ? 0 : -halfW + (col / (cols - 1)) * halfW * 2;
      const y = top - row * gap;
      const z = layers === 1 ? 0 : (layer / (layers - 1) - 0.5) * depthRange * 1.7;
      return [
        x + (rng() - 0.5) * 0.08,
        y + (rng() - 0.5) * 0.05,
        z + (rng() - 0.5) * 0.06,
      ] as [number, number, number];
    });
  }, [cards, bounds.x, bounds.y]);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 6, 6]} intensity={0.9} />
      <directionalLight position={[-5, -2, 3]} intensity={0.35} color="#FF4D00" />
      <PitEnvironment />
      <Physics gravity={[0, -2.6, 0]}>
        <Walls bounds={bounds} />
        {cards.map((card, i) => (
          <Card
            key={card.id}
            card={card}
            position={spawns[i] || [0, 2, 0]}
            index={i}
            bounds={bounds}
            onSelect={() => document.getElementById('forge')?.scrollIntoView({ behavior: 'smooth' })}
          />
        ))}
      </Physics>
    </>
  );
}

export default function GalleryPitPhysics({ cards = slabCards }: { cards?: SlabCard[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
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
      {/* close enough that a 1.66-tall slab reads as a slab, wide enough that
          the whole deck is in frame when it pours */}
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <Scene cards={cards} />
      </Canvas>

      <div className="absolute top-0 left-0 right-0 p-3 flex justify-between pointer-events-none">
        <div className="font-mono text-[10px] tracking-widest text-[#F5F3EF]/60 bg-black/70 px-3 py-1.5 border border-white/10 backdrop-blur">
          RAPIER PHYSICS • {cards.length} SLABS • MASS {MASS} • RESTITUTION 0.42
        </div>
        <div className="font-mono text-[10px] text-[#FF4D00] bg-black/70 px-3 py-1.5 border border-[#FF4D00]/30 backdrop-blur animate-pulse">
          ● DRAG • TOSS • COLLIDE • CLICK → FORGE
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <div className="flex justify-between font-mono text-[9px] text-[#F5F3EF]/40">
          <span>Shared geometry + materials • glass upgrades while a slab is held</span>
          <span className="text-[#F5F3EF]/60">Drag to toss • tap to forge one like it</span>
        </div>
      </div>
    </div>
  );
}
