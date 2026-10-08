import sharp from 'sharp';
const { data, info } = await sharp('/home/user/riris/reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const L = (x, y) => { const i = (y * W + x) * C; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };

function trackRow(y, x0, x1, dir) {
  let best = null;
  const from = dir > 0 ? x0 : x1, to = dir > 0 ? x1 : x0;
  for (let x = from; dir > 0 ? x <= to : x >= to; x += dir) {
    const g = Math.abs(L(x + 1, y) - L(x - 1, y));
    if (!best || g > best.g) best = { x, g };
  }
  return best;
}
function trackCol(x, y0, y1, dir) {
  let best = null;
  const from = dir > 0 ? y0 : y1, to = dir > 0 ? y1 : y0;
  for (let y = from; dir > 0 ? y <= to : y >= to; y += dir) {
    const g = Math.abs(L(x, y + 1) - L(x, y - 1));
    if (!best || g > best.g) best = { y, g };
  }
  return best;
}

console.log('LEFT outer edge (search 380..470):');
console.log([220, 300, 400, 500, 700, 900, 1100, 1250, 1290].map((y) => { const b = trackRow(y, 380, 470, 1); return `y${y}:${b.x}(${b.g.toFixed(0)})`; }).join('  '));
console.log('RIGHT outer edge (search 1100..1010):');
console.log([220, 300, 400, 500, 700, 900, 1100, 1250, 1290].map((y) => { const b = trackRow(y, 1010, 1100, -1); return `y${y}:${b.x}(${b.g.toFixed(0)})`; }).join('  '));
console.log('TOP outer edge (search 160..260):');
console.log([440, 500, 600, 740, 900, 1000, 1050].map((x) => { const b = trackCol(x, 160, 260, 1); return `x${x}:${b.y}(${b.g.toFixed(0)})`; }).join('  '));
console.log('BOTTOM outer edge (search 1360..1240):');
console.log([440, 500, 600, 740, 900, 1000, 1050].map((x) => { const b = trackCol(x, 1240, 1360, -1); return `x${x}:${b.y}(${b.g.toFixed(0)})`; }).join('  '));

// internal structure: label plate (dark) extents — scan a row inside the label, find where it goes dark
console.log('\nLABEL plate dark-region extents at several rows:');
for (const y of [240, 260, 300, 340, 360, 370]) {
  let xl = null, xr = null;
  for (let x = 415; x < 1070; x++) if (L(x, y) < 70) { xl = x; break; }
  for (let x = 1070; x > 415; x--) if (L(x, y) < 70) { xr = x; break; }
  console.log(` y=${y} dark ${xl}..${xr}`);
}
console.log('\nLABEL plate vertical extents at x=470 (inside plate, left of text):');
let t = null, b2 = null;
for (let y = 200; y < 420; y++) if (L(470, y) < 70) { t = y; break; }
for (let y = 420; y > 200; y--) if (L(470, y) < 70) { b2 = y; break; }
console.log(` x=470 dark ${t}..${b2}`);
const t2 = (() => { for (let y = 200; y < 420; y++) if (L(1040, y) < 70) return y; })();
const b3 = (() => { for (let y = 420; y > 200; y--) if (L(1040, y) < 70) return y; })();
console.log(` x=1040 dark ${t2}..${b3}`);

console.log('\nWINDOW (dark) extents below the ridge, at x=460 (left of card) and x=1020 (right of card):');
for (const x of [440, 460, 1020, 1035]) {
  const runs = [];
  let s = null;
  for (let y = 390; y < 1300; y++) {
    const dark = L(x, y) < 90;
    if (dark && s === null) s = y;
    if (!dark && s !== null) { if (y - s > 5) runs.push([s, y - 1]); s = null; }
  }
  if (s !== null) runs.push([s, 1299]);
  console.log(` x=${x} dark runs: ${runs.map(([a, b]) => `${a}-${b}`).join(', ')}`);
}

console.log('\nCARD white ring: white runs along x=740 (centre) and along y=1200:');
const whiteRunsV = () => { const r = []; let s = null; for (let y = 480; y < 1240; y++) { const w = L(740, y) > 200; if (w && s === null) s = y; if (!w && s !== null) { if (y - s > 2) r.push([s, y - 1]); s = null; } } return r; };
console.log(' x=740 white:', whiteRunsV().map(([a, b]) => `${a}-${b}`).join(', '));
const whiteRunsH = (y) => { const r = []; let s = null; for (let x = 430; x < 1070; x++) { const w = L(x, y) > 200; if (w && s === null) s = x; if (!w && s !== null) { if (x - s > 2) r.push([s, x - 1]); s = null; } } return r; };
for (const y of [520, 600, 960, 1150, 1200]) console.log(` y=${y} white:`, whiteRunsH(y).map(([a, b]) => `${a}-${b}`).join(', '));
