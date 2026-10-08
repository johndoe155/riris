/**
 * Robust silhouette measurement, per-row local background estimate.
 * Reports the outer contour, the width profile, and the corner arc, so the
 * reference outline and the model outline can be compared directly.
 */
import sharp from 'sharp';

async function edges(file, region, thr = 9) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const lum = (x, y) => 0.2126 * data[(y * W + x) * C] + 0.7152 * data[(y * W + x) * C + 1] + 0.0722 * data[(y * W + x) * C + 2];
  const med = (arr) => { const a = [...arr].sort((p, q) => p - q); return a[Math.floor(a.length / 2)]; };
  const { y0, y1 } = region;
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    const bl = med(Array.from({ length: 70 }, (_, k) => lum(Math.max(0, region.xl - 150 + k), y)));
    const br = med(Array.from({ length: 70 }, (_, k) => lum(Math.min(W - 1, region.xr + 60 + k), y)));
    let L = null, R = null;
    for (let x = region.xl - 40; x <= region.xr + 40; x++) {
      if (Math.abs(lum(x, y) - bl) > thr) { L = x; break; }
    }
    for (let x = region.xr + 40; x >= region.xl - 40; x--) {
      if (Math.abs(lum(x, y) - br) > thr) { R = x; break; }
    }
    rows.push({ y, L, R });
  }
  return rows;
}

function report(label, rows) {
  const valid = rows.filter((r) => r.L != null && r.R != null);
  const minx = Math.min(...valid.map((r) => r.L));
  const maxx = Math.max(...valid.map((r) => r.R));
  const miny = Math.min(...valid.map((r) => r.y));
  const maxy = Math.max(...valid.map((r) => r.y));
  const w = maxx - minx + 1, h = maxy - miny + 1;
  console.log(`\n### ${label}: x ${minx}..${maxx} (w=${w}) y ${miny}..${maxy} (h=${h}) aspect ${(w / h).toFixed(4)}`);
  console.log('   fy     y     L     R   width  w/max  L-rel  R-rel');
  const maxw = Math.max(...valid.map((r) => r.R - r.L + 1));
  for (const f of [0.003, 0.006, 0.01, 0.015, 0.02, 0.03, 0.04, 0.06, 0.08, 0.12, 0.2, 0.4, 0.6, 0.8, 0.9, 0.94, 0.96, 0.97, 0.98, 0.985, 0.99, 0.995, 0.998]) {
    const y = Math.round(miny + f * (h - 1));
    const r = rows.find((q) => q.y === y);
    if (!r || r.L == null) { console.log(`   ${f.toFixed(3)}  ${String(y).padStart(4)}   (no edge)`); continue; }
    const wd = r.R - r.L + 1;
    console.log(`   ${f.toFixed(3)}  ${String(y).padStart(4)}  ${String(r.L).padStart(4)}  ${String(r.R).padStart(4)}  ${String(wd).padStart(4)}  ${(wd / maxw).toFixed(4)}  ${((r.L - minx) / w).toFixed(4)}  ${((maxx - r.R) / w).toFixed(4)}`);
  }
  return { minx, maxx, miny, maxy, w, h, rows };
}

const ref = report('REFERENCE', await edges('/home/user/riris/reference-image.jpg', { xl: 412, xr: 1077, y0: 180, y1: 1276 }));
const ren = report('RENDER', await edges('/home/user/.scratch/current_layout.png', { xl: 428, xr: 1060, y0: 190, y1: 1280 }));

/* corner arc: for the top-left corner, the inset of the contour at each row from the top */
console.log('\n### TOP-LEFT CORNER ARC (inset of the left contour from the slab left, in px, per row from the top edge)');
const arc = (s) => {
  const out = [];
  for (let d = 0; d <= 60; d += 2) {
    const y = s.miny + d;
    const r = s.rows.find((q) => q.y === y);
    if (r && r.L != null) out.push(`${d}:${r.L - s.minx}`);
  }
  return out.join(' ');
};
console.log('ref :', arc(ref));
console.log('ren :', arc(ren));
console.log('\n### BOTTOM-LEFT CORNER ARC');
const arcB = (s) => {
  const out = [];
  for (let d = 0; d <= 60; d += 2) {
    const y = s.maxy - d;
    const r = s.rows.find((q) => q.y === y);
    if (r && r.L != null) out.push(`${d}:${r.L - s.minx}`);
  }
  return out.join(' ');
};
console.log('ref :', arcB(ref));
console.log('ren :', arcB(ren));
