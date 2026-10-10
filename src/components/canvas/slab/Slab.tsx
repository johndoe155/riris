'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { SlabCard } from '@/data/slabCards';
import { HoloCardMaterial, useCardPointer } from '@/components/canvas/HoloMaterial';
import { getSlabGeometry } from './geometry';
import { SLAB_SPEC, slabLayers, type SlabQuality } from './SlabSpec';
import { getWearMaps } from './textures';
import { REFERENCE_PALETTE, type PaletteDriver, type SlabPalette } from './slabPalette';
import { PaletteTextureSet } from './paletteTextures';
import {
  ensureCardTexture,
  getCardFaceTexture,
  getFaceMapTexture,
  getLabelTexture,
  getTrayTexture,
  loadImage,
  latestCardTexture,
  onCardTextureReady,
} from './useSlabTextures';

/* ------------------------------------------------------------------ *
 * Shared materials — one set, all slabs
 * ------------------------------------------------------------------ */

interface SlabMaterials {
  glass: THREE.MeshPhysicalMaterial;
  glassCheap: THREE.MeshPhysicalMaterial;
  /** the front face plate: measured sheen + moulding lines from the face map */
  face: THREE.MeshPhysicalMaterial;
  label: THREE.MeshStandardMaterial;
  ridge: THREE.MeshStandardMaterial;
  /** one per rail tab: the photo's tabs are graded L125 / L173 / L199 */
  ridgeTabs: THREE.MeshStandardMaterial[];
  /** the one muted moulded tab on each side wall */
  sideTab: THREE.MeshStandardMaterial;
  tray: THREE.MeshStandardMaterial;
  cardBody: THREE.MeshPhysicalMaterial;
  wear: ReturnType<typeof getWearMaps>;
}

let materials: SlabMaterials | null = null;

/** shared material set (the pit): the measured reference colours */
function getMaterials(): SlabMaterials {
  if (materials) return materials;
  materials = buildMaterials(getWearMaps());
  return materials;
}

/** sRGB hex -> the linear working colour, memoised (per-frame application) */
const colorCache = new Map<string, THREE.Color>();
function colorFor(hex: string): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

/**
 * Write a palette into a material set. Colours only — every other material
 * property (roughness, transmission, clearcoat ...) is structural and stays.
 */
export function applyPaletteToMaterials(m: SlabMaterials, p: SlabPalette) {
  m.glass.color.copy(colorFor(p.glassBody));
  m.glass.attenuationColor.copy(colorFor(p.glassAttenuation));
  m.glassCheap.color.copy(colorFor(p.glassCheap));
  m.face.color.copy(colorFor(p.facePlate));
  m.label.color.copy(colorFor(p.plate));
  m.ridge.color.copy(colorFor(p.faceMid));
  m.ridgeTabs[0].color.copy(colorFor(p.ridgeTab1));
  m.ridgeTabs[1].color.copy(colorFor(p.ridgeTab2));
  m.ridgeTabs[2].color.copy(colorFor(p.ridgeTab3));
  m.sideTab.color.copy(colorFor(p.sideTab));
  m.tray.color.copy(colorFor(p.tray));
  m.cardBody.color.copy(colorFor(p.cardBodyInk));
}

