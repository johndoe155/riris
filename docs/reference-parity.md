# Reference parity audit — `reference-image.jpg`

Layer-by-layer diagnostic of the Forge card shader against the target photo,
the gap list it produced, and the changes made. Every number here is
re-derivable with the scripts in `scripts/analysis/`:

| Script | What it recovers |
| --- | --- |
| `_target_silhouette.mjs` | outer edge / top / bottom highlight positions |
| `_target_scan.mjs` | run + colour profiles along the key scanlines |
| `_target_measure.mjs` | the consolidated feature table, corner arcs, tones, backdrop and floor profiles |
| `_foil_cpu.mjs` | a 1:1 CPU port of the overlay fragment math, evaluated in the photo's pose |
| `../verify/parity-check.mjs` | the frozen table below, re-derived from `SLAB_SPEC` on every run |

## 0. The finding that started this pass

The frozen parity table this branch carried was measured on
**`public/reference.jpg`** — a different slab (the dark Ghost-Lab card,
1488×1484, case box x 412..1077 / y 187..1303). `reference-image.jpg` is a
1920×1920 photo of another object entirely: its case box is
**x 494..1424 / y 181..1717 (930 × 1536 px)**, its card is a light full-bleed
zine cover, its label plate is blank pale blue-white, and its backdrop is a
purple studio sweep with a glossy floor. The old spec, tones, painters, light
rig and backdrop were all tuned to the wrong photo, and `verify:parity` passed
because both sides of its table came from the same wrong source.

Everything below was therefore re-measured from the target first, and the
harness re-frozen against it.

## 1. Anatomical discrepancy diagnostic

### 1.1 Geometry, aspect & edge profile

| | previous model | reference | verdict |
| --- | --- | --- | --- |
| case aspect w/h | 0.5963 | 930/1536 = 0.6055 | case was 1.5% too tall |
| corner radius | 0.115 of min(w,h) (76.5 px) | 45 px = 0.0484 | corners more than 2× too round |
| corner profile | superellipse, power 5.2 | near-circular, inset 19/12/9/8 px at y+8/14/20/26 → power ≈ 3 | squircle read as a soap bar |
| moulded rim | one 10 px step (`stepInset 0.015`) + face apron | 51 px rim carrying **four** hairlines at px 494 / 509 / 521 / 539 | the case's whole read was missing two steps |
| label plate | w 0.878, h 0.228, top 0.060 | w 0.811, h 0.213, top 0.062 | plate too wide/tall |
| rail | 3 bright tabs on a 0.84-wide rail, h 0.0137 | one continuous moulding, window-wide, h 0.0354 (px 446..479) | tabs invented |
| window | w 0.850, top 0.425, h 1.240 | w 0.887, top 0.321, h 1.266 | window sat 10% of a case-height too low and too narrow |
| card | w 0.738, top 0.482, h 1.100 | w 0.794, top 0.407, h 1.096 | card too small and too low |
| card corners | 0.042 | 48 px = 0.0516 | too tight |
| retaining rails | absent | two 11 px bright lines at px 576..587 / 1327..1338, y 602..1535 | missing layer |
| bottom lip bar | absent | bright bar px 1588..1602, x 642..1270 | missing layer |
| top lip bar | at the window's top edge | 63 px *below* it, inside the apron (px 543..548) | misplaced |
| card face furniture | paper ring + 4 px ink frame + attribute grid | none — full-bleed cover | invented structure |

`verify:parity` now holds all 34 features to **worst 1.97 px** on the 930×1536
case; the residual is the window's left edge, a ~14 px ramp where the acrylic
wall darkens (row y=960: 541..555), which cannot be located better than ~2 px.

### 1.2 Base material, translucency & glassmorphism

