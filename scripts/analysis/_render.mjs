/**
 * Software rasteriser for the slab: renders the *real* geometry and material
 * set from src/components/canvas/slab with an orthographic camera, so the
 * layer boundaries can be measured in node and diffed against the reference
 * photo. No GPU, no browser.
 *
 *   node scripts/analysis/_render.mjs [out.png]
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../../', import.meta.url));
const jiti = createJiti(import.meta.url, { moduleCache: false });
const THREE = await jiti.import('three');
const { buildSlabGeometry } = await jiti.import(root + 'src/components/canvas/slab/geometry.ts');
const { SLAB_SPEC, slabLayers } = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');

const PXW = 1488, PXH = 1484;
const S = 665;                       // px per world unit (measured slab width)
const CX = (412 + 1077) / 2, CY = (187 + 1303) / 2;  // slab box centre → world origin
const proj = (x, y) => [CX + x * S, CY - y * S];

const geo = buildSlabGeometry('hero');
const L = slabLayers(SLAB_SPEC);

const col = new Uint8Array(PXW * PXH * 4);     // straight colour
const depth = new Float32Array(PXW * PXH).fill(-Infinity); // larger z = closer
const idbuf = new Int16Array(PXW * PXH).fill(-1);

const bg = (x, y) => {
  const t = y / PXH;
  const base = [150 - t * 110, 128 - t * 100, 148 - t * 108];
  // soft swirl, like the photo's wall
  const s = Math.sin(x * 0.008 + y * 0.004) * Math.cos(x * 0.003 - y * 0.007);
  return [base[0] + s * 8, base[1] + s * 7, base[2] + s * 8];
};

/** id → [colour, roughness, metalness, alpha, kind] */
const MATS = {
  shell:    ['#dfe6f0', 0.08, 0.0, 0.30, 'glass'],
  face:     ['#e2e8f2', 0.12, 0.0, 0.34, 'glass'],
  backplate:['#232329', 0.84, 0.05, 1.0, 'opaque'],
  tray:     ['#232329', 0.84, 0.05, 1.0, 'opaque'],
  trayplate:['#4a3d47', 0.86, 0.04, 1.0, 'opaque'],
  label:    ['#15151a', 0.60, 0.05, 1.0, 'opaque'],
  ridge:    ['#f2f5fa', 0.12, 0.16, 1.0, 'opaque'],
  card:     ['#f4f2ee', 0.46, 0.05, 1.0, 'opaque'],
  slot:     ['#2b2b33', 0.70, 0.12, 1.0, 'opaque'],
};
const IDS = Object.keys(MATS);

const LIGHT = new THREE.Vector3(0.35, 0.62, 0.70).normalize();

function shade(hex, nx, ny, nz, idn) {
  const c = new THREE.Color(hex);
  const diff = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
  const spec = Math.pow(Math.max(0, nz), 8) * 0.35;
  const rim = Math.pow(1 - Math.max(0, nz), 3) * 0.55;
  const k = 0.42 + 0.55 * diff + spec + rim;
  return [Math.min(255, c.r * 255 * k), Math.min(255, c.g * 255 * k), Math.min(255, c.b * 255 * k)];
}

