# Reference parity: `reference-image.jpg` → the slab

Everything in this document is a measurement. The reference is
`reference-image.jpg` (1488 × 1484, the same file as `public/reference.jpg`),
and every number quoted from it was recovered by the scripts in
`scripts/analysis/` — no parameter below was picked because it looked nice.

## 0. How the reference was measured

The photo is close to orthographic, which is what makes this tractable: the
case's left and right edges are 665 px apart at every row from y 219 to y 1275,
and the top and bottom edges are flat across the full width. So a pixel
fraction of the case box *is* the dimension, with no perspective correction.

| Tool | What it recovers |
| --- | --- |
| `_track.mjs` | the case box by background-deviation tracking: **x 412..1077, y 187..1303**, i.e. 665 × 1116 px, ratio 0.5959 |
| `_lines.mjs` | long vertical/horizontal edge runs → every internal boundary |
| `_scan.mjs` | per-row/column transition lists with the colour on each side |
| `_corner.mjs` | the corner arc, sampled as the contour's inset per row |
| `_ridge.mjs` | the ridge's height, its luminance above the face, and the top strip / bottom ledge profiles |
| `_card.mjs` | the card's box, its ring line, the art frame's ink, and every text block |
| `_bg.mjs` | the backdrop's diagonal gradient and the contact shadow |
| `_render.mjs` | a software rasteriser: the repo's **real** `buildSlabGeometry()` output drawn with the measured scale and camera, so layer boundaries can be compared in the same units |
| `_beforeafter.mjs` | the parity table run against the spec at `HEAD` and against the current one |

### The measured table

Fractions are of the case (x: 0 at the left edge; y: 0 at the top edge).
World units are the repo's own convention: 1 slab width, y measured down from
the top edge, so multiply an image-x fraction by 1 and an image-y fraction by
`h = 1.677`.

| Feature | Photo px | Case fraction | World |
| --- | --- | --- | --- |
| case | 665 × 1116 | 1 × 1.6770 | `w` 1, `h` 1.6770 |
| corner radius | 76.5 | 0.115 of min(w,h) | `radius` 0.115 |
| corner profile | inset 10 px by 1.8 % of the corner | superellipse, exponent ≈ 5.2 | `cornerPower` 5.2 |
| rim chamfer | 10 px dark band inside the silhouette | — | `stepInset` 0.015 |
| label plate | x 452..1036, y 227..379 | x 0.0600..0.9383, y 0.0358..0.1720 | `labelW` 0.8781, `labelTop` 0.0600, `labelH` 0.2284 |
| ridge | y 418..427, full face width | y 0.2070..0.2151 | `ridgeTop` 0.3472, `ridgeH` 0.0134 |
| window opening | x 465..1030, y 470..1295 | x 0.0797..0.9293, y 0.2543..0.9933 | `windowW` 0.8496, `windowTop` 0.4253, `windowH` 1.2396 |
| card | x 500..991, y 508..1240 | x 0.1323..0.8707, y 0.2876..0.9435 | `cardW` 0.7384, `cardH` 1.1000, `cardY` −0.1939 |
| card ring | hugs the card edge, 8 px | 0.0000..0.0163 of the card width | `ringInset` 0, `ringWidth` 0.0163 |
| art frame ink | x 532..536 / 957..961, y 535..541 / 964..970 | 0.0630 in, 0.0365/0.3680 down | `artInset` 0.063, `artStroke` 0.0081, `artTop` 0.0365, `artBottom` 0.368 |
| hanger ledge | 60 × 15 px at the window's top edge | — | `slotW` 0.088, `slotH` 0.0225, `slotTop` 0.0015 |

### The measured tones

