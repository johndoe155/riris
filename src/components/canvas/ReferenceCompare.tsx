'use client';
import { Suspense, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, useTexture, Line, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { Slab } from '@/components/canvas/slab/Slab';
import { SLAB_SPEC } from '@/components/canvas/slab/SlabSpec';
import { slabCards, type SlabCard } from '@/data/slabCards';

/* The reference photo is 1488×1484 with the slab occupying x 413..1077,
   y 191..1294 (measured). Scaling the plane so that box equals the slab's own
   world height lines the photo up with the 3D model exactly, which is what
   makes the slider a real proportion check rather than a vibe check. */
const REF_PX = { w: 1488, h: 1484, x0: 413, x1: 1077, y0: 191, y1: 1294 };
const SLAB_H = SLAB_SPEC.h;
const IMG_H = SLAB_H / ((REF_PX.y1 - REF_PX.y0) / REF_PX.h);
const IMG_W = IMG_H * (REF_PX.w / REF_PX.h);
const BOX_CX = ((REF_PX.x0 + REF_PX.x1) / 2 / REF_PX.w - 0.5) * IMG_W;
const BOX_CY = (0.5 - (REF_PX.y0 + REF_PX.y1) / 2 / REF_PX.h) * IMG_H;

/** measured features, in the slab's own normalized box (origin centre) */
const norm = (fx: number) => fx * SLAB_H - SLAB_H / 2; // from-image-top fraction → world y
const nx = (fx: number) => fx - 0.5;

const GUIDES: { label: string; points: [number, number][] }[] = [
  {
    label: 'slab',
    points: [
      [-0.5, SLAB_H / 2],
      [0.5, SLAB_H / 2],
      [0.5, -SLAB_H / 2],
      [-0.5, -SLAB_H / 2],
      [-0.5, SLAB_H / 2],
    ],
  },
  {
    label: 'card ring',
    points: [
      [nx(0.131), norm(0.289)],
      [nx(0.87), norm(0.289)],
      [nx(0.87), norm(0.918)],
      [nx(0.131), norm(0.918)],
      [nx(0.131), norm(0.289)],
    ],
  },
  {
    label: 'label plate',
    points: [
      [nx(0.0587), norm(0.0335)],
      [nx(0.941), norm(0.0335)],
      [nx(0.941), norm(0.17)],
      [nx(0.0587), norm(0.17)],
      [nx(0.0587), norm(0.0335)],
    ],
  },
  {
    label: 'window',
    points: [
      [nx(0.08), norm(0.19)],
      [nx(0.92), norm(0.19)],
      [nx(0.92), norm(0.955)],
      [nx(0.08), norm(0.955)],
      [nx(0.08), norm(0.19)],
    ],
  },
];

function PhotoOverlay({ opacity }: { opacity: number }) {
  const tex = useTexture('/reference.jpg');
  const map = useMemo(() => {
    const t = tex.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }, [tex]);
  if (opacity <= 0.001) return null;
  return (
    <mesh position={[BOX_CX, BOX_CY, 0.6]} renderOrder={30}>
      <planeGeometry args={[IMG_W, IMG_H]} />
      <meshBasicMaterial
        map={map}
        transparent
        opacity={opacity}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Guides({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <group position={[0, 0, 0.62]}>
      {GUIDES.map((g, i) => (
        <Line
          key={g.label}
          points={g.points.map(([x, y]) => [x, y, 0] as [number, number, number])}
          color={['#00E5FF', '#FF2D9B', '#FF4D00', '#7CFF6B'][i % 4]}
          lineWidth={1}
          transparent
          opacity={0.85}
          depthTest={false}
        />
      ))}
    </group>
  );
}

function StraightScene({ card, showPhoto, showGuides }: { card: SlabCard; showPhoto: number; showGuides: boolean }) {
  const dist = (SLAB_H * 1.5) / (2 * Math.tan((12 * Math.PI) / 180 / 2));
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, dist]} fov={12} near={1} far={60} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 6]} intensity={0.8} />
      <Environment resolution={256} frames={1} environmentIntensity={0.9}>
        <Lightformer form="rect" intensity={2.6} color="#ffffff" position={[0, 5, -4]} scale={[14, 1.6, 1]} />
        <Lightformer form="rect" intensity={1.7} color="#e8f1ff" position={[-6, 0.5, -3]} scale={[12, 2.2, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#fff0e6" position={[6, -0.5, -3]} scale={[12, 2.2, 1]} />
      </Environment>
      <Slab card={card} quality="hero" intensity={1} />
      <PhotoOverlay opacity={showPhoto} />
      <Guides show={showGuides} />
    </>
  );
}

export default function ReferenceCompare() {
  const [opacity, setOpacity] = useState(0.5);
  const [guides, setGuides] = useState(true);
  const [index, setIndex] = useState(0);
  const card = slabCards[index % slabCards.length];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="relative overflow-hidden border border-[#1A1A1A] bg-[#050505]" style={{ aspectRatio: '1 / 1' }}>
        <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
          <Suspense fallback={null}>
            <StraightScene card={card} showPhoto={opacity} showGuides={guides} />
          </Suspense>
        </Canvas>
      </div>
      <div className="space-y-4 font-mono text-[11px] text-[#F5F3EF]/70">
        <div>
          <label className="mb-2 block text-[#F5F3EF]/50">Reference overlay — {Math.round(opacity * 100)}%</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full accent-[#FF4D00]"
          />
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} className="accent-[#FF4D00]" />
          measured guides
        </label>
        <div>
          <label className="mb-2 block text-[#F5F3EF]/50">Slab</label>
          <select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            className="w-full border border-[#2A2A2A] bg-[#111] px-2 py-1 text-[#F5F3EF]/80"
          >
            {slabCards.map((c, i) => (
              <option key={c.id} value={i}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <ul className="space-y-1 text-[10px] leading-relaxed text-[#F5F3EF]/45">
          <li>cyan — slab outline (0.6:1)</li>
          <li>pink — card / white ring box</li>
          <li>orange — header label plate</li>
          <li>green — window recess</li>
          <li>straight-on fov 12° — no perspective skew</li>
        </ul>
        <p className="text-[10px] leading-relaxed text-[#F5F3EF]/35">
          Reference: 664 × 1103 px slab in a 1488 × 1484 photo, plate 0.881 w, card 0.7395 w, ring line 0.0143 card-w.
        </p>
      </div>
    </div>
  );
}
