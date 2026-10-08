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

## Reference-parity pass (this branch)

`reference-image.jpg` is the target. The numbers to build against were recovered
from it first, with the scripts in `scripts/analysis/` (silhouette tracking,
scan lines, corner arcs, a software rasteriser for the repo's own geometry), and
the whole audit — measured table, layer-by-layer diagnostic, gap list and the
exact math for the two changes that are easy to get wrong — is in
**`docs/reference-parity.md`**. In short:

- **Geometry.** The case was 7 px too tall (0.602 vs the measured 0.5959) and the
  window sat 71 px high, which dragged the tray, card and apron down with it. The
  ridge was 31 px high and only 0.84 wide where the reference has one full-width
  moulding line at y 418..427 of 1116. The four "hanger wells" were 9 × 67 px
  against a measured 60 × 15 px, and clamped *below* the card's top edge, so they
  floated in front of the artwork. All fixed, and every feature is now within 1 px
  except the window's own horizontal edges (see below).
- **The moulding step.** The reference's front is two planes, not one: 10 px of
  dark rim (`#42333f` on the left, `#8a7685` on the lit right) with a bright
  hairline where the face plate's bevel turns, against a `#91808c` face. That
  edge is the case's whole read, and the model did not have it — hence the new
  `face` layer in `geometry.ts`.
- **Colour.** The card body was white (`#fbfbfb`) where the reference's is
  `#473642`; the label plate `#15151a` against `#3b2a36`; the tray carried a
  gradient and a white "apron wash" the photo has no trace of. `REF_TONE` in
  `SlabSpec.ts` now holds the measured tones and both the 2-D painters and the
  3-D materials read from it.
- **Light.** The environment's `#FF4D00` ring and `#00E5FF` circle (plus a cyan
  point light) were the cause of the case's colour cast; the rig is now a neutral
  key off the upper right, a cool fill and a dim bounce. The camera went from
  `fov 32` to `fov 16`, because the reference is effectively orthographic.
- **The shader.** The foil's mask is the measured art window with a 0.012 feather
  and `uOutside` 0.015 (was 0.06 / 0.12, which smeared rainbow over the frame and
  the card's text), and the polar spiral around the pointer is replaced by a
  grating term — the anisotropic family of orders a real foil shows.

### Porting back

Edit only the three `canvas/` files (and the store if needed), then copy them
over the same paths in the main project. The harness page is not meant to be
ported.

### Checks

```bash
npm run verify          # geometry + textures + shaders + parity
npm run verify:parity   # 20 measured features against reference-image.jpg
```

`verify:parity` re-derives every feature from `SLAB_SPEC` and fails past 3.5 px
on the 665 × 1116 px case. It currently reports `worst delta 3.01px`, and the
residual is the window's horizontal edges — its left edge is a 15 px ramp in the
photo where the acrylic wall darkens, so that pair cannot be located better than
about 3 px. Everything with a hard edge is inside 1 px.

## Earlier polish pass

Only the three `canvas/` files changed in that pass; the store and harness are untouched.

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
