/**
 * Builds every slab geometry in node and reports vertex/triangle counts,
 * bounding sizes (which must match SLAB_SPEC) and any NaN vertex - the checks
 * that catch a broken squircle or a bad bevel without opening a browser.
 *
 *   npm run verify:geometry
 */
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const jiti = createJiti(import.meta.url, { moduleCache: false });
const path = process.argv[2] ? root + process.argv[2] : root + 'src/components/canvas/slab/geometry.ts';
const mod = await jiti.import(path);
const { buildSlabGeometry, getSlabGeometry } = mod;

function stats(name, geo) {
  const pos = geo.attributes.position.array;
  let nan = 0;
  for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) nan++;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const size = [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => v.toFixed(4));
  const groups = geo.groups?.length ?? 0;
  console.log(
    `${name.padEnd(12)} verts=${String(geo.attributes.position.count).padStart(6)} tris=${String(
      (geo.index ? geo.index.count : geo.attributes.position.count) / 3
    ).padStart(6)} groups=${groups} nan=${nan} size=${size.join(' x ')} normal=${!!geo.attributes.normal} uv=${!!geo.attributes.uv}`
  );
  return { nan, groups };
}

for (const q of ['hero', 'cheap']) {
  const set = buildSlabGeometry(q);
  console.log(`--- geometry set "${q}" ---`);
  let bad = 0;
  for (const [k, v] of Object.entries(set)) {
    if (v && v.isBufferGeometry) {
      const s = stats(k, v);
      bad += s.nan;
    } else if (Array.isArray(v)) {
      // arrays may hold geometries (slots) or placements (edgeTabs)
      const geos = v.map((g) => (g && g.isBufferGeometry ? g : g?.geometry)).filter(Boolean);
      console.log(`${k.padEnd(12)} = ${v.length} x BufferGeometry (${geos.map((g) => g.attributes.position.count).join(',')} verts)`);
    } else {
      console.log(`${k.padEnd(12)} = ${v}`);
    }
  }
  // the cache is only meaningful across two calls to the getter (the first call
  // is what fills it — comparing it with the freshly built `set` above always
  // reported a miss, which made the line useless as a test)
  const cached = getSlabGeometry(q);
  console.log(`cache returns same object: ${getSlabGeometry(q) === cached}`);
  if (bad) process.exit(1);
}
