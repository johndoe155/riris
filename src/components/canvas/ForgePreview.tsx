'use client';
import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useTexture, OrbitControls, PerspectiveCamera, Environment, Lightformer } from '@react-three/drei';
import { useVaultStore } from '@/store/useVaultStore';
import { HoloCardMaterial, useCardPointer } from '@/components/canvas/HoloMaterial';

/** Slab face in world units — 3:4, which is why the art needs a cover-fit. */
const SLAB = { w: 2.2, h: 3.0, d: 0.12 } as const;

/** Overlays must not steal raycasts from the slab underneath. */
const noRaycast = () => null;

const damp = THREE.MathUtils.damp;

function SlabMesh() {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const finishType = useVaultStore((s) => s.finishType);
  const nftData = useVaultStore((s) => s.nftData);

  // Hover comes from the mesh itself (e.uv), not from the window, so the foil
  // highlight sits exactly under the cursor.
  const { pointer, hovered, bind } = useCardPointer();

  const imageUrl = nftData?.image || 'https://picsum.photos/seed/forge/800/800';
  const texture = useTexture(imageUrl);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const time = state.clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);

    // Gentle idle rotation, plus a parallax lean towards the cursor: the lean
    // alone re-angles the normals, which is what makes the foil breathe.
    mesh.rotation.y += dt * 0.15;
    mesh.rotation.x = Math.sin(time * 0.3) * 0.1;
    mesh.position.y = Math.sin(time * 0.5) * 0.05;

    const group = groupRef.current;
    if (group) {
      const leanX = (pointer.x - 0.5) * (hovered ? 0.5 : 0.25);
      const leanY = (pointer.y - 0.5) * (hovered ? 0.35 : 0.18);
      group.rotation.y = damp(group.rotation.y, leanX, 4, dt);
      group.rotation.x = damp(group.rotation.x, -leanY, 4, dt);
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} position={[0, 0, 0]} {...bind}>
        <boxGeometry args={[SLAB.w, SLAB.h, SLAB.d]} />
        <HoloCardMaterial
          image={texture}
          finish={finishType}
          pointer={pointer}
          hovered={hovered}
          intensity={1.2}
          cardAspect={SLAB.w / SLAB.h}
        />
      </mesh>

      {/* Slab border */}
      <mesh position={[0, 0, -0.02]} scale={[1.08, 1.06, 1]} raycast={noRaycast}>
        <boxGeometry args={[SLAB.w, SLAB.h, 0.1]} />
        <meshPhysicalMaterial
          color="#1a1a1a"
          roughness={0.2}
          metalness={0.1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          envMapIntensity={1.1}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Label */}
      <mesh position={[0, -1.1, 0.07]} raycast={noRaycast}>
        <planeGeometry args={[1.8, 0.45]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.8} />
      </mesh>

      {/* Acrylic case: transmission reads the Lightformer environment back into
          the glass, which is why this only lives in the contained Forge canvas. */}
      <mesh position={[0, 0, -0.06]} raycast={noRaycast}>
        <boxGeometry args={[SLAB.w + 0.34, SLAB.h + 0.34, 0.46]} />
        <meshPhysicalMaterial
          transmission={1}
          thickness={0.6}
          roughness={0.06}
          ior={1.46}
          clearcoat={1}
          clearcoatRoughness={0.08}
          attenuationColor="#cfe3ff"
          attenuationDistance={1.6}
          envMapIntensity={1.4}
        />
      </mesh>
    </group>
  );
}

/** A handful of Lightformers is enough to give the glass and the clearcoat something to catch. */
function StudioEnvironment() {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={0.85}>
      <Lightformer form="rect" intensity={3} color="#ffffff" position={[0, 4, -6]} scale={[8, 8, 1]} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={5} color="#FF4D00" position={[-5, 1, -2]} scale={4} target={[0, 0, 0]} />
      <Lightformer form="circle" intensity={4} color="#00E5FF" position={[5, -2, 1]} scale={3} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.2} color="#8899aa" position={[0, -5, 3]} scale={[10, 3, 1]} target={[0, 0, 0]} />
    </Environment>
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
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <directionalLight position={[-5, -2, 3]} intensity={0.5} color="#FF4D00" />
        <pointLight position={[0, 2, 2]} intensity={0.8} color="#00E5FF" />

        <StudioEnvironment />
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