- The shell was `transmission 0.2` with `color #8a7685`: an **opaque mauve
  box**. The target's rim is polished *transparent* acrylic — near-white
  hairlines (peak luma 250, 2–3 px) around flats that are reflections of the
  room (#9b8096 shadow side, #b095ad lit, #d4c8d2 / #b6a9b3 mid steps).
  Now `transmission 0.62`, `roughness 0.06`, `ior 1.49`, `clearcoat 1`,
  white base with a long mauve attenuation (2.4) so the tint arrives by
  thickness, not by pigment.
- The face plate was an opaque `#91808c` apron filling the area around the
  window. The target has **no apron**: the rim ring is 51 px and everything
  inside it is the window. `stepInset` 0.015 → the plate now starts at the
  second hairline (px 509) and the frosted band covers px 521..545.
- The band was near-white frost (`#eef1f7`, opacity 0.5) — it lit the rim like
  a lamp. Measured it is mid mauve `#b1a0b0` with a hairline per bevel.
- The tray was `#483a45` with a white "apron wash" gradient. Measured:
  `#705969` top → `#64505e` mid → `#5d4555` bottom, flat to ±4 luma, no wash.
- The label plate was `#3b2a36` with printed type and a QR mark. The target's
  plate is **blank**, a cool pale `#e3e9f0` (luma 232, uniform ±1), with only a
  1–2 px darker recess rim and a top sheen.
- The card body was `#3a2b35` dark plum. The target's stock reads light; only
  its cut edge sits in shadow (`#3d2c36`, 2–3 px).

### 1.3 Lighting, specular & fresnel model

- Environment carried a `#FF4D00`-era coloured rig replaced by a neutral key —
  but placed for the wrong photo. The target's evidence: top edge hairline +
  plate sheen + both lip bars bright ⇒ broad **overhead** softbox; backdrop
  right column up to **+74 luma** over the left at the top of frame, closing to
  +7 at the floor ⇒ key **high right**; cover flat at luma 233 across its whole
  face ⇒ large weak **frontal fill**; rim bottom steps and floor smear pink ⇒
  **bounce card below** in the sweep's hue. The rig is now exactly those four
  formers plus two narrow vertical strips for the rim's bevel hairlines.
- Bloom threshold 0.9 / intensity 0.12 left the case's edge fire un-bloomed in
  the base finish; the photo's hairlines do bloom. Threshold 0.88, intensity
  0.3 for base.
- Fresnel/specular in the foil shader were fine in form; what was wrong was
  that they were **added to constants** (below), so they never reached zero.

### 1.4 Surface details & micro-textures

- Invented: a 420-line scanline comb (`sin(vUv.y*420)*0.015`) and a 12%
  corner vignette in the base path. The target's cover is flat to ±1 luma —
  both removed.
- Invented: paper ring, ink frame, attribute grid, owner bar on a card that is
  one printed panel. `fullBleed` cards now draw the cover edge-to-edge with
  only the 2–3 px shade the acrylic wall casts on it.
- Missing: the two retaining rails and the bottom lip bar. Both are flat in
  the photo (no relief, no specular travel), so they are painted into the tray
  texture at their measured boxes rather than modelled.
- Kept: the wear roughness/bump maps, at reduced scale (0.006/0.004) — the
  target's acrylic is cleaner than the old scuffed shell.

### 1.5 Layering, contrast & blending

- The foil overlay blended at **rest**: mask floor 0.06 + pointer glow 0.45
  gave α ≈ 0.31 of rainbow over the cover's centre in the store's default
  `holo` finish — in the exact pose the photo holds. `_foil_cpu.mjs` measures
  the wash at mean saturation 0.153 over the paper against the reference's
  0.128; after the change the same metric is 0.130 (i.e. the art, unchanged).
- The overlay leaked outside its mask (`uOutside 0.015`) and its mask was the
  old photo's art window, not this card's face. Now `uOutside 0` and, for
  full-bleed cards, the mask is the whole face feathered at the silhouette.
- The backdrop was a 50° diagonal ramp fitted to the wrong photo, on a wall
  with no floor. The target is a vertical wall ramp (top #a886a1 → 62%
  #2b1429 → floor line #5e3b55) + a right-hand lift masked off toward the
  floor + a glossy floor from y 1717 with the slab's own reflection smear
  (#806578, one case-width) + a ~10 px contact shadow (#492d42). The hero wall
  plane is now sized to the camera's visible frame (3.766 units at z = −6 for
  fov 16), so texture space *is* photo space and all four land where measured.

## 2. Gap list (as found)

**Geometry & framing**
- case 1.5% too tall; corners 2× too round; squircle power wrong
- rim had 1 moulding step where the target has 4 hairlines / 3 steps
- label plate oversized; rail carried 3 invented tabs and was too thin
- window 10% of a case-height too low and 4% narrow; card small, low, tight-cornered
- top lip bar at the opening instead of 63 px below it; rails and bottom lip absent
- card face carried ring + frame + furniture the target does not have

**Colour & translucency**
- shell opaque mauve instead of clear acrylic; face plate an opaque apron
- band frosted white instead of mid mauve; tray 20 luma too dark with a white wash
- label dark + printed instead of blank pale; card body dark plum instead of light stock

**Lighting & specular response**
- rig placed for the wrong photo: no overhead softbox, key not high-right, no frontal fill, no pink bounce
- edge hairlines did not bloom; foil fresnel/spec added to non-zero constants

**Shimmer, noise & special effects**
- foil visible at rest (α ≈ 0.31 rainbow wash, default finish `holo`)
- foil leaked outside its mask; mask was the wrong card's art window
- scanline comb + vignette inventing structure; grating bands across flat print

## 3. What changed, where

| File | Change |
| --- | --- |
| `slab/SlabSpec.ts` | re-measured spec (aspect 1.6505, radius 0.0484/power 3, stepInset 0.0161, band 0.0258, label/window/card boxes, slot 0.0677/0.0054/0.6753, zeroed ring/art), `REF_TONE` re-sampled, tray layout gains `rails` + `lipBottom` |
| `slab/geometry.ts` | unchanged in shape — it derives from the spec; empty `ridgeTabs` now yields no tab meshes |
| `slab/textures.ts` | `fullBleed` face path; blank pale label plate; measured tray gradient + painted rails + bottom lip |
| `slab/useSlabTextures.ts` | passes `fullBleed` through |
| `slab/Slab.tsx` | clear-acrylic shell/face, mauve band, pale label, light card stock, bright lip; blank label + full-face foil mask for full-bleed cards; `uOutside 0` |
| `HoloMaterial.tsx` | `uHover` gate (foil is exactly zero at rest), motion-driven mask with no constant floor, per-finish amounts start at 0, scanline + vignette removed, base lift 0.99 |
| `slab/Backdrop.tsx` | measured photo-frame painter (wall ramp, right lift, floor, reflection, contact shadow); hero wall sized to the visible frame |
| `ForgePreview.tsx` | four-former rig from the photo's lighting evidence + weak frontal light + pink bounce; bloom 0.88/0.3 |
| `data/slabCards.ts` | `fullBleed` flag; the reference slab (`/cards/rainbow-zine.jpg`, extracted from the photo's own card region) is entry 000 and the Forge default |
| `verify/parity-check.mjs` | table re-frozen against `reference-image.jpg` (34 features, worst 1.97 px) |

## 4. Checks

```bash
npm run verify          # geometry + textures + shaders + parity
npm run verify:parity   # 34 measured features against reference-image.jpg
node scripts/analysis/_foil_cpu.mjs   # rest-state foil vs the photo's cover
node scripts/analysis/_target_measure.mjs   # re-derive every number above
```
