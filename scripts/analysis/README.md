# Analysis harness

Throwaway-forever tools: these are how the numbers in
[`docs/reference-parity.md`](../../docs/reference-parity.md) were recovered from
`reference-image.jpg`. They are not part of `npm run verify` (that is
`scripts/verify/parity-check.mjs`, which holds the frozen results), but they are
kept because every number in the spec should be re-derivable.

| Script | What it does |
| --- | --- |
| `_track.mjs` | background-deviation tracking → the case box, 665 × 1116 px at x 412..1077, y 187..1303 |
| `_lines.mjs` | long vertical/horizontal edge runs → every internal boundary |
| `_scan.mjs` | per-row/column transitions with the colour on each side |
| `_shape.mjs` | per-row local background estimate → the outer contour and the corner arc |
| `_ridge.mjs` | the ridge's height and contrast; the top-strip and bottom-ledge profiles |
| `_label.mjs` | the label plate's box, its inner lip, and the well positions |
| `_bg.mjs` | the backdrop's diagonal gradient and the contact shadow |
| `_render.mjs` | software rasteriser: runs the repo's real `buildSlabGeometry()` and draws it at the measured scale, writing `current_layout.png` and a per-pixel layer map |
| `_layers.mjs` | reads the layer map and prints the layer stack down the centre and the walls, in case fractions |
| `_dbg.mjs`, `_dbg2.mjs` | bounding boxes for every geometry layer / the hanger ledges |
| `_beforeafter.mjs` | runs the parity table against `git show HEAD:…SlabSpec.ts` and the current spec, so "fixed vs already within tolerance" is evidence rather than opinion |

Everything except `_beforeafter.mjs` writes its output to `/home/user/.scratch`,
outside the repo — nothing here leaves artefacts in the tree.