| Surface | Measured | Note |
| --- | --- | --- |
| case face, top strip | `#baa9b5` | catches the overhead light |
| case face, mid | `#91808c` | beside the window |
| rim, left | `#42333f` | the chamfer is **darker** than the face |
| rim, right | `#8a7685` | same chamfer, on the lit side |
| ridge highlight | `#afa6af` | +0.08 luma over the face, no more |
| window floor | `#483945` → `#42333f` | flat; rails within 0.02 luma of the middle |
| label plate | `#3b2a36` | warm dark mauve, not black |
| card body | `#473642` | dark mauve card with white ink |
| backdrop | `#b9a8b4` (top-right) → `#34202d` (bottom-left) | a *diagonal* ramp |

---

## Phase 1 — Diagnostic

### 1. Geometry, aspect and edge profile

**Aspect.** The model was `w 1 × h 1.6611` (0.6020). The measured case is
665 × 1116 (0.5959). On a 665 px-wide case the old model was **7 px too tall**.

**Edge profile.** The reference's outer contour is not a rounded rectangle: its
corners are superelliptical. Measured inset of the contour per row from the top
edge: 4 px at dy 0, 10 px at dy 4, 20 px at dy 30–38, then the tangent point at
40 px of a 76.5 px radius — i.e. the arc reaches 20 px of inset while only 40 px
down the corner, where a circular fillet would be at 74 px. The model used
`cornerPower 4.6`, whose kappa (0.5523 + 2.6 × 0.045 = 0.669) put the tangent
point 20 px from the corner. Power 5.2 (kappa 0.7076) matches the measured arc
within 2 px from the tangent point out to the straight edge.

**Moulding step.** The reference's front is not one plane. Walking in from the
left edge at any row: `#42333f` for 10 px (the rim), a bright 3 px line, then the
face at `#91808c`. The model had a single extruded shell with a 0.02 bevel and
**no face plate at all**, so it had neither the dark rim nor the hairline.

**Layer boundaries.** From the rasterised geometry against the reference
(fractions of the case height):

| Boundary | Reference | Model (before) | Δ | Model (after) |
| --- | --- | --- | --- | --- |
| window top | 0.2543 | 0.1900 | **−71 px** | 0.2543 |
| window bottom | 0.9933 | 0.9550 | −43 px | 0.9933 |
| ridge top | 0.2070 | 0.1797 | −31 px | 0.2070 |
| ridge bottom | 0.2151 | 0.1918 | −26 px | 0.2151 |
| card bottom | 0.9435 | 0.9175 | −29 px | 0.9435 |
| card top | 0.2876 | 0.2895 | +2 px | 0.2876 |
| label top | 0.0358 | 0.0332 | −3 px | 0.0358 |
| hanger ledge | 60 × 15 px | 9 × 67 px | −51 / +52 px | 58 × 15 px |

The window being 71 px high of where it belongs pushed the whole window, tray,
card and apron down; and the "hanger wells" were modelled as four deep pockets
(67 px tall, 9 px wide) across the apron, when the reference has small ledges at
the window's top edge. Worse, the placement rule clamped them with `min()`
against the card's top edge — i.e. *below* it — so they floated in front of the
card's own artwork.

### 2. Base material, translucency and glassmorphism

- The case is a **tinted, matte-ish acrylic**: the face reads `#91808c`, which is
  0.06 *lighter* than the backdrop beside it and carries the backdrop's own hue.
  The model's `glass` was near-clear with `envMapIntensity 1.65` and a blue
  attenuation (`#cfe3ff`, 2.2 units), so it read as blue-white glass on a warm
  page.
- The rim's own tone is a fact of the *geometry*, not the material — see above.
- The tray/floor was `#232329` (roughly 0.30 luma) against a measured `#483945`
  (0.28 luma but 0.10 saturation). The value happened to be close; the **hue
  was not**, and the model's floor carried a `#57494f → #3b3139` gradient plus a
  0.42-alpha white "apron wash" that the photo has no trace of.
- The card body was `#fbfbfb` — white. The reference's card is `#473642`.

### 3. Lighting, specular and Fresnel model

- The environment was six lightformers including a `#FF4D00` ring at intensity
  4 and a `#00E5FF` circle at intensity 3, plus a cyan point light in the scene.
  Nothing in the reference supports them; they are the source of the case's
  colour cast, and they fight the measured `#91808c` face directly.
