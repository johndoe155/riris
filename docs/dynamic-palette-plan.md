# Dynamic fluid palette: artwork atmosphere → slab colour system

The Forge no longer colours the slab from fixed per-type swatches. When a
preset or an uploaded image is selected, the artwork is *sampled*, its
dominant atmosphere is derived, and the whole scene — void backdrop, canvas
background, lights, studio Lightformers, acrylic shell, label plate, tray
cavity, face-plate map, card furniture and the foil shader — **lerps** to a
palette built from that atmosphere. Resetting glides back to the measured
reference look.

The rule the implementation follows, verbatim:

> Extract the artwork's dominant atmosphere, not its literal swatches. Build
> a tonal scale from that atmosphere, then apply the scale consistently to
> the outer background, card shell, header, card field, image panel, and
> contrast elements.

i.e. **the artwork determines the hue family and the mood; the card system
determines the lightness hierarchy, saturation control, contrast and material
treatment.**

---

## 1. Sampling — what authority the artwork has

`src/lib/palette.ts` → `sampleArtwork(rgba, w, h)` works on a ≤112 px
downsample, averaged into 4 px blocks, so a detail smaller than a block — an
orange accessory, a red collar, a sparkle — is averaged away *before* it can
vote. Then, in order of authority:

1. **the large-area backdrop**: the outer ring of blocks, hue-voted by
   chroma mass (a flat coloured background owns this);
2. **the dominant subject colour**: the image-wide hue histogram, each hue's
   vote weighted by chroma mass **and** by its spread over a 4×4 cell grid,
   so a hue confined to one corner loses to a hue that covers the backdrop;
3. **overall lightness / saturation / contrast**: area-weighted mean L, mean
   C, and the standard deviation of L;
4. **secondary accents**: only a hue peak with ≥6 % mass, ≥22 % of the top
   score and ≥45° away from the family — otherwise ignored.

Neutral blocks (C < 0.012) carry no hue vote but do feed `neutralShare`,
which is how grayscale artwork is recognised.

## 2. Atmosphere — the anchors

`deriveAnchors(sample)` converts the sample into four numbers and a mood:

| anchor | meaning | source |
| --- | --- | --- |
| `hue` | the environmental family hue | backdrop/subject blend |
| `chroma` | the family's environmental chroma | `0.0295 · satControl`, softened, capped, collapsed for neutral art |
| `gain`, `lift` | the lightness curve about the 0.5 pivot | contrast (`sdL`) + mean lightness + mood |
| `hueSpread` | how much of the source's hue variation survives | circular spread of the family's own hues |

Mood (`classifyMood`): `neutral` (grey/charcoal environments), `pastel`
(pale, hazy, low-contrast), `cinematic` (dark, rich floors), `vivid`,
`balanced`. The mood moves the lightness curve and the depth: cinematic
deepens the void floor, pastel lifts it, and a strongly saturated family
deepens it too — saturated reds read dramatic even at mid lightness.

**Calibration.** The constants are pinned so that the reference artwork
(`public/cards/Gjw0CRRXoAMjU8i.jpg`: meanL 0.456, sdL 0.210, familyC 0.049)
maps to the *identity* transform — the system reproduces the measured
reference palette from the reference artwork, and every other artwork is a
departure from it in proportion to how it differs. `verify:palette` asserts
this.

## 3. The manifest — every explicitly coloured element

`src/components/canvas/slab/slabPalette.ts` holds `SlabPalette`: ~70 named
slots, one per coloured element, and `REFERENCE_PALETTE`, the exact literals
the scene carries today:

- **outer scene**: void ramp `voidDark/voidGlow/voidPale`, canvas `sceneBg`;
- **lighting**: `ambient`, `key`, and the eight studio Lightformers
  (`envKey … envRearStrip`) — near-white bodies with a deliberate gel of the
  family, weak enough that the measured material tones stay in charge;
- **plastic shell**: `glassBody`, `glassAttenuation`, `glassCheap`, `facePlate`;
- **measured case tones**: every `REF_TONE` role, the three graded rail tabs,
  and the full 9×9 `faceGrid` of the face-plate map;
- **painted furniture**: card `field`/`ink`/`artEdge`, label
  `plate/ink/hairline/bevel`, tray floor/wall band/lip/rails, every moulding
  tone the face map paints, the drawn back's fallback inks;