/** draw one geometry (BufferGeometry, positions+normals) at world translation */
function draw(g, idName, tx, ty, tz, ry = 0) {
  const pos = g.attributes.position.array;
  const nor = g.attributes.normal ? g.attributes.normal.array : null;
  const idx = g.index ? g.index.array : null;
  const n = idx ? idx.length : pos.length / 3;
  const alpha = MATS[idName][3];
  const cos = Math.cos(ry), sin = Math.sin(ry);
  for (let t = 0; t < n; t += 3) {
    const v = [0, 1, 2].map((k) => (idx ? idx[t + k] : t + k));
    const P = v.map((i) => {
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (ry) { const xr = x * cos + z * sin; const zr = -x * sin + z * cos; x = xr; z = zr; }
      return [x + tx, y + ty, z + tz];
    });
    const N = v.map((i) => {
      if (!nor) return [0, 0, 1];
      let x = nor[i * 3], y = nor[i * 3 + 1], z = nor[i * 3 + 2];
      if (ry) { const xr = x * cos + z * sin; const zr = -x * sin + z * cos; x = xr; z = zr; }
      return [x, y, z];
    });
    // screen coords
    const sx = P.map((p) => proj(p[0], p[1])[0]);
    const sy = P.map((p) => proj(p[0], p[1])[1]);
    const zz = P.map((p) => p[2]);
    const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0]);
    if (Math.abs(area) < 1e-9) continue;
    // facing: the geometric normal of the (world-space) triangle. +z faces the camera.
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
    const e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    const flip = nz > 0;
    const minx = Math.max(0, Math.floor(Math.min(...sx))), maxx = Math.min(PXW - 1, Math.ceil(Math.max(...sx)));
    const miny = Math.max(0, Math.floor(Math.min(...sy))), maxy = Math.min(PXH - 1, Math.ceil(Math.max(...sy)));
    for (let py = miny; py <= maxy; py++) {
      for (let px = minx; px <= maxx; px++) {
        const x = px + 0.5, y = py + 0.5;
        const w0 = ((sx[1] - x) * (sy[2] - y) - (sx[2] - x) * (sy[1] - y)) / area;
        const w1 = ((sx[2] - x) * (sy[0] - y) - (sx[0] - x) * (sy[2] - y)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * zz[0] + w1 * zz[1] + w2 * zz[2];
        const i = py * PXW + px;
        const front = flip;
        if (!front) { if (alpha >= 1) continue; }
        if (z >= depth[i] - (alpha < 1 ? 0.0005 : 0.0)) {
          // translucent surfaces blend over what is already there
          let nx = w0 * N[0][0] + w1 * N[1][0] + w2 * N[2][0];
          let ny = w0 * N[0][1] + w1 * N[1][1] + w2 * N[2][1];
          let nz = w0 * N[0][2] + w1 * N[1][2] + w2 * N[2][2];
          if (!front) { nx = -nx; ny = -ny; nz = -nz; }
          const len = Math.hypot(nx, ny, nz) || 1;
          const rgb = shade(MATS[idName][0], nx / len, ny / len, nz / len, idName);
          if (alpha >= 1) {
            col[i * 4] = rgb[0]; col[i * 4 + 1] = rgb[1]; col[i * 4 + 2] = rgb[2]; col[i * 4 + 3] = 255;
            depth[i] = z; idbuf[i] = IDS.indexOf(idName);
          } else {
            // blend
            const a = alpha * (0.6 + 0.4 * Math.max(0, nz / len));
            const dst = col[i * 4 + 3] === 0 ? bg(px, py) : [col[i * 4], col[i * 4 + 1], col[i * 4 + 2]];
            col[i * 4] = dst[0] * (1 - a) + rgb[0] * a;
            col[i * 4 + 1] = dst[1] * (1 - a) + rgb[1] * a;
            col[i * 4 + 2] = dst[2] * (1 - a) + rgb[2] * a;
            col[i * 4 + 3] = 255;
            idbuf[i] = IDS.indexOf(idName); // topmost layer wins, translucent or not
            if (z > depth[i]) { depth[i] = z; }
          }
        }
      }
    }
  }
}

// background
for (let y = 0; y < PXH; y++) for (let x = 0; x < PXW; x++) {
  const c = bg(x, y); const i = (y * PXW + x) * 4;
  col[i] = c[0]; col[i + 1] = c[1]; col[i + 2] = c[2]; col[i + 3] = 255;
}
// back to front
draw(geo.shell, 'shell', 0, 0, geo.at.shell);
draw(geo.face, 'face', 0, 0, geo.at.face);
draw(geo.backPlate, 'backplate', ...geo.place.backPlate);
draw(geo.tray, 'tray', ...geo.place.tray);
draw(geo.trayPlate, 'trayplate', 0, 0, L.trayFront + 0.0012);
draw(geo.labelPlate, 'label', 0, L.labelY, geo.at.labelPlate);
draw(geo.ridge, 'ridge', ...geo.place.ridge);
for (const p of geo.place.ridgeTabs) draw(geo.ridgeTab, 'ridge', ...p);
for (const g of geo.slots) draw(g, 'slot', 0, 0, geo.at.slot);
draw(geo.card, 'card', 0, SLAB_SPEC.cardY, geo.at.card);
draw(geo.cardFace, 'card', 0, SLAB_SPEC.cardY, L.cardFace + 0.0012);

const out = process.argv[2] ?? '/home/user/.scratch/current_layout.png';
await sharp(Buffer.from(col), { raw: { width: PXW, height: PXH, channels: 4 } }).png().toFile(out);

// ID map for boundary measurement
const idrgb = Buffer.alloc(PXW * PXH * 3);
const PALETTE = [[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255],[255,128,0],[128,0,255],[0,128,0],[128,64,0],[64,64,255]];
for (let i = 0; i < PXW * PXH; i++) {
  const id = idbuf[i];
  const c = id < 0 ? [0, 0, 0] : PALETTE[id % PALETTE.length];
  idrgb[i * 3] = c[0]; idrgb[i * 3 + 1] = c[1]; idrgb[i * 3 + 2] = c[2];
}
await sharp(idrgb, { raw: { width: PXW, height: PXH, channels: 3 } }).png().toFile(out.replace('.png', '_id.png'));
fs.writeFileSync(out.replace('.png', '_id.json'), JSON.stringify(IDS));
console.log('wrote', out);
console.log('tri counts:', Object.entries(geo).filter(([, v]) => v && v.isBufferGeometry).map(([k, v]) => `${k}:${v.attributes.position.count}`).join(' '));
