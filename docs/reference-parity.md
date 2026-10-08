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
| ridge rail | y 418..427, x 435..1055 (inner frame) | y 0.2070..0.2151, x 0.0346..0.9654 | `ridgeTop` 0.3472, `ridgeH` 0.0137, `ridgeInset` 0.034 |
| ridge tabs | x 459..512, 719..771, 982..1036; the only bright parts of the rail | — | `ridgeTabs` −0.3895, 0.0008, 0.3963; `ridgeTabW` 0.080 |
| window opening | x 465..1030, y 470..1295 | x 0.0797..0.9293, y 0.2543..0.9933 | `windowW` 0.8496, `windowTop` 0.4253, `windowH` 1.2396 |
| card | x 500..991, y 508..1240 | x 0.1323..0.8707, y 0.2876..0.9435 | `cardW` 0.7384, `cardH` 1.1000, `cardY` −0.1939 |
| card ring | paper 500..508, ink 510..526, paper 528..534 | ink band 0.0203..0.0508 of the card width | `ringInset` 0.0203, `ringWidth` 0.0305 |
| art frame ink | x 532..536 / 957..961, y 535..541 / 964..970 | 0.0630 in, 0.0365/0.3680 down | `artInset` 0.063, `artStroke` 0.0081, `artTop` 0.0365, `artBottom` 0.368 |
| window lip | one bright bar along the opening's top edge, x 515..976, y 474..484 | — | `slotW` 0.6933, `slotH` 0.0150, `slotTop` 0.0060, `slots` 1 |

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
| backdrop | `#b5a3b0` (top) · `#5b4153` (middle) · `#35202f` (bottom), ramp at 50° | least-squares fit over 38,833 background px, rms 8.4 (the previous stops and 16° gave 14.1) |

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
ringW     = 0.0305 × W                     // 15 px on a 492 px card (Phase 4)
ringInset = ring.inset × W + ringW / 2     // 0.0203 × W + half the stroke, i.e. 10..25 px in
radius    = bodyRadius − ringInset         // concentric with the card's own corner
```

so the stroke's centre is concentric with the card's corner. *Superseded in
Phase 4:* the photo's outer 8 px are paper, so the ink band runs 10–25 px in.

## Phase 4 — Hero render (live preview)

Three bugs were reported on the live preview: (1) the whole preview looked dimmed and the backdrop muddy; (2) a stray horizontal line across the slab at the ridge; (3) the translucent frame began in the label and cut through "BORED APE" rather than hugging the card window. Each was reproduced in a headless render of the hero canvas before it was changed.

### Root causes and fixes

| Report | Cause (measured) | Fix |
| --- | --- | --- |
| 3. outline through the label | `extrudedLayer` re-centres every layer on its own bounds. The band was built with the window's y offset (−0.207) inside its outline, so the re-centre discarded the offset and lifted the band 0.207 units: its top sat at photo y 324 instead of 461. The tray ring had the same fault. The analysis rasteriser repeated it, so the layer map agreed with the wrong render. | Layers are built about their own origin. `SlabGeometry.place` gives the world position of each offset layer (`band`, `tray`, `ridge`, `ridgeTabs`), and both `Slab.tsx` and `_render.mjs` use it. The band's outer top and bottom now sit at 274.0 and 1116.9 px, against 273.7 and 1117.3 expected. |
| 2. stray line | The rail spanned the full face (inset 0.015), and its bright material ran out to the rim. The photo's rail is the top of an inner frame, x 435..1055 (inset 0.034). Only three tabs are bright, at x 459..512, 719..771 and 982..1036; the rail body reads as the face. | `ridgeInset` 0.034. The rail takes the face tone, and three bright tabs are placed from `ridgeTabs` (centres −0.3895, 0.0008, 0.3963; width 0.080). |
| 1. dimmed and muddy | (a) The hero's backdrop used the component's dark defaults on a 9-unit plane, so the visible middle was nearly flat mid-mauve. The gradient angle was 16°; the photo's is 50°. (b) The face plate was 92 % transmissive, so the dark tray and label showed through the apron (#322c31 where the photo has #91808c). (c) The rig was about 2.7× too weak for the measured tones: the face and tray returned roughly a third to a half of their albedo. (d) The card's outer 8 px were stroked in ink; the photo's are paper. (e) The shell was fully transmissive, so its lit chamfer showed only the dark back plate. | (a) `REF_BACKDROP` refitted to the photo's background (`scripts/analysis/_bgfit.mjs`: 50°, stops #35202f / #5b4153 / #b5a3b0, rms residual 8.4 against 14.1 before), on a 4.07-unit square plane sized to the photo's frame, with the contact shadow at the case's base. (b) The face is opaque mauve (#91808c); the label and window are still cut through. (c) Environment 0.9 → 2.4, key 0.8 → 2.1, ambient 0.55 → 1.5, and the left fill cut from 0.95 to 0.4, since the photo's left side is in shadow. (d) Card ring inset 0.0203 and width 0.0305: paper outside, ink band 10–25 px in. (e) Shell transmission 1.0 → 0.2, tinted with the measured rim tone. |

Also changed: the window-top lip was four ledges with dark gaps between them. The photo's lip is one bright bar (x 515–976), so it is now one bar in the measured lip tone (`REF_TONE.lip`, #857683; `slots` 1, `slotW` 0.6933). The contact shadow is now 1.0 strength at `y −1.56`.

### Residual, measured on the hero render

`scripts/analysis/_tones.mjs` compares a DPR 1 hero grab (363 × 500 px) with the photo at matched case-relative positions. Luma ratio is hero ÷ photo:

| Surface | Photo | Hero | Ratio |
| --- | --- | --- | --- |
| backdrop, top-right | `#bbaab6` | `#b5a3b0` | 0.96 |
| backdrop, bottom-left | `#372131` | `#35202f` | 0.97 |
| backdrop, middle-right | `#826b7b` | `#816b7b` | 1.00 |
| backdrop, top-left | `#654e60` | `#745c6d` | 1.17 |
| contact shadow under the case | `#351f2f` | `#352230` | 1.07 |
| rim, lit (right) | `#947f8e` | `#7f6b7a` | 0.85 |
| rim, dark (left) | `#41323f` | `#766672` | 1.96 |
| face, top strip | `#a18f9b` | `#8b7b87` | 0.86 |
| face, left edge | `#4e404b` | `#8c7c88` | 1.89 |
| face, right | `#ae9eaa` | `#8b7b86` | 0.79 |
| rail body | `#7f6e7a` | `#847480` | 1.05 |
| label plate | `#3d2e3a` | `#403a42` | 1.20 |
| tray floor | `#44333f` | `#4f434d` | 1.27 |
| card ink band | `#463541` | `#3d3c3b` | 1.04 |
| card paper, outer ring | `#fbfbfc` | `#d1cfcc` | 0.83 |
| card paper, top margin | `#fefdfd` | `#e6e4e1` | 0.90 |

