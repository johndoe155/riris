'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { SlabCard } from '@/data/slabCards';
import { HoloCardMaterial, useCardPointer } from '@/components/canvas/HoloMaterial';
import { getSlabGeometry } from './geometry';
import { REF_TONE, SLAB_SPEC, slabLayers, type SlabQuality } from './SlabSpec';
import { getWearMaps } from './textures';
import {
  ensureBackTexture,
  ensureCardTexture,
  getBackTexture,
  getCardFaceTexture,
  getLabelTexture,
  getTrayTexture,
  latestBackTexture,
  latestCardTexture,
  onBackTextureReady,
  onCardTextureReady,
} from './useSlabTextures';

/* ------------------------------------------------------------------ *
 * Shared materials — one set, all slabs
 * ------------------------------------------------------------------ */

interface SlabMaterials {
  glass: THREE.MeshPhysicalMaterial;
  glassCheap: THREE.MeshPhysicalMaterial;
  /** the front face plate: the layer the reference's moulded step exposes */
  face: THREE.MeshPhysicalMaterial;
  band: THREE.MeshPhysicalMaterial;
  label: THREE.MeshStandardMaterial;
  ridge: THREE.MeshStandardMaterial;
  ridgeTab: THREE.MeshStandardMaterial;
  tray: THREE.MeshStandardMaterial;
  cardBody: THREE.MeshPhysicalMaterial;
  slot: THREE.MeshStandardMaterial;
  wear: ReturnType<typeof getWearMaps>;
}

let materials: SlabMaterials | null = null;

function getMaterials(): SlabMaterials {
  if (materials) return materials;
  const wear = getWearMaps();
  materials = {
    /* Clear acrylic, not tinted glass. The target's rim is four near-white
     * hairlines (peak luma 250, 2-3 px) around mid-mauve flats (#9b8096 shadow
     * side, #b095ad lit side, #d4c8d2 / #b6a9b3 mid steps): that is a polished
     * transparent shell reflecting a bright studio, so transmission is high,
     * roughness is low and the tint lives in a long attenuation distance
     * rather than in `color`. The old 0.2 transmission + #8a7685 colour made
     * the shell an opaque mauve box with no edge fire at all. */
    glass: new THREE.MeshPhysicalMaterial({
      transmission: 0.62,
      thickness: 0.22,
      roughness: 0.06,
      metalness: 0,
      ior: 1.49,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      color: new THREE.Color('#ffffff'),
      attenuationColor: new THREE.Color('#d8c8d6'),
      attenuationDistance: 2.4,
      envMapIntensity: 1.3,
      roughnessMap: wear.roughness,
      bumpMap: wear.bump,
      bumpScale: 0.006,
      side: THREE.DoubleSide,
    }),
    /* The face plate is the rim ring between the silhouette and the frosted
     * band: same acrylic a shade rougher, so its two bevels read as the second
     * hairline pair (px 509 and 539) on a soft broad flat instead of mirroring. */
    face: new THREE.MeshPhysicalMaterial({
      transmission: 0.35,
      thickness: 0.18,
      roughness: 0.12,
      metalness: 0,
      ior: 1.49,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      color: new THREE.Color('#efe6ee'),
      attenuationColor: new THREE.Color('#c9b6c6'),
      attenuationDistance: 1.6,
      envMapIntensity: 1.15,
      roughnessMap: wear.roughness,
      bumpMap: wear.bump,
      bumpScale: 0.004,
    }),
    // pit fake: low opacity + env map, no transmission pass
    glassCheap: new THREE.MeshPhysicalMaterial({
      color: '#e9e0e9',
      roughness: 0.12,
      metalness: 0.02,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.2,
      envMapIntensity: 1.3,
      ior: 1.49,
      roughnessMap: wear.roughness,
      side: THREE.DoubleSide,
    }),
    /* The frosted band is the rim's inner step (px 521..545): measured mid
     * mauve #b1a0b0 with a hairline on each bevel — not the near-white frost
     * the old material used, which lit the whole rim like a lamp. */
    band: new THREE.MeshPhysicalMaterial({
      color: '#cbbcc9',
      roughness: 0.18,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 0.85,
      envMapIntensity: 1.1,
    }),
    // the blank plate: the measured cool pale, with a soft moulded sheen
    label: new THREE.MeshStandardMaterial({ color: REF_TONE.plate, roughness: 0.32, metalness: 0, }),
    // the rail: one continuous bright moulding (no tabs in this reference)
    ridge: new THREE.MeshStandardMaterial({ color: REF_TONE.ridge, roughness: 0.24, metalness: 0 }),
    ridgeTab: new THREE.MeshStandardMaterial({ color: REF_TONE.ridge, roughness: 0.24, metalness: 0 }),
    // the window floor: measured #64505e, flat, matte
    tray: new THREE.MeshStandardMaterial({ color: REF_TONE.tray, roughness: 0.9, metalness: 0.02 }),
    // card stock: a light board; only its cut edge sits in shadow
    cardBody: new THREE.MeshPhysicalMaterial({
      color: '#d9dde3',
      roughness: 0.5,
      metalness: 0.02,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.6,
    }),
    // the window's top lip bar: measured #cbd1d8, polished
    slot: new THREE.MeshStandardMaterial({ color: REF_TONE.lip, roughness: 0.16, metalness: 0 }),
    wear,
  };
  return materials;
}

