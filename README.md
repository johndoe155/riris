# Cardshop shader lab

Standalone copy of the two live WebGL card scenes from the main project: the Forge preview and the Gallery pit. Use it to experiment, then port changes back.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Same dependency versions as the main project, so the Next 16 / React 19.2 notes in its `AGENTS.md` apply here too.

## What is copied verbatim from the main project

| File | Role |
| --- | --- |
| `src/components/canvas/HoloMaterial.tsx` | Shared GLSL card material (`holoShaderMaterial` via `extend()`), plus `HoloCardMaterial`, `useCardPointer()` and `useDeviceTilt()` |
| `src/components/canvas/ForgePreview.tsx` | Forge scene: slab, acrylic case, Lightformer environment, Bloom, OrbitControls |
| `src/components/canvas/GalleryPitPhysics.tsx` | Rapier pit (viewport-sized walls, drag/toss) using the shared material |
| `src/store/useVaultStore.ts` | Shared state: pointer, finishType, nftData |
| `src/data/gallery.ts` | The 42 gallery cards |
| `src/lib/utils.ts` | `fetchNFT` (Alchemy demo, falls back to picsum) |
| `public/gallery/*` | Slab photos used by the pit |
| `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs` | Config |

## What is new (harness only)

- `src/app/page.tsx`: finish buttons, demo NFT / upload controls, a pit filter, and the same `pointermove` listener that `Providers.tsx` has in the main project. It also registers the gsap `ScrollTrigger` plugin, which the pit calls.
- `src/app/layout.tsx`, `src/app/globals.css`: minimal shell with Tailwind v4.
- `package.json`: trimmed to the dependencies these scenes use.

## Polish pass (this branch)

Only the three `canvas/` files changed; the store and harness are untouched.

**`HoloMaterial.tsx`** — now the single source of truth for the shader, and both scenes use it.

- Cover-fit UVs: `uImageAspect` + `uCardAspect` crop the art instead of squashing a square NFT onto a 3:4 face. Set from the loaded texture, so no per-scene plumbing.
- `#include <tonemapping_fragment>` + `#include <colorspace_fragment>` at the end of `main()`. Both are identity when a composer owns the buffer, so the pit (drawn straight to the canvas) finally matches the Forge.
- Textures get `colorSpace = SRGBColorSpace` (and anisotropy) inside the material, so the pit no longer decodes differently from the Forge.
- Finishes are blended by weight from a damped `uFinish`, so switching morphs instead of cutting.
- View-angle foil: fresnel **and** half-vector terms shift the holo hue, so tilting changes colour with no pointer motion.
- New exports: `HoloCardMaterial` (uniforms, damping, gyro fallback, sRGB setup), `useCardPointer()` (R3F `onPointerMove` + `e.uv`), `useDeviceTilt()` / `requestDeviceTilt()` (gyro, iOS permission on the first tap).

**`ForgePreview.tsx`**

- Pointer comes from the slab's own `onPointerMove` (`e.uv`) instead of the window; the slab also leans toward the cursor so the foil reacts.
- drei `<Environment>` (256px, one frame) with four `Lightformer`s, plus a transmissive acrylic case — the transmission pass only makes sense where the canvas is contained, so it lives here and not in the pit.

**`GalleryPitPhysics.tsx`**

- Pointer drag with an impulse on release (`mΔv`, capped) and a screen-space movement threshold (6px mouse / 10px touch) so a tap still opens the Forge.
- Walls, floor, ceiling and spawn deck are derived from `useThree().viewport`.
- The hover spin/scale is mirrored onto the collider (`setRotationWrtParent` + `setHalfExtents`), including after any re-render, so mesh and collider agree.
- The inline shader copy is gone; the cards render `HoloCardMaterial`.

Porting notes: the canvases no longer read `useVaultStore.pointer` (Providers can keep writing it — other UI may use it), and `maath` is no longer imported by the Forge.

## Porting back

Edit only the three `canvas/` files (and the store if needed), then copy them over the same paths in the main project. The harness page is not meant to be ported.