At DPR 2 each of the three rail tabs reads 164 at mid-height against the photo's 172 (0.95). The window lip is one bar now: it reads 114 along the photo's span against the photo's mean of 122 (0.93), where four separate ledges left 56-level gaps.

**Known gaps, not closed in this pass:**

- **Face gradient.** The photo's face runs from `#4e404b` at the left edge to `#ae9eaa` at the right. The hero face is uniform (about 127). The card paper in the photo is uniform as well, so a point light near the subject would grade the card too, and the photo doesn't. The gradient is therefore not a simple light falloff, and it is left as is.
- **Left chamfer** is about 2× the photo (106 against 54). The ambient term lights both chamfers equally, so reducing it would dim the face.
- **Tray floor and label plate** run 20–27 % bright. Their roughness adds a specular floor that the photo doesn't show.
- **Backdrop top-left** is 17 % bright. This is where the fit's residual is largest.
- **Translucent band.** Its sides read as a light outline. The photo's window walls are dark, and only the top edge is bright.

## Verification

```bash
npm run verify          # geometry + textures + shaders + parity
npm run verify:parity   # the table below, on its own
node scripts/analysis/_bgfit.mjs      # the backdrop fit
node scripts/analysis/_tones.mjs <hero-grab.png>   # the tone table above
```

`scripts/verify/parity-check.mjs` checks 29 features against the frozen measurements, failing past 3.5 px on the 665 × 1116 px case (7 px for the window and band left/right pair, which the photo locates to about 3 px). The band and the rail's tabs are checked from the **built** meshes with their `place` offset applied, so a position error like the one above fails here. Current state:

```
worst delta 3.34px of a 665x1116px case (tolerance 3.5px)
OK - every measured feature of the slab matches reference-image.jpg
```


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
