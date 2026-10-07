'use client';
import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { galleryData } from '@/data/gallery';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useVaultStore } from '@/store/useVaultStore';

function Card({ image, finish, position, index, onSelect }: { image: string; finish: string; position: [number, number, number]; index: number; onSelect: () => void }) {
  const rigidRef = useRef<RapierRigidBody>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const texture = useTexture(image);
  const [hovered, setHovered] = useState(false);
  
  // Simple shader material inline to avoid import issues
  const shader = useMemo(() => ({
    uniforms: {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uImage: { value: texture },
      uFinish: { value: finish === 'holo' ? 1 : finish === 'cracked-ice' ? 2 : finish === 'gold' ? 3 : 0 },
      uIntensity: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uPointer;
      uniform sampler2D uImage;
      uniform float uFinish;
      uniform float uIntensity;
      varying vec2 vUv;
      
      vec3 holoGrad(float t) {
        vec3 c1 = vec3(1.0, 0.3, 0.0);
        vec3 c2 = vec3(0.0, 0.9, 1.0);
        vec3 c3 = vec3(1.0, 0.9, 0.0);
        float t2 = fract(t);
        if(t2 < 0.33) return mix(c1, c2, t2/0.33);
        else if(t2 < 0.66) return mix(c2, c3, (t2-0.33)/0.33);
        else return mix(c3, vec3(1.0,0.0,0.9), (t2-0.66)/0.34);
      }
      
      void main() {
        vec4 img = texture2D(uImage, vUv);
        vec2 pointer = uPointer;
        float dist = distance(vUv, pointer);
        float glow = 1.0 - smoothstep(0.0, 0.6, dist);
        
        vec3 col = img.rgb;
        
        if(uFinish > 0.5 && uFinish < 1.5) {
          float angle = atan(vUv.y - pointer.y, vUv.x - pointer.x);
          float holo = sin(angle * 6.0 + uTime * 0.5 + dist * 10.0) * 0.5 + 0.5;
          vec3 holoCol = holoGrad(holo + uTime * 0.05);
          col = mix(col, holoCol, (0.3 + glow * 0.5) * uIntensity);
        } else if(uFinish > 1.5 && uFinish < 2.5) {
          col = mix(col, vec3(0.8,0.9,1.0), 0.2 + glow * 0.2);
          col += vec3(1.0) * (1.0 - step(0.3, fract(sin(dot(vUv*12.0, vec2(12.9898,78.233))) * 43758.5))) * 0.1;
        } else if(uFinish > 2.5) {
          vec3 gold = vec3(1.0,0.84,0.0);
          col = mix(col, gold, 0.3 + glow * 0.3);
        }
        
        gl_FragColor = vec4(col, 1.0);
      }
    `
  }), [texture, finish]);

  useFrame((state, delta) => {
    if (materialRef.current) {
      const { pointer } = useVaultStore.getState();
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime + index;
      materialRef.current.uniforms.uPointer.value.set(pointer.x, 1 - pointer.y);
      materialRef.current.uniforms.uIntensity.value = hovered ? 1.5 : 1.0;
    }
    if (meshRef.current && !hovered) {
      meshRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <RigidBody
      ref={rigidRef}
      position={position}
      colliders={false}
      linearDamping={1.8}
      angularDamping={1.2}
      mass={0.6}
      restitution={0.7}
      friction={0.5}
      canSleep={false}
    >
      <CuboidCollider args={[0.8, 1.1, 0.06]} />
      <mesh
        ref={meshRef}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onClick={onSelect}
        scale={hovered ? 1.2 : 1}
      >
        <boxGeometry args={[1.6, 2.2, 0.1]} />
        <shaderMaterial ref={materialRef} args={[shader]} />
      </mesh>
    </RigidBody>
  );
}

function Walls() {
  return (
    <>
      <RigidBody type="fixed" position={[0, -5.5, 0]}><CuboidCollider args={[12, 0.5, 4]} /></RigidBody>
      <RigidBody type="fixed" position={[0, 5.5, 0]}><CuboidCollider args={[12, 0.5, 4]} /></RigidBody>
      <RigidBody type="fixed" position={[-7.5, 0, 0]}><CuboidCollider args={[0.5, 8, 4]} /></RigidBody>
      <RigidBody type="fixed" position={[7.5, 0, 0]}><CuboidCollider args={[0.5, 8, 4]} /></RigidBody>
      <RigidBody type="fixed" position={[0, 0, -1.5]}><CuboidCollider args={[12, 8, 0.5]} /></RigidBody>
      <RigidBody type="fixed" position={[0, 0, 1.5]}><CuboidCollider args={[12, 8, 0.5]} /></RigidBody>
    </>
  );
}

function Scene({ cards }: { cards: typeof galleryData }) {
  const positions = useMemo(() => {
    return cards.map(() => [
      (Math.random() - 0.5) * 6,
      Math.random() * 3 + 2,
      (Math.random() - 0.5) * 0.8
    ] as [number, number, number]);
  }, [cards]);

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
      <directionalLight position={[-5, -2, 3]} intensity={0.5} color="#FF4D00" />
      <Physics gravity={[0, -1.5, 0]}>
        <Walls />
        {cards.map((card, i) => (
          <Card
            key={card.id}
            image={card.image}
            finish={card.style}
            position={positions[i] || [0, 2, 0]}
            index={i}
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
    setMounted(true);
    // The canvas swap (0 -> 70vh placeholder -> 75vh canvas) lands a frame or
    // two after the viewMode flip — re-measure ScrollTriggers once it's real.
    const raf = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => cancelAnimationFrame(raf);
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
          <span>Each card is a RigidBody with CuboidCollider • Walls keep vault sealed</span>
          <span className="text-[#F5F3EF]/60">Click any slab to forge one like it</span>
        </div>
      </div>
    </div>
  );
}