- Camera: `fov 32` at z 4.2. The reference's cone is under 2° wide, so the model
  showed ~40 px of keystone across a 665 px case — the near edge of the case
  measured wider than the far one, which no amount of material tuning fixes.
- The ridge was `#f2f5fa` at `envMapIntensity 1.8`: 0.9 luma against a 0.55 face
  in the model, where the reference's ridge is 0.68 against a 0.57 face.

### 4. Surface details and micro-textures

- The reference's ridge is a **single full-width moulding line** (x 420..1075,
  y 418..427). The model had an 0.84-wide band with two elements — a ridge and a
  separate label border — which is why the top of the case read as two competing
  frames.
- The ring: the reference's white frame is *on* the card's edge (the card's left
  edge and the ring's outer edge are the same line at x 500, and the ring's inner
  edge is at 508). The model inset the ring 0.008 of the card width (4 px) and
  drew it 0.0143 wide — one pixel thinner, four pixels in, plus an extra
  `strokeRect` on the art window at 0.0035 of the card width.
- The art frame's ink is 4 px in the reference; the model stroked it at 0.0035 ×
  492 = 1.7 px.
- Hanger ledges: see above.

### 5. Layering, contrast and blending

- The **foil mask** was feathered by 0.06 in card UV and spilled at 0.12 outside
  the mask, so the rainbow smeared ~30 px past the art window and onto the card's
  white frame and its title and attribute text. The reference's foil stops dead
  on the art frame's ink.
- Foil pattern: the model used a polar spiral centred on the pointer
  (`atan(vUv - uPointer) × 6`), which reads as a lens flare. Diffraction from a
  holographic foil is a family of near-parallel orders from an anisotropic
  grating.
- The Foil gradient's four stops were fully saturated primaries.

---

## Phase 2 — Gap list

### Geometry & framing

- **Case aspect** 0.6020 vs 0.5959 — the case was 7 px too tall.
- **Corner profile** kappa 0.669 vs the measured 0.7076 — corners cut in too far
  before the tangent point.
- **No front-face plate**, so the reference's 10 px dark rim and the bright
  hairline inside it did not exist.
- **Window top 71 px high**, window bottom 43 px high — the window, tray, card
  and apron all sat low.
- **Ridge 31 px high, 0.84 wide, 13 px tall** vs the measured y 418..427 across
  the full face — two competing frames at the top of the case.
- **Card 29 px short** (0.9175 vs 0.9435 at the bottom), so the card did not
  reach the bottom ledge.
- **Hanger ledges 9 × 67 px** where the reference has 60 × 15 px, and placed
  below the card's top edge instead of in the apron.
- **Camera fov 32** vs the reference's near-orthographic cone.
- The art frame's stroke was 1.7 px against a measured 4 px; the card ring was
  1 px thin and 4 px inside the card's edge.

### Color & translucency

- Case tint blue-white (`#cfe3ff`) vs the measured mauve-neutral.
- Tray `#232329` vs `#483945`, plus a gradient and a white apron wash that the
  photo does not contain.
- Card body white (`#fbfbfb`) vs `#473642`.
- Label plate `#15151a` vs `#3b2a36`.
- The rim was not modelled at all, so its measured `#42333f`/`#8a7685` pair had
  nowhere to come from.
- Backdrop was a vertical ramp with a pool of light in the centre; the reference
  is a diagonal ramp, light off to the right.

### Lighting & specular response

- Environment: orange ring (4.0) and cyan circle (3.0) lightformers plus a cyan
  point light — no support in the reference, and a direct cause of the cast.
- `envMapIntensity` 1.65/1.9 on the case; the face is within 6 % of the backdrop.
- Ridge at 1.8 with a `#f2f5fa` colour: a blown highlight where the reference has
  a restrained one.

### Shimmer, noise & special effects

- Foil feather 0.06 and `uOutside` 0.12 spilled rainbow onto the frame and text.
- Polar-spiral foil bands (a lens flare, not a grating).
- Fully saturated foil stops with no white mixing.

