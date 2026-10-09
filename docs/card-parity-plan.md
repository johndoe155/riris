# Reference-parity plan — card face, stray elements, case construction

Target: `public/reference.jpg` (1488 × 1484; case box x 412..1077, y 187..1303 = 665 × 1116 px).
All numbers below were re-measured from the photo with `scripts/analysis/_measure.mjs`
(row/col runs, band projections, tone boxes). Conventions:

- **photo px** — absolute pixels of the 1488 px photo.
- **case fx/fy** — fraction of the 665 × 1116 case box.
- **card fx/fy** — fraction of the card box (x0 500, y0 508, 491 × 697 px).
- **world** — slab units (case width = 1, photo case height = 1.677).

The frozen table in `scripts/verify/parity-check.mjs` has itself drifted (it currently
fails 11 features: case radius, window width, card box, art frame). It gets re-frozen
to the measurements in §4 as part of the fix.

---

## 0. Headline finding: the card box in the spec is wrong

Measured card box: **x 500..991, y 508..1205** (491 × 697 px). The spec carries
`cardW 0.79` (525 px), `cardH 1.12` world (745 px) and a bottom edge at photo y 1240 —
the card is ~7 % too wide, ~7 % too tall and hangs 35 px too low. Every card-face
complaint (crushed gutters, small text, footer touching the frame, "reflowed" table)
is downstream of this one error: the painter lays out a fixed px grid into a card box
that is the wrong shape, so the furniture floats in the wrong proportions.

The photo's own bottom margin is already symmetric (window bottom 1292 − card bottom
1205 = 87 px = the side margin), so the spec's +0.0362 world "bottom extension"
(`h: 1.7132`) is also unjustified: **h returns to 1.677**.

---

## 1. Card face

### 1.1 Trait table reflowed
- **Measured:** three left-rules (3 px wide, y 1010..1110) at x **528 / 659 / 812**;
  text indented +5 px from each rule; column occupancy **[3, 2, 2]**
  (BACKGROUNDS/EYES/MOUTHS · BASES/HANDS · BODYWEAR/HATS). Row pitch 37 px;
  label cap 9 px at y 1015/1052/1089; value cap 8 px, +14 px under its label.
- **Root cause:** `drawCardFace` (`textures.ts`) fills columns with
  `rows = traits.length >= 7 ? 3 : 2` → [3, 3, 1], and draws its two *inter-column*
  dividers at full 3-row height, which is the "long divider beside a single entry".
- **Fix:** explicit column counts `[3,2,2]`; draw one rule at the **left of every
  column** at card-fx `0.0570 / 0.3238 / 0.6354` (width 0.0061 card-fx), all three
  spanning exactly card-fy `0.7202..0.8637` regardless of how many entries a column
  has; text indent 0.0102; label em 0.018 card-fy (cap 9 px), value em 0.016, pitch
  0.0531, value offset 0.0201.

### 1.2 Crushed margins / lost double-border structure
- **Measured:** white rounded keyline stroke 501..507 (7 px) sits **flush with the card
  edge** (inset ≈ 1 px, corner radius 24 px); dark gutter 508..527 (20 px); square-
  cornered art frame stroke 528..534 (7 px); art inner window 536..956 × 542..963.
  Gutter from keyline outer edge to art frame = 27 px = 5.5 % card-w.
- **Root cause:** `drawCardFace` insets the keyline by `W*0.035` with a `W*0.018`
  stroke (outer edge at 3.5 %) while the art frame sits at 6 % → a 2.5 % gutter and
  two frames hugging each other; keyline radius `bodyRadius*0.72` ≈ 1.6 % vs the
  reference's fat 4.9 %.
- **Fix:** keyline inset 0.002, stroke 0.0143, radius 0.0489 (card-fx); art frame
  outer inset 0.0570 (x) / 0.0387 (top) / 0.3372 (bottom from bottom), stroke 0.0143,
  square corners. Body silhouette radius (`SLAB_SPEC.cardRadius`) 0.018 → **0.0361**
  world so geometry and paint share the fatter corner.

### 1.3 Art cropped / zoomed ~15 %
- **Measured:** source art `Gjw0CRRXoAMjU8i.jpg` is 460 × 413 (aspect 1.114); the
  reference window is 421 × 422 (aspect 1.0) and shows the **whole source**:
  letterbox bars ≈ 21 px top/bottom (content rows 567..934), full width.
