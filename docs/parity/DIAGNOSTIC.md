# Card shader vs reference: parity diagnostic

Reference: `reference-image.jpg` (graded "GHOST LAB COLLECTION" slab photo).
Current: reference-compare scene (`ReferenceCompare.tsx` → `Slab` → `HoloCardMaterial`), rendered in headless Chromium with SwiftShader.
Captures: `current-render-overlay0.png` (overlay 0%) and `current-render-overlay50.png` (overlay 50%).

## Phase 1: findings

1. **Geometry and framing (measured, approximate)**
   - Slab aspect: reference ≈ 0.60 (664×1103 px); current ≈ 0.60. Match.
   - Card frame position inside slab: reference top ≈ 0.29, bottom ≈ 0.91 of slab height; current ≈ 0.29 / 0.90. Match within ~1%.
   - Card frame width vs slab: reference ≈ 0.74; current ≈ 0.74. Match.
   - Header plate: reference is a flat dark-plum band; current plate reads thicker, like a moulded lip. Mismatch (minor).
2. **Content (not a shader issue):** the scene renders the default placeholder card "APE REUNION #100" (`slabCards[0]`). The reference is "GHOST LAB #7389". Art parity cannot be judged until the same card is loaded.
3. **Base material / glass:** reference glass is soft, low-contrast, with broad diffuse sheen. Current render shows a hard-edged rounded highlight along the top and bottom lip. Mismatch.
4. **Foil:** the reference shows no rainbow foil on the card face; the art is matte. The default finish is `holo`, which tints the face with the HoloShader gradient. Mismatch: this reference should be shown with finish `base`.
5. **Lighting and exposure:** reference background is a lit lilac-to-plum gradient, brighter at upper right. Current scene is darker and flatter. Mismatch.
6. **Micro-texture / scanlines:** the `sin(vUv.y * 420.0)` scanline in the base path is not visible in the reference at display size. Low priority; remove or reduce to ~0.

## Phase 2: gap list

- **Geometry and framing:** header plate height and position; spacing between card-name row and plate.
- **Color and translucency:** background gradient exposure; glass tint should be neutral (reference shows no blue attenuation).
- **Lighting and specular:** soften the lip highlight (higher clearcoat roughness); reduce the hard top-edge Lightformer rim.
- **Shimmer, noise, effects:** default finish should not be `holo` for this card; remove the scanline term; no foil noise in the reference.

## Not done in this pass

- No shader constants were changed. The sRGB/tonemapping path and cover-fit UVs are unchanged.
- Exact parity with a photograph of a physical slab is not reachable with a procedural shader. The realistic target is the measured geometry above, plus matching finish and exposure, after loading the same card.
- Next step needs one decision: load the Ghost Lab card in the scene, and confirm the target finish (`base` is suggested).
