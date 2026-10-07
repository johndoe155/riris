'use client';
import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useTexture, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useVaultStore } from '@/store/useVaultStore';
import { easing } from 'maath';
import '@/components/canvas/HoloMaterial'; // registers holoShaderMaterial via extend()

function SlabMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);
  const finishType = useVaultStore((s) => s.finishType);
  const nftData = useVaultStore((s) => s.nftData);
  const isCoarsePointer = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches,
    []
  );
  
  const finishMap = { 'base': 0, 'holo': 1, 'cracked-ice': 2, 'gold': 3 } as const;
  
  const imageUrl = nftData?.image || 'https://picsum.photos/seed/forge/800/800';
  const texture = useTexture(imageUrl);

  useMemo(() => {
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
    }
  }, [texture]);

  useFrame((state, delta) => {
    if (!meshRef.current || !materialRef.current) return;
    
    const time = state.clock.elapsedTime;
    const { pointer } = useVaultStore.getState();

    if (!isCoarsePointer) {
      easing.damp2(materialRef.current.uniforms.uPointer.value, [pointer.x, 1 - pointer.y], 0.2, delta);
    } else {
      easing.damp2(materialRef.current.uniforms.uPointer.value, [0.5, 0.5], 0.6, delta);
    }
    materialRef.current.uniforms.uTime.value = time;
    materialRef.current.uniforms.uFinish.value = finishMap[finishType];
    
    // Gentle rotation
    meshRef.current.rotation.y += delta * 0.15;
    meshRef.current.rotation.x = Math.sin(time * 0.3) * 0.1;
    
    // Float
    meshRef.current.position.y = Math.sin(time * 0.5) * 0.05;
  });

  return (
    <group>
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <boxGeometry args={[2.2, 3.0, 0.12]} />
        {/* @ts-ignore */}
        <holoShaderMaterial
          ref={materialRef}
          uImage={texture}
          uFinish={finishMap[finishType]}
          uIntensity={1.2}
          uTime={0}
          uPointer={new THREE.Vector2(0.5, 0.5)}
        />
      </mesh>
      
      {/* Slab border */}
      <mesh position={[0, 0, -0.02]} scale={[1.08, 1.06, 1]}>
        <boxGeometry args={[2.2, 3.0, 0.1]} />
        <meshPhysicalMaterial
          color="#1a1a1a"
          roughness={0.2}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          transparent
          opacity={0.9}
        />
      </mesh>
      
      {/* Label */}
      <mesh position={[0, -1.1, 0.07]}>
        <planeGeometry args={[1.8, 0.45]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.8} />
      </mesh>
    </group>
  );
}

function FinishBloom() {
  const finishType = useVaultStore((s) => s.finishType);
  const intensity =
    finishType === 'gold' ? 1.0 :
    finishType === 'holo' ? 0.85 :
    finishType === 'cracked-ice' ? 0.45 :
    0.12;
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={intensity} luminanceThreshold={0.85} luminanceSmoothing={0.15} radius={0.72} />
    </EffectComposer>
  );
}

export function ForgePreviewCanvas() {
  return (
    <div className="w-full h-full min-h-[500px] relative bg-[#050505] overflow-hidden">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
        camera={{ position: [0, 0, 4], fov: 35 }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 4]} fov={35} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <directionalLight position={[-5, -2, 3]} intensity={0.5} color="#FF4D00" />
        <pointLight position={[0, 2, 2]} intensity={0.8} color="#00E5FF" />
        
        <SlabMesh />
        <FinishBloom />
        
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 1.8}
          autoRotate={false}
          rotateSpeed={0.5}
        />
        
        <fog attach="fog" args={['#050505', 5, 12]} />
      </Canvas>
      
      <div className="absolute top-4 left-4 font-mono text-[9px] px-2 py-1 bg-black/60 text-white/60 border border-white/10 backdrop-blur">
        ● LIVE • WEBGL • DRAG TO SPIN
      </div>
      
      <div className="absolute bottom-4 left-4 right-4 flex justify-between">
        <div className="font-mono text-[9px] text-[#F5F3EF]/30">
          SHADER: GLSL • 60FPS • POINTER REACTIVE
        </div>
        <div className="font-mono text-[9px] text-[#FF4D00]">
          TRUE OPTICAL PREVIEW
        </div>
      </div>
    </div>
  );
}