---

## Phase 3 — Implementation

| File | Change |
| --- | --- |
| `slab/SlabSpec.ts` | every measured number, with the photo px it came from; new `stepInset`, `faceLift`, `ridgeInset`, `ridgeTop`, `ridgeLift`, `artStroke`; `REF_TONE` (the measured tones) |
| `slab/geometry.ts` | new `face` layer (silhouette inset one step, proud of the body) — the moulding step; the ridge is now one full-width low bar; the hanger ledges are 60 × 15 px and clamped *above* the card; `labelInner` deleted (the lip is painted) |
| `slab/textures.ts` | tray rebuilt to the measured (flat, no glow); the ring strokes on the card's own silhouette; the art frame strokes at the measured width; label plate tone + painted lip; card ink `#473642` |
| `slab/Slab.tsx` | `face` material + mesh; retuned glass/band/ridge/tray/card/label materials; `REF_TONE` wired in |
| `slab/Backdrop.tsx` | diagonal gradient (with `angle`), tight contact shadow, and `REF_BACKDROP` — the measured photo backdrop |
| `HoloMaterial.tsx` | mask defaults from the measured art window, feather 0.06 → 0.012, `uOutside` 0.12 → 0.015, a grating-based foil instead of the polar spiral, desaturated foil stops |
| `ForgePreview.tsx` | neutral key/fill/bounce rig (the orange ring and cyan circle removed), `fov 32 → 16`, cyan point light removed |
| `ReferenceCompare.tsx` | guide rectangles re-derived from the measurement, measured backdrop |

Exact math, for the two changes that are easy to get wrong:

**Rim chamfer.** The face plate is a second extrusion of the same silhouette
inset by `stepInset = 0.015` (10 px), lifted `faceLift = 0.008` in front of the
shell body (`zShellFront = 0.037`, `zFront = 0.045`), with a 0.006 bevel. The
step's own edge, seen head-on, is the dark 10 px band; the face plate's bevel is
the bright hairline at its inner boundary. Its corner radius is
`faceRadius = radius − stepInset/2`, so the moulding keeps a constant width
through the corner.

**Ring on the silhouette.** Stroke an inset path by half the stroke width:

```
ringW     = 0.0163 × W                     // 8 px on a 492 px card
ringInset = ring.inset × W + ringW / 2     // = 4 px, i.e. the stroke's centre
radius    = bodyRadius − ringInset         // concentric with the card's own corner
```

so the stroke's outer edge lands exactly on the card's silhouette instead of
floating 4 px inside it.

## Verification

```bash
npm run verify          # geometry + textures + shaders + parity
npm run verify:parity   # the table below, on its own
```

`scripts/verify/parity-check.mjs` re-derives 20 features from `SLAB_SPEC` and
compares them with the frozen measurements, failing past 3.5 px on the 665 ×
1116 px case. Current state:

```
worst delta 3.01px of a 665x1116px case (tolerance 3.5px)
OK - every measured feature of the slab matches reference-image.jpg
```

The 3 px residual is the window's horizontal edges: its left edge is a 15 px
ramp in the photo where the acrylic wall darkens, so the pair can only be
located to about 3 px. Everything with a hard edge is within 1 px.

## What is *not* claimed

- The reference is a **photo of a real graded slab**; its art, title, traits and
  the two-letter grade are the card's own content, not the case's. This pass
  matches the *case anatomy* and the material/tonal response. The drawn card
  furniture (title, attribute grid, contract rows) is the harness's own design.
- Colour parity is matched as tone and cast, not by pixel: three's tone mapping,
  the transmission pass and the environment's own resolution all move the final
  value, and the reference's backdrop is reproduced as a gradient rather than as
  an HDRI.
- The foil finishes (`holo`, `cracked-ice`, `gold`) have no counterpart in the
  reference — it is a flat-lit frontal shot of a `base` card. Their behaviour was
  tightened (masking, grating) but not "matched", because there is nothing to
  match them against.