/* ------------------------------------------------------------------ *
 * Slab
 * ------------------------------------------------------------------ */

export interface SlabProps {
  card: SlabCard;
  /** hero = transmission glass (Forge); cheap = fake glass (pit) */
  quality?: SlabQuality;
  /** foil strength */
  intensity?: number;
  /** foil pointer, in card UV; when omitted the mesh drives it */
  pointer?: THREE.Vector2 | null;
  flipped?: boolean;
  /** held or hovered: brightens the foil and upgrades cheap glass */
  active?: boolean;
  /** upgrade a cheap slab to real transmission while it's in hand */
  upgradeGlass?: boolean;
  /** damped spin for the inner group */
  spin?: number;
  /**
   * Live spin target, read inside the frame loop. The pit animates the number
   * behind this closure from a ref so the collider's rotation stays in step
   * with the mesh without pushing React state sixty times a second.
   */
  spinSource?: () => number;
  /** handlers forwarded to the card mesh (drag, hover) */
  cardHandlers?: {
    onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
    onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
    onDoubleClick?: (e: ThreeEvent<PointerEvent>) => void;
  };
  timeOffset?: number;
  children?: ReactNode;
}

const FLIP_SPEED = Math.PI / 0.55;

export function Slab({
  card,
  quality = 'hero',
  intensity = 1,
  pointer = null,
  flipped = false,
  active = false,
  upgradeGlass = false,
  spin = 0,
  spinSource,
  cardHandlers,
  timeOffset = 0,
  children,
}: SlabProps) {
  const geo = useMemo(() => getSlabGeometry(quality), [quality]);
  const mat = useMemo(() => getMaterials(), []);
  const gl = useThree((s) => s.gl);
  const L = geo.planes;

  /* --- card textures: cheap face first, art swapped in when it lands --- */
  const tier = quality === 'hero' ? 'hero' : 'cheap';
  const [face, setFace] = useState<THREE.CanvasTexture | null>(() => getCardFaceTexture(card, null, tier));
  useEffect(() => {
    let live = true;
    ensureCardTexture(card, tier).then((tex) => {
      if (live) setFace(tex);
    });
    const off = onCardTextureReady((c, t) => {
      if (!live || c.id !== card.id || t !== tier) return;
      const next = latestCardTexture(card, tier);
      if (next) setFace(next);
    });
    return () => {
      live = false;
      off();
    };
  }, [card, tier]);

  // the reference's plate is blank: a full-bleed cover ships in a blank-label
  // case, so those cards get the pale blank plate rather than printed furniture
  const labelTex = useMemo(() => getLabelTexture(card, !!card.fullBleed, tier), [card, tier]);

  // the card's own branded back: drawn fallback first, photo when it lands
  const [backTex, setBackTex] = useState<THREE.CanvasTexture>(() => latestBackTexture(card.back) ?? getBackTexture());
  useEffect(() => {
    let live = true;
    ensureBackTexture(card.back).then((tex) => {
      if (live) setBackTex(tex);
    });
    const off = onBackTextureReady((style) => {
      if (!live || style !== card.back) return;
      const next = latestBackTexture(card.back);
      if (next) setBackTex(next);
    });
    return () => {
      live = false;
      off();
    };
  }, [card.back]);
  const trayTex = useMemo(() => getTrayTexture(), []);

  useEffect(() => {
    const max = gl.capabilities.getMaxAnisotropy();
    for (const t of [labelTex, trayTex, face, backTex]) {
      if (t) t.anisotropy = Math.min(8, max);
    }
  }, [gl, labelTex, trayTex, face, backTex]);

  /* --- pointer + hover --- */
  const { pointer: localPointer, hovered, bind } = useCardPointer(SLAB_SPEC.cardW, SLAB_SPEC.cardH);
  const isActive = active || hovered;
  const foilPointer = pointer ?? localPointer;

  /* --- flip + spin --- */
  const cardRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Group>(null);
  const flip = useRef(flipped ? Math.PI : 0);
  const spinRef = useRef(spin);
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 30);
    const target = flipped ? Math.PI : 0;
    const step = FLIP_SPEED * delta;
    if (Math.abs(flip.current - target) < step) flip.current = target;
    else flip.current += Math.sign(target - flip.current) * step;
    if (cardRef.current) cardRef.current.rotation.y = flip.current;
    const inner = innerRef.current;
    if (inner) {
      spinRef.current = THREE.MathUtils.damp(spinRef.current, spinSource ? spinSource() : spin, 9, delta);
      inner.rotation.z = spinRef.current;
    }
  });

  /* --- pick the glass: real transmission in the Forge, and in the pit only
         while this slab is hovered or held --- */
  const glassMat = quality === 'hero' || upgradeGlass || isActive ? mat.glass : mat.glassCheap;

  const cardFaceZ = L.cardFace + 0.0012;
  const foilZ = cardFaceZ + 0.0016;

  return (
    <group>
      <group ref={innerRef}>
        {/* outer case: silhouette with the window cut through */}
        <mesh geometry={geo.shell} material={glassMat} position={[0, 0, geo.at.shell]} />
        {/* front face plate: the silhouette inset one moulding step. Its
            bevelled edge is the reference's 10 px chamfer + hairline */}
        <mesh geometry={geo.face} material={quality === 'hero' || upgradeGlass || isActive ? mat.face : glassMat} position={[0, 0, geo.at.face]} />
        {/* back plate closes the case */}
        <mesh geometry={geo.backPlate} material={mat.tray} position={[0, 0, geo.at.backPlate]} />
        {/* tray ring — a plate with the card's cutout */}
        <mesh geometry={geo.tray} material={mat.tray} position={geo.place.tray} />
        {/* window floor: the tray texture's plane, with the card cutout in it
            (the geometry behind it is the deep structure, this is the surface
            you actually see in the apron around the card) */}
        <mesh geometry={geo.trayPlate} position={[0, 0, L.trayFront + 0.0012]} raycast={() => null}>
          <meshStandardMaterial map={trayTex} roughness={0.86} metalness={0.04} />
        </mesh>
        {/* frosted band around the window */}
        <mesh geometry={geo.band} material={mat.band} position={geo.place.band} />
        {/* label plate + its printed face */}
        <mesh geometry={geo.labelPlate} material={mat.label} position={[0, L.labelY, geo.at.labelPlate]} />
        <mesh position={[0, L.labelY, L.labelFace]}>
          <planeGeometry args={[SLAB_SPEC.labelW, SLAB_SPEC.labelH]} />
          <meshStandardMaterial map={labelTex} roughness={0.52} metalness={0.06} toneMapped={false} />
        </mesh>
        {/* the rail between the label and the window (measured y 418..427, inner
            frame x 435..1055), then its three bright tabs */}
        <mesh geometry={geo.ridge} material={mat.ridge} position={geo.place.ridge} />
        {geo.place.ridgeTabs.map((p, i) => (
          <mesh key={i} geometry={geo.ridgeTab} material={mat.ridgeTab} position={p} />
        ))}
        {/* the window's top lip: one bar */}
        {geo.slots.map((g, i) => (
          <mesh key={i} geometry={g} material={mat.slot} position={[0, 0, geo.at.slot]} />
        ))}
        {/* the card */}
        <mesh
          ref={cardRef}
          geometry={geo.card}
          material={mat.cardBody}
          position={[0, SLAB_SPEC.cardY, geo.at.card]}
          {...bind}
          {...(cardHandlers ?? {})}
        >
          {/* front face: drawn furniture + the art panel, cut to the card's
              own silhouette so no square corners show past the rounded body */}
          <mesh geometry={geo.cardFace} position={[0, 0, cardFaceZ - geo.at.card]}>
            <meshStandardMaterial
              map={face ?? undefined}
              color={face ? '#ffffff' : card.color}
              roughness={0.46}
              metalness={0.05}
              toneMapped={false}
            />
          </mesh>
          {/* foil overlay, masked to the card plane */}
          <mesh geometry={geo.cardFace} position={[0, 0, foilZ - geo.at.card]}>
            <HoloCardMaterial
              finish={card.style}
              pointer={foilPointer}
              hovered={isActive}
              overlay
              intensity={intensity}
              hoverBoost={1.5}
              cardAspect={SLAB_SPEC.cardW / SLAB_SPEC.cardH}
              // UV space: v runs from the bottom. A full-bleed cover foils over
              // its whole face (feathered at the silhouette); a framed card
              // stops its foil on the art frame's ink line.
              mask={
                card.fullBleed
                  ? [0.02, 0.02, 0.98, 0.98]
                  : [SLAB_SPEC.artInset, SLAB_SPEC.artBottom, 1 - SLAB_SPEC.artInset, 1 - SLAB_SPEC.artTop]
              }
              maskFeather={card.fullBleed ? 0.035 : 0.012}
              outside={0}
              timeOffset={timeOffset}
            />
          </mesh>
          {/* back face */}
          <mesh geometry={geo.cardFace} position={[0, 0, -SLAB_SPEC.cardD / 2 - 0.0008]} rotation={[0, Math.PI, 0]}>
            <meshStandardMaterial map={backTex} roughness={0.52} metalness={0.04} toneMapped={false} />
          </mesh>
        </mesh>
        {children}
      </group>
    </group>
  );
}

export { slabLayers };
export type { SlabCard };