- **shader** (linear light, the space the GLSL constants live in): the foil's
  cool/warm/magenta diffraction orders, the ice tint, the gold pair. The
  ramp's first stop — the orange — is **not** a slot: the brand accent is a
  constant anchor, as is `accent: #FF4D00` in the UI.

`retone(hex, anchors)` is the reusable rule: a tone keeps its **place** on
the measured lightness ramp and its relative chroma, and only its hue family,
overall saturation and mood move. Near-white and near-black tones are
*contrast elements* — their lightness barely follows the curve. Foil stops keep their
full angular offset from the family (a foil is a rainbow, not a swatch);
gold keeps a metallic hue and only leans with the family's warm bias.

## 3b. Typography and linework: the contrast rule, keyed to the art

Every border, rule and glyph on the card face prints in one slot, `ink`, so
`ink` *is* the typography — and it follows the **brightness of the card art**,
never the family hue:

| artwork brightness | paper (`field`) | ink (text + linework) |
| --- | --- | --- |
| dark art | the measured deep paper | white / very light, a whisper of family tint |
| light art | lifts toward the pale end of the family (`paperW = smoothstep(0.58, 0.74, artL)` blends the deep paper into the family's pale tone, so charcoal linework has a surface to bite into) | charcoal / near-black |
| mid-tone | the medium paper | **high-contrast neutral**: tint stripped to C ≤ 0.004, and the near-black / near-white end with the greater lightness distance to the paper wins |

`paperW` is continuous in the art's mean lightness, so neighbouring artworks
derive neighbouring papers and the engine glides between any two. At the
calibration point (reference art, meanL 0.456) `paperW` is 0 and the mid band
is not entered: the measured near-white-on-deep-paper face is reproduced
exactly. The label plate runs its own contrast rule against the plate's
lightness, so the header stays legible on every palette.

`scripts/analysis/_face_proof.mjs` renders real card faces for a dark, a mid
and two light artworks — the visual proof of the three tiers.

## 4. The glide

`paletteEngine` (module singleton) holds `current` and `target` and damps
`current → target` exponentially in OKLab (λ 3.4, ~95 % in 0.9 s), mutating
`current` in place. Consumers:

| consumer | how it follows | rate |
| --- | --- | --- |
| scene background, ambient + key light | `PaletteSceneRig` writes `Color`s | every frame |
| void ramp uniforms | `VoidBackdrop driver` writes `uDark/uGlow/uPale` | every frame |
| slab materials (glass, face, label, ridge, tabs, tray, card body) | `applyPaletteToMaterials` in `Slab`'s frame loop | every frame |
| foil shader orders / ice / gold | `HoloCardMaterial palette` uniforms | every frame |
| studio Lightformers (cube env must re-bake) | throttled `usePaletteSnapshot` → re-render | ≤12 Hz while moving |
| baked canvases (face, label, tray, face map) | `PaletteTextureSet` repaints **in place** | throttled per surface, exact at settle |
| Forge HUD ink | same snapshot, contrast rule | with the snapshot |

The baked surfaces cannot be uniforms, so `PaletteTextureSet` owns one canvas
per surface and repaints it in place (`needsUpdate = true`, no texture swap,
no per-frame allocation), gated on the slots each surface actually paints
(`PALETTE_GROUPS`) and on a per-surface interval while moving; at settle a
final tolerance-0 repaint lands. The exponential tail also carries a 1/255
creep (`nudgeHex`) so integer rounding cannot stall the glide short of the
target.

## 5. Guarantees

- **Identity.** With no selection the engine sits on `REFERENCE_PALETTE`,
  and a slab with no `palette` prop (the pit, the reference compare) never
  enters this code path. `verify:palette` asserts the stronger form: every
  painter produces **byte-identical** PNGs for `pal = null` and
  `pal = REFERENCE_PALETTE`.
- **The pit is untouched.** `GalleryPitPhysics` passes no palette; the shared
  material singleton and the cached textures are exactly what they were.
- **Gamut.** Every derived tone is chroma-bisected into sRGB — lightness and
  hue never bend to fit.
- **Brand.** `#FF4D00` and the foil's orange first order are constants.

## 6. Checks

```bash
npm run verify:palette                      # identity + derivation + fluidity + calibration
node scripts/analysis/_palette_sheet.mjs o.png   # contact sheet: art -> hierarchy, by eye
```

The sheet renders one row per preset artwork: the art, its mood/hue/chroma,
and the derived tonal hierarchy (void dark/glow/pale, scene, field, ink,
face mid/top, tray, plate, shell) plus the shader's linear stops as sRGB
chips.