function buildMaterials(wear: ReturnType<typeof getWearMaps>, faceMap?: THREE.Texture): SlabMaterials {
  const R = REFERENCE_PALETTE;
  const faceTexture = faceMap ?? getFaceMapTexture();
  return {
    // real transmission — the Forge canvas is contained, so the pass is bounded.
    // The tint is the reference's own mauve cast (#91808c, sat ~18%) rather than
    // the blue-white this used to carry, and the attenuation is short enough
    // that the case reads as tinted acrylic instead of clear glass.
    glass: new THREE.MeshPhysicalMaterial({
      // transmissive enough that the moulded walls visibly bend what is behind
      // them (the card edge shifts where the chamfer turns), while the clearcoat
      // layer still takes the key light: the reference's rim is dark on the left
      // (#42333f) and lit on the right (#8a7685).
      transmission: 0.82,
      thickness: 0.16,
      roughness: 0.06,
      metalness: 0,
      ior: 1.49,
      // a hint of dispersion: the refraction fringes separate at the chamfer the
      // way a real cast-acrylic edge does, without turning into a prism
      dispersion: 0.035,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      specularIntensity: 1,
      // smoky, not blue-white: the photo's walls read as lit plastic
      // (#907f8b on the key side), so the shell carries a lighter body tone
      color: colorFor(R.glassBody),
      attenuationColor: colorFor(R.glassAttenuation),
      attenuationDistance: 2.4,
      envMapIntensity: 2.0,
      roughnessMap: wear.roughness,
      bumpMap: wear.bump,
      bumpScale: 0.002,
      side: THREE.DoubleSide,
    }),
    /**
     * The front face plate. The reference's smoky diagonal sheen (lit top and
     * right wall, deep purple bottom-left) and every moulded tone step — the
     * 10 px chamfer band, the step hairline, the ridge hairline and shadow,
     * the window-top wall band, the side tabs — live in the measured face map
     * (drawFaceMap), applied through the extrusion's shape-space UVs. The
     * clearcoat layer still takes the strip lights for the live sheen.
     */
    face: new THREE.MeshPhysicalMaterial({
      color: colorFor(R.facePlate),
      map: (() => {
        const t = faceTexture;
        // extrude cap UVs are shape-space world units centred on the plate, so
        // normalise them onto the map: one repeat across the plate's own box
        const fw = SLAB_SPEC.w - SLAB_SPEC.stepInset * 2;
        const fh = SLAB_SPEC.h - SLAB_SPEC.stepInset * 2;
        t.repeat.set(1 / fw, 1 / fh);
        t.offset.set(0.5, 0.5);
        t.needsUpdate = true;
        return t;
      })(),
      // polished enough that the strip lights drag a long soft highlight down
      // the apron, rough enough that the body keeps its measured tones
      roughness: 0.28,
      metalness: 0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.06,
      specularIntensity: 0.9,
      envMapIntensity: 1.2,
    }),
    // pit fake: low opacity + env map, no transmission pass — but the same
    // optical vocabulary as the hero glass, so the cheap case still shows a
    // body reflection and a hard streak instead of a flat tint
    glassCheap: new THREE.MeshPhysicalMaterial({
      color: colorFor(R.glassCheap),
      roughness: 0.12,
      metalness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.22,
      envMapIntensity: 1.4,
      ior: 1.49,
      specularIntensity: 1,
      roughnessMap: wear.roughness,
      side: THREE.DoubleSide,
    }),
    // measured off the reference's plate: #3b2a36, not the near-black it was
    label: new THREE.MeshStandardMaterial({ color: colorFor(R.plate), roughness: 0.42, metalness: 0.02 }),
    // the rail between label and window. In the reference its body is the face
    // tone; only its three tabs catch the light (below), so the body is not lit
    // any brighter than the face it sits on.
    ridge: new THREE.MeshStandardMaterial({ color: colorFor(R.faceMid), roughness: 0.42, metalness: 0 }),
    // the tabs on the rail, each at its measured tone: the key light is off to
    // the right, so the photo's tabs grade L125 / L173 / L199 left to right
    ridgeTabs: [colorFor(R.ridgeTab1), colorFor(R.ridgeTab2), colorFor(R.ridgeTab3)].map(
      (tone) => new THREE.MeshStandardMaterial({ color: tone, roughness: 0.34, metalness: 0 })
    ),
    // the one moulded tab per side wall: muted, like the photo's
    sideTab: new THREE.MeshStandardMaterial({ color: colorFor(R.sideTab), roughness: 0.5, metalness: 0 }),
    // the tray underneath the window texture: the measured floor tone
    tray: new THREE.MeshStandardMaterial({ color: colorFor(R.tray), roughness: 0.62, metalness: 0.02 }),
    cardBody: new THREE.MeshPhysicalMaterial({
      color: colorFor(R.cardBodyInk),
      roughness: 0.48,
      metalness: 0.02,
      clearcoat: 0.4,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.7,
    }),
    wear,
  };
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
  /**
   * Dynamic colour driver. Omitted (the pit, the reference compare) the slab
   * renders the measured reference look from the shared material set; given
   * (the Forge) the slab owns a palette-scoped material set and repaints its
   * baked textures in place, so every explicitly coloured element follows
   * the artwork's palette — and the pit is untouched.
   */
  palette?: PaletteDriver | null;
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

/*
 * The foil overlay stops on the art window's INNER edge (the square frame's
 * ink line): card UV, v from the bottom. Measured inner box 536..956 /
 * 542..963 on the 491 x 697 card.
 */
const ART_STROKE_Y = (SLAB_SPEC.artStroke * SLAB_SPEC.cardW) / SLAB_SPEC.cardH;
const FOIL_MASK: [number, number, number, number] = [
  SLAB_SPEC.artInset + SLAB_SPEC.artStroke,
  SLAB_SPEC.artBottom + ART_STROKE_Y,
  1 - SLAB_SPEC.artInset - SLAB_SPEC.artStroke,
  1 - SLAB_SPEC.artTop - ART_STROKE_Y,
];

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
  palette = null,
  cardHandlers,
  timeOffset = 0,
  children,
}: SlabProps) {
  const geo = useMemo(() => getSlabGeometry(quality), [quality]);
  const gl = useThree((s) => s.gl);
  const L = geo.planes;

  /* --- card textures: cheap face first, art swapped in when it lands --- */
  const tier = quality === 'hero' ? 'hero' : 'cheap';

  /* Palette path: the four baked surfaces get their own canvases, painted
   * with the live palette and repainted in place while it glides. Painted
   * once synchronously here so the first frame is never a blank canvas. */
  const palTex = useMemo(() => (palette ? new PaletteTextureSet(tier) : null), [palette, tier]);
  useEffect(() => () => palTex?.dispose(), [palTex]);
  const [artImg, setArtImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!palette) return;
    let live = true;
    loadImage(card.art).then((img) => {
      if (live) setArtImg(img);
    });
    return () => {
      live = false;
    };
  }, [palette, card.art]);
  if (palTex && palette && !palTex.face.painted) {
    palTex.update(palette.current, { card, tier, art: artImg, logo: null }, 0, false);
  }

  const mat = useMemo(
    () => (palette ? buildMaterials(getWearMaps(), palTex?.faceMap.tex) : getMaterials()),
    [palette, palTex]
  );

  const [face, setFace] = useState<THREE.CanvasTexture | null>(() =>
    palette ? null : getCardFaceTexture(card, null, tier)
  );
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let live = true;
    loadImage('/logo-reference.png').then((image) => {
      if (live) setLogo(image);
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (palette) return; // the palette path paints its own face texture
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
  }, [card, tier, palette]);

  const labelTex = useMemo(() => getLabelTexture(card, false, tier, logo), [card, tier, logo]);
  const trayTex = useMemo(() => getTrayTexture(), []);

  /* which textures the meshes actually show */
  const faceTex = palTex ? palTex.face.tex : face;
  const labelTexture = palTex ? palTex.label.tex : labelTex;
  const trayTexture = palTex ? palTex.tray.tex : trayTex;

  useEffect(() => {
    const max = gl.capabilities.getMaxAnisotropy();
    if (palTex) {
      palTex.setAnisotropy(max);
      return;
    }
    for (const t of [labelTex, trayTex, face, getFaceMapTexture()]) {
      if (t) t.anisotropy = Math.min(16, max);
    }
  }, [gl, labelTex, trayTex, face, palTex]);

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

    /* palette: damp the material colours every frame and let the baked
     * textures repaint at their own throttled cadence */
    if (palette) {
      applyPaletteToMaterials(mat, palette.current);
      palTex?.update(palette.current, { card, tier, art: artImg, logo }, performance.now(), palette.moving);
    }
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
        {/* back plate closes the case (centred on the window, like the tray) */}
        <mesh geometry={geo.backPlate} material={mat.tray} position={geo.place.backPlate} />
        {/* tray ring — a plate with the card's cutout */}
        <mesh geometry={geo.tray} material={mat.tray} position={geo.place.tray} />
        {/* window floor: the tray texture's plane, with the card cutout in it
            (the geometry behind it is the deep structure, this is the surface
            you actually see in the apron around the card) */}
        <mesh geometry={geo.trayPlate} position={[0, 0, L.trayFront + 0.0012]} raycast={() => null}>
          <meshStandardMaterial map={trayTexture} roughness={0.86} metalness={0.04} />
        </mesh>
        {/* label plate + its printed face */}
        <mesh geometry={geo.labelPlate} material={mat.label} position={[0, L.labelY, geo.at.labelPlate]} />
        <mesh position={[0, L.labelY, L.labelFace]}>
          <planeGeometry args={[SLAB_SPEC.labelW, SLAB_SPEC.labelH]} />
          <meshStandardMaterial map={labelTexture} roughness={0.52} metalness={0.06} toneMapped={false} />
        </mesh>
        {/* label print on the back: the same texture object (duplication by
            alias, it cannot drift) on a PI-rotated plane just outside the
            case's back plane - the outermost rear surface in the label hole,
            the exact mirror of the front's stack. The rigid rotation is the
            back-specific UV adjustment: it mirrors nothing, so the 'GHOST LAB
            COLLECTION' header reads normally from the rear, exactly as on the
            front. Without this the rear top slot showed only the dark plate's
            blank rear cap. */}
        <mesh position={[0, L.labelY, SLAB_SPEC.zBack - 0.0008]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[SLAB_SPEC.labelW, SLAB_SPEC.labelH]} />
          <meshStandardMaterial map={labelTexture} roughness={0.52} metalness={0.06} toneMapped={false} />
        </mesh>
        {/* the rail between the label and the window (measured y 418..427, inner
            frame x 435..1055), then its three bright tabs */}
        <mesh geometry={geo.ridge} material={mat.ridge} position={geo.place.ridge} />
        {geo.place.ridgeTabs.map((p, i) => (
          <mesh key={i} geometry={geo.ridgeTab} material={mat.ridgeTabs[i % mat.ridgeTabs.length]} position={p} />
        ))}
        {geo.edgeTabs.map((tab, i) => (
          <mesh key={`edge-${i}`} geometry={tab.geometry} material={mat.sideTab} position={tab.position} />
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
            {/* unlit: the printed face must read exactly as painted — the
                photo's inks are albedo, and a lit standard material under the
                studio rig multiplied them past their texture values */}
            <meshBasicMaterial map={faceTex ?? undefined} color={faceTex ? '#ffffff' : card.color} toneMapped={false} />
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
              // UV space: v runs from the bottom, so the art window is
              // [artBottom, 1 - artTop] vertically. The art frame is a hard
              // 0.0163-wide ink line, so the foil stops on it.
              mask={FOIL_MASK}
              maskFeather={0.012}
              outside={0.015}
              timeOffset={timeOffset}
              palette={palette}
            />
          </mesh>
          {/* back face: the front design again — same geometry, same shape-space
              UVs, same shared texture — mounted as a PI-rotated plane just
              outside the case's back plane (zBack - 0.0008), where it is the
              outermost rear surface. That placement is the fix for the blank
              back: the clones used to sit at -cardD/2 behind the card, INSIDE
              the opaque back plate's solid (zBackPlateFront..zBack), so both
              the drag-to-spin orbit and the double-click flip saw the plate's
              blank rear cap instead. The rigid PI rotation is the back-specific
              UV/orientation adjustment: a rigid flip mirrors nothing, so the
              design and text read NORMALLY from the rear (the old comment
              claimed a mirror — a rotation cannot produce one), and the plane's
              normal genuinely faces the rear camera, which keeps the foil
              shader's vNormal/vViewDir fresnel and specular terms correct with
              no shader-side front/back special cases. The base stays unlit
              exactly like the front (the printed inks are albedo; see the
              front face above), so the rear is the front's pixel match at
              rest, and the foil overlay below carries the live effects. */}
          <mesh geometry={geo.cardFace} position={[0, 0, SLAB_SPEC.zBack - 0.0008 - geo.at.card]} rotation={[0, Math.PI, 0]}>
            {/* unlit: the printed face must read exactly as painted — the
                photo's inks are albedo, and a lit standard material under the
                studio rig multiplied them past their texture values */}
            <meshBasicMaterial map={faceTex ?? undefined} color={faceTex ? '#ffffff' : card.color} toneMapped={false} />
          </mesh>
          {/* foil on the back too, so the spun card carries the same finish:
              0.0016 nearer the rear camera than the design (smaller z), the
              mirror of the front's design->foil spacing */}
          <mesh geometry={geo.cardFace} position={[0, 0, SLAB_SPEC.zBack - 0.0024 - geo.at.card]} rotation={[0, Math.PI, 0]}>
            <HoloCardMaterial
              finish={card.style}
              pointer={foilPointer}
              hovered={isActive}
              overlay
              intensity={intensity}
              hoverBoost={1.5}
              cardAspect={SLAB_SPEC.cardW / SLAB_SPEC.cardH}
              mask={FOIL_MASK}
              maskFeather={0.012}
              outside={0.015}
              timeOffset={timeOffset}
              palette={palette}
            />
          </mesh>
        </mesh>
        {children}
      </group>
    </group>
  );
}

export { slabLayers };
export type { SlabCard };
