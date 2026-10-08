# Reference parity: card slab vs `reference-image.jpg`

Measured from the photo with `scripts/verify/ref-measure.mjs` (ImageMagick decodes
the JPEG to raw RGB, then a luminance analysis). All pixel values are sRGB 0-255
read straight from the JPEG, so they are the photo's own tones, not a colour-managed
guess. Re-run with `npm run verify:reference`.

## Phase 1 — discrepancy diagnostic (before → after)

| Dimension | Before (old shader / spec) | Reference (measured) | After |
|---|---|---|---|
| **Geometry** | slab corner radius 0.115 of width | corner arc ~25 px on a 665 px slab (0.038) | 0.0376 |
| | card face aspect 0.709 | card 491 × 697 px = 0.7045 | 0.7383 w / 1.0481 h world (0.7045) |
| | art window drawn 0.963 : 1 (not square) | art 419 × 421 px = 0.995 : 1 | art inset 0.0733 / top 0.0488 / bottom 0.3472 |
| | keyline rim missing | 8 px white keyline 0.056–0.072 card-w | drawn |
| | border 2x too thick top/bottom (H-scaled) | 8 px sides, 8–9 px top/bottom | isotropic 0.0153 card-w |
| | label plate 0.881 w, 0.2275 h | 578 × 150 px = 0.869 × 0.2256 | 0.869 / 0.2256 |
| | apron wells ×4 | no wells; apron 23 px | `slots: 0` |
| **Base material / glass** | acrylic `thickness 0.5`, blue `attenuationColor #cfe3ff` | rails track the backdrop (1.1–1.3× ratio), no blue cast | thickness 0.06, neutral attenuation, `envMapIntensity 1.15` |
| | tray floor gradient #57494f→#3b3139 (28 L*) | floor flat: #433640 / #483c46 / #463a44 / #453942 (sd 0.4–1.4) | flat #453a43 base, ±2 L* |
| | label plate #15151a (2.7× too dark) | plate #382b35 – #40343e | `REF_COLOUR.labelPlate` #453a43 |
| | baked contact well 0.78 blur | no visible well: left/right floor within 1.4 L* | 0.22 blur hairline |
| **Backdrop** | vertical gradient, bright band across slab shoulders | diagonal: BL #32222e → TR #b2a5b0 | diagonal ramp, gentle vignette |
| **Lighting / specular** | Blinn-Phong `pow(N·H,28)`, `+0.6` view term | a GGX lobe; right rail 137 L vs left 55 L | GGX (roughness 0.22) + Fresnel, key from upper-right |
| | cyan point light + #FF4D00 ring/#00E5FF circle lights | no saturated lights; 7.2 % of pixels above L 0.75 | removed; neutral key/fill |
| | bloom threshold 0.9 | max 0.93, p75 0.39 — nothing to bloom | threshold 0.78, intensity ÷3 |
| **Foil / holo** | sine-banded hue, `pow(fresnel)` glow, constant floor | art: magenta-dominant, sat 0.358 | spectral ramp weighted to the measured hue histogram, chroma clamped |
| | foil on frame (outside 0.12) | border #fbfafb sd 1.4 — no foil | `outside 0` |
| | `sin(uv*420)` grain → moiré | — | value-noise fbm; no aliasing |
| | additive foil folded into alpha (darkens art) | — | additive blend, energy capped at measured headroom |
| **Layering / contrast** | art p95 0.80, p99 0.98 | was pushed past 1.0 and clipped | foil gain 0.18 max; art left intact |

## Phase 2 — gap list (remaining, and why)

**Geometry & framing**
- Slab bottom edge fades into a ~10 px cast shadow; half-height crossing reads 1305, steepest gradient 1301–1302. Spec keeps 1302.
- Label left/right edges sit in a ~10 px bevel with a 1 px specular on top; not measured, set by hand (578 px width).
- Shell left rail vs backdrop differs by 9 L* — below JPEG noise, so the left shell edge is carried as a constant.

**Colour & translucency**
- Real acrylic transmits the backdrop; a WebGL transmission pass approximates it but will not match the JPEG's exact tone. The rails are matched to the photo's ratios, not to absolute values.
- The label carries grade and serial in the reference's bare band; the reference has no such text. Those lines are a deliberate addition (documented in `drawLabel`).

**Lighting & specular**
- The photo has one soft key from the upper right; the strip-light environment is a plausible stand-in, verified by ratio, not by a render-to-render diff (no GPU in this sandbox).

**Shimmer, noise & special effects**
- No micro-texture is visible in the reference's card face at this resolution; the wear map is kept at low amplitude.
- Foil hue is not in the photo at a measurable level beyond the art's own colours. Foil is therefore driven by the art's measured hue distribution; gold and cracked-ice have no reference and keep their previous palettes.

## Phase 3 — implementation

- `SlabSpec.ts`: every dimension in `SLAB_SPEC` is a measured pixel value divided by the slab width (665 px). `REF_MEASURE` and `REF_COLOUR` hold the source numbers.
- `textures.ts`: card face draws the measured border, keyline, art inset, footer rules and label anatomy; tray floor is flat with hairline lips.
- `HoloMaterial.tsx`: `HoloShaderMaterial` rewritten — GGX + Fresnel specular, grating-phase spectral foil with the measured hue ramp, additive foil pass with capped energy, box art mask with zero frame foil.
- `Slab.tsx`, `Backdrop.tsx`, `ForgePreview.tsx`, `ReferenceCompare.tsx`: materials, backdrop, lights, bloom and overlay guides follow the measurements.

## Verification

- `npm run verify:geometry` — geometry builds, no NaN, cache identity.
- `npm run verify:textures` — all 42 cards build face/label/back textures.
- `npm run verify:shaders` — GLSL parses (glsl-parser, three chunks expanded).
- `npm run verify:reference` — re-measures 13 edges from the photo and fails on drift > 2.5 px.
