import sharp from 'sharp';
const { data, info } = await sharp('/home/user/riris/reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const lum = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) lum[i] = 0.2126 * data[i * C] + 0.7152 * data[i * C + 1] + 0.0722 * data[i * C + 2];
const at = (x, y) => lum[y * W + x];

/** vertical edges: for each row band, find x positions of strong |dLum/dx| */
const vEdgeMap = new Map(); // key rounded x -> {count, ys:[]}
for (let y = 2; y < H - 2; y++) {
  for (let x = 3; x < W - 3; x++) {
    const g = at(x + 1, y) - at(x - 1, y);
    if (Math.abs(g) > 26) {
      const k = x;
      let e = vEdgeMap.get(k);
      if (!e) { e = { n: 0, sum: 0, ys: [] }; vEdgeMap.set(k, e); }
      e.n++; e.sum += g; if (e.ys.length < 4000) e.ys.push(y);
    }
  }
}
/** merge adjacent columns into single edges, report contiguous y runs */
const cols = [...vEdgeMap.keys()].sort((a, b) => a - b);
const groups = [];
let cur = [cols[0]];
for (let i = 1; i < cols.length; i++) {
  if (cols[i] - cols[i - 1] <= 2) cur.push(cols[i]); else { groups.push(cur); cur = [cols[i]]; }
}
groups.push(cur);
const out = [];
for (const g of groups) {
  const n = g.reduce((a, x) => a + vEdgeMap.get(x).n, 0);
  if (n < 120) continue;
  const ys = new Set();
  for (const x of g) for (const y of vEdgeMap.get(x).ys) ys.add(y);
  const sorted = [...ys].sort((a, b) => a - b);
  // contiguous runs with gap tolerance
  const runs = [];
  let s = sorted[0], p = sorted[0];
  for (const y of sorted.slice(1)) { if (y - p > 25) { runs.push([s, p]); s = y; } p = y; }
  runs.push([s, p]);
  const long = runs.filter(([a, b]) => b - a > 60);
  const x0 = g[0], x1 = g[g.length - 1];
  const xm = Math.round((x0 + x1) / 2);
  out.push({ x0, x1, n, runs: long, contrast: [at(xm - 4, 700) | 0, at(xm + 4, 700) | 0] });
}
out.sort((a, b) => b.n - a.n);
console.log('=== VERTICAL EDGES (x range, #px, y-runs) ===');
for (const o of out.slice(0, 30)) console.log(`x ${String(o.x0).padStart(4)}-${String(o.x1).padEnd(4)} n=${String(o.n).padStart(5)} runs=${o.runs.map(([a,b])=>`${a}-${b}`).join(',')}`);

const hEdgeMap = new Map();
for (let x = 3; x < W - 3; x++) {
  for (let y = 3; y < H - 3; y++) {
    const g = at(x, y + 1) - at(x, y - 1);
    if (Math.abs(g) > 26) {
      let e = hEdgeMap.get(y);
      if (!e) { e = { n: 0, xs: [] }; hEdgeMap.set(y, e); }
      e.n++; if (e.xs.length < 4000) e.xs.push(x);
    }
  }
}
const rows = [...hEdgeMap.keys()].sort((a, b) => a - b);
const rgroups = [];
let rcur = [rows[0]];
for (let i = 1; i < rows.length; i++) { if (rows[i] - rows[i - 1] <= 2) rcur.push(rows[i]); else { rgroups.push(rcur); rcur = [rows[i]]; } }
rgroups.push(rcur);
const rout = [];
for (const g of rgroups) {
  const n = g.reduce((a, y) => a + hEdgeMap.get(y).n, 0);
  if (n < 120) continue;
  const xs = new Set();
  for (const y of g) for (const x of hEdgeMap.get(y).xs) xs.add(x);
  const sorted = [...xs].sort((a, b) => a - b);
  const runs = [];
  let s = sorted[0], p = sorted[0];
  for (const x of sorted.slice(1)) { if (x - p > 25) { runs.push([s, p]); s = x; } p = x; }
  runs.push([s, p]);
  const long = runs.filter(([a, b]) => b - a > 60);
  const y0 = g[0], y1 = g[g.length - 1];
  rout.push({ y0, y1, n, runs: long });
}
rout.sort((a, b) => b.n - a.n);
console.log('\n=== HORIZONTAL EDGES (y range, #px, x-runs) ===');
for (const o of rout.slice(0, 30)) console.log(`y ${String(o.y0).padStart(4)}-${String(o.y1).padEnd(4)} n=${String(o.n).padStart(5)} runs=${o.runs.map(([a,b])=>`${a}-${b}`).join(',')}`);