- **Root cause:** `drawCardFace` cover-fits (`sw = art.height * wr` crops the sides
  by ~10 %), clipping the top-right sparkle and pushing the leaf to the edge.
- **Fix:** **contain-fit**; fill the letterbox bars with the source's own edge-row
  colours (top `#463541`, bottom `#774167` family) so the window background gradient
  stays continuous; draw with `imageSmoothingEnabled = false` whenever the window
  upsamples the source (≥ 2×, i.e. pixel art at the 2048 tier) and high-quality
  smoothing only when genuinely downscaling photo art.

### 1.4 Text size / mush
- **Measured caps:** title 16 px (top 985, left 527); trait label 9 px; value 8 px;
  meta 9 px (rows 1130, 1149; right group right-aligned at 962); footer 10 px
  (top 1175; left 528, middle group centred at 770 = 0.55 card-fx, right 964);
  rules 3 px at y 1122..1124 and 1165..1167 spanning x 527..964.
- **Root cause:** painter sizes (title 0.052 W, label 0.019 W, value 0.016 W, meta
  0.014 W, footer 0.016 W ems) render caps 25–40 % under the photo's, and the old
  card box stretched them over a taller band; the cheap tier (768 px) aliases.
- **Fix:** sizes from the measured caps (em ≈ cap/0.72): title 0.0326 card-fx em,
  label 0.0256, value 0.0224, meta 0.0265, footer 0.028; layout anchored to the
  fractions above; `FACE_TIERS.cheap` 768 → 1024; keep anisotropy 16 + trilinear
  (already set) — with correct caps the small text no longer lives in 6 px of texel.

### 1.5 Hot / contrasty colour, soft pixel edges
- **Root cause:** the face plane is a lit `meshStandardMaterial` under ambient 1.5 +
  directional 2.1 + env 2.4, so printed inks multiply past their texture values;
  art is drawn with `imageSmoothingQuality='high'`.
- **Fix:** face plane → **unlit** `meshBasicMaterial` (map + `toneMapped={false}`),
  so the card reads exactly as painted and the acrylic veil in front of it supplies
  the measured lift (printed `#352334` → through-case `#473844`); nearest-neighbour
  art per §1.3. Foil overlay mask updated to the new art window
  (`[0.0733, 0.3472, 0.9267, 0.9512]` card UV).

---

## 2. Stray elements — each one is a real mesh or plane, identified

| # | Symptom | Culprit (measured) | Fix |
|---|---------|--------------------|-----|
| 1 | full-width white line across the footer, overshooting into the case walls | `geometry.ts` `edgeTabs` **bottom trio**: three 0.16-wide bright boxes at y −0.6166 (photo y ≈ 1168, x 465..1024 — 35 px past each card edge), drawn at z = ridge+0.003, i.e. in front of everything | delete the six `edgeTabTop` bars |
| 2 | white "underline" beneath COLLECTION on the label | the same `edgeTabTop` **top trio** at y +0.6166 → photo y ≈ 347, exactly under the second title line, floating in front of the label face | (same deletion) |
| 3 | long flat white bar at the top of the window | `geo.slots` box (0.6933 × 0.015) with `mat.slot` `#b5a5b3` **plus** the painted white lip gradient in `drawTray`. Photo: window top wall is an 8 px band at L124 — *face tone, slightly darker*, not a bright bar | delete the slot meshes + `slot` material; repaint the tray top edge as an 8 px `#8a7986` band |
| 4 | bright white slivers on both side walls | `edgeTabSide` × 4: 0.008 × 0.16 (107 px tall) bright `#d8cbd6` at y ±0.34. Photo: one **muted** moulded tab per wall, x ≈ 438..446, y 647..697 (51 px), L182 on the dark left wall | replace with two tabs (w 0.012, h 0.0765 world, y 0.1281) in muted `#9d8f9c`/`#b0a2b0` |
| 5 | hard-edged pale rectangle right of the case, dark strip left | `Backdrop` wall is 4.07 × 4.07 at z −6 but the fov-38 hero camera sees 6.34 × 4.76 there — the wall's own edges are inside the frame; beyond them the clear colour shows | size the wall to cover the view (≈ 8 × 7) and let the canvas gradient **clamp** past the calibrated photo frame, so no edge exists |

