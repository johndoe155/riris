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
| `src/components/canvas/HoloMaterial.tsx` | GLSL shader (holo / cracked ice / gold), registered via `extend()` |
| `src/components/canvas/ForgePreview.tsx` | Forge scene: slab, Bloom, OrbitControls |
| `src/components/canvas/GalleryPitPhysics.tsx` | Rapier pit with its own inline shader copy |
| `src/store/useVaultStore.ts` | Shared state: pointer, finishType, nftData |
| `src/data/gallery.ts` | The 42 gallery cards |
| `src/lib/utils.ts` | `fetchNFT` (Alchemy demo, falls back to picsum) |
| `public/gallery/*` | Slab photos used by the pit |
| `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs` | Config |

## What is new (harness only)

- `src/app/page.tsx`: finish buttons, demo NFT / upload controls, a pit filter, and the same `pointermove` listener that `Providers.tsx` has in the main project. It also registers the gsap `ScrollTrigger` plugin, which the pit calls.
- `src/app/layout.tsx`, `src/app/globals.css`: minimal shell with Tailwind v4.
- `package.json`: trimmed to the dependencies these scenes use.

## Porting back

Edit only the three `canvas/` files (and the store if needed), then copy them over the same paths in the main project. The harness page is not meant to be ported.
