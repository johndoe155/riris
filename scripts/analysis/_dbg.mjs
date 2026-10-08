import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const root = '/home/user/riris/';
const jiti = createJiti(import.meta.url, { moduleCache: false });
const THREE = await jiti.import('three');
const { buildSlabGeometry } = await jiti.import(root + 'src/components/canvas/slab/geometry.ts');
const { SLAB_SPEC, slabLayers } = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');
const L = slabLayers(SLAB_SPEC);
const geo = buildSlabGeometry('hero');
for (const k of ['shell', 'face', 'labelPlate', 'labelInner', 'ridge', 'card', 'tray', 'band', 'trayPlate', 'backPlate']) {
  const g = geo[k];
  g.computeBoundingBox();
  const b = g.boundingBox;
  console.log(k.padEnd(11), 'x', b.min.x.toFixed(3), b.max.x.toFixed(3), ' y', b.min.y.toFixed(3), b.max.y.toFixed(3), ' z', b.min.z.toFixed(4), b.max.z.toFixed(4), ' verts', g.attributes.position.count, ' idx', !!g.index);
}
console.log('at:', JSON.stringify(geo.at, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v));
console.log('L:', JSON.stringify({ labelY: L.labelY, ridgeY: L.ridgeY, windowY: L.windowY, front: L.front, shellFront: L.shellFront }, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v));