---

## 3. Case construction & material

### 3.1 Opaque matte mauve, no gradient
- **Measured face tones:** top strip `#92818d`, apron `#8c7b87`, left-mid `#40303c`,
  right-mid `#907f8b` (speculars to L199), left-bottom `#352531`, bottom `#423440`;
  rim left `#3b2a37`, rim right `#907e8b`.  I.e. a diagonal sheen: lit top/right,
  deep purple bottom-left/bottom-right corner.
- **Fix:** new painted **face map** (`drawFaceMap`, one canvas, case-UV) applied to
  the face plate through the extrusion's shape-space UVs (`repeat = 1/faceW,1/faceH`,
  `offset = .5,.5`): diagonal base ramp through the measured stops, dark left rail,
  lit right rail with a narrow specular streak, 10 px dark chamfer band + bright
  step hairline inside the silhouette, window-top wall band, ridge hairline/shadow.
  Material keeps clearcoat 0.8 / roughness 0.22 so the strip lights still drag a
  sheen; shell glass colour lightened (`#a493a2`, roughness 0.06, envMapIntensity 2)
  so the moulded walls read as lit smoky plastic, and `faceLift` 0.005 → 0.007 to
  re-separate the face plate from the shell body.

### 3.2 Flattened bevel tiers
- The three tiers (rim chamfer → step hairline → window lip) exist geometrically but
  shade identically. The face map paints the measured 10 px `#3b2a37`/`#907e8b`
  chamfer band and the bright hairline at the step; the shell bevel supplies the
  real parallax edge. Window lip: 8 px `#8a7986` band (tray texture top edge).

### 3.3 Window cavity reads as a black hole
- **Measured cavity:** apron `#473843`, below-card `#473844`, left rail `#43333f`,
  right rail `#685864` (lit). Current tray texture paints blue-white rail washes and
  a pale bottom lip the photo doesn't have, and the tray ring wall is flat `#3c2d3c`.
- **Fix:** recolour tray rails to the measured mauves, delete the bottom pale lip,
  keep the tight contact shadow; tray ring material colour → `#473642`; the lit
  shell hole wall (3.1) closes the gap around the card.

### 3.4 Label inset border too bright / thick
- **Measured:** no white keyline; plate `#3d2e3a` with only a thin lavender bevel
  hairline (L ≈ 74) at the lit right edge.
- **Fix:** replace the white `W*0.006` inset stroke with a 0.004 W lavender
  (`#6b5a68`) hairline plus a 2 px right-edge bevel highlight.

### 3.5 Label logo blurry / pink
- **Root cause:** `public/logo-reference.png` is **150 × 126** upscaled ~2.4× into the
  2048 px plate (blur), and its semi-transparent fringe picks up the plate tint.
- **Fix:** draw the mark as vectors in `drawLabel` at plate resolution — three fanned
  rounded cards (−12°/−3°/+10°), black outer stroke, white bodies, orange
  `#e2622a`/`#ef7f35` panels, middle card orange-bodied — into the measured slot
  (x 892..995, y 262..343 → 0.178 W × 0.54 H centred at 0.8416 W). Title left pad
  0.085 → 0.0702 W (caps 34 px, lines top 263/306 already match).

### 3.6 Shoulder step & notch dashes
- **Measured:** rail = face tone + 1 px hairline at y 418 (+25 L) + 1 px shadow at
  y 427 (−35 L); tabs y 421..427 with **graded** brightness left→right
  (L125 / L173 / L199-233). Current: full-height rail at face tone plus three
  identical `#d8cbd6` full-rail-height tabs = "bright flat bars".
- **Fix:** hairline + shadow painted in the face map at the rail rows; tab geometry
  height reduced to the 6 px band (y 421..427) and each tab gets its measured tone
  (`#7d6c7a`, `#ad9cab`, `#c7b6c4`).

---

## 4. Spec re-freeze (`SlabSpec.ts` → `parity-check.mjs`)

| feature | old | new (measured) |
|---|---|---|
| `h` | 1.7132 | **1.677** |
| `radius` / `cornerPower` | 0.055 / 8 | **0.115 / 5.2** |
| `windowW` | 0.94 | **0.8496** |
| `cardW` / `cardH` | 0.79 / 1.12 | **0.7383 / 1.0475** |
| `cardRadius` | 0.018 | **0.0361** |
| `cardY` | −0.1758 | **−0.1676** (top 0.4823, bottom 0.9122 case-fy) |
| `ringInset` / `ringWidth` | 0.018 / 0.034 | **0.002 / 0.0143** |
| `artInset` / `artStroke` | 0.060 / 0.007 | **0.0570 / 0.0143** |
| `artTop` / `artBottom` | 0.040 / 0.355 | **0.0387 / 0.3372** |
| `slots` | 1 bar | **0** |
| `edgeTabs` | 10 bright bars | **2 muted side tabs** |
| `faceLift` | 0.005 | **0.007** |

`parity-check.mjs` CASE box → 665 × 1116 and the frozen column re-measured from this
document (card bottom 1018 case-px, window left/right 53/618, radius 76.5 px, plus new
face-layout rows: keyline stroke, gutter, art inner, title cap, rule x's, footer).
`ReferenceCompare` guides: card box y 0.2876..0.9122.

---

## 5. Execution order & verification

1. `SlabSpec.ts` re-freeze (+ comments), `geometry.ts`: delete slot/edgeTabTop
   geometry, muted side tabs, tab height, faceLift.
2. `textures.ts`: `drawCardFace` layout rewrite (keyline flush, contain art,
   nearest-neighbour rule, [3,2,2] + left rules, measured type scale, footer
   centres); `drawLabel` (pad, lavender hairline, vector logo); `drawTray` recolour;
   new `drawFaceMap`.
3. `Slab.tsx`: unlit face material, face-map material with UV normalisation,
   per-tab materials, tray/glass tone updates, foil mask from spec.
4. `useSlabTextures.ts`: tier bump, face-map cache, mask export.
5. `ForgePreview.tsx` / `Backdrop.tsx`: wall size + gradient clamp.
6. `ReferenceCompare.tsx` guides + `parity-check.mjs` re-freeze.
7. Verify: `npm run verify` (geometry/textures/glsl/parity),
   `scripts/verify/render-textures.mjs` side-by-side against the photo, and an
   extended software raster (`scripts/analysis/_render.mjs` + the removed/added
   meshes) to prove the five strays are gone. No browser exists in this sandbox, so
   the WebGL frame itself is checked through the raster + texture mocks; the live
   preview remains the final visual gate.

Branch: all work lands on `arena/92581492-riris` (this session's branch, cut from
`main`); `main` is never touched.

---

## 6. Addendum — outcomes of the executed pass (2026-10-09)

Everything in §1–§5 is implemented; `npm run verify` is green end-to-end
(geometry, textures, shaders, parity: worst measured delta 3.01 px on the
soft window edges, every hard feature ≤ 1 px). Notes recovered while
executing, kept so the numbers stay reproducible:

- **Art fit is not a crop fit.** Masking the ghost body (red/orange pixels) in
  the source (`public/cards/Gjw0CRRXoAMjU8i.jpg`, 460×413) and in the
  reference window gives k = 0.829 on *both* axes: the reference panel shows
  the source at 0.905 of the window width, top edge 0.1487 of the window
  height down, left offset 0.0464. The supplied file is a tight crop of the
  original panel (corner sparkles and the leaf tip touch its edges), so the
  drawn art sits on an offscreen layer whose edges fade ~2 % into the
  window's background gradient; cover-cropping (the old behaviour) is what
  clipped the sparkles against the frame.
- **Small text is a condensed sans.** Plain Arial runs ~20 % wide and collides
  the meta/footer groups; the stack is now
  `"Arial Narrow", "Liberation Sans Narrow", "Roboto Condensed", Arial` with a
  shrink-to-fit guard per measured group (≤ 0.44 W meta, 0.335/0.25/0.2 W
  footer) so hosts without a condensed face still keep the 528/770/964
  boundaries collision-free.
- **Verification tooling.** `scripts/analysis/_parity_sheet.mjs` composes a
  side-by-side sheet (reference card/label/case crops vs the painted face,
  label, face map and tray textures) for eyeball passes without a browser;
  `scripts/verify/geo-smoke.mjs` now understands placement arrays
  (`edgeTabs`) as well as geometry arrays (`slots`).
- `public/logo-reference.png` is no longer sampled by any painter (the mark is
  vector); the file stays for provenance.
