import { createJiti } from 'jiti';
const root = '/home/user/riris/';
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { buildSlabGeometry } = await jiti.import(root + 'src/components/canvas/slab/geometry.ts');
const { SLAB_SPEC, slabLayers } = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');
const geo = buildSlabGeometry('hero');
const L = slabLayers(SLAB_SPEC);
geo.slots.forEach((g, i) => {
  g.computeBoundingBox();
  const b = g.boundingBox;
  const px = (y) => (745 - y * 665).toFixed(0);
  console.log(`slot ${i}: x ${b.min.x.toFixed(4)}..${b.max.x.toFixed(4)}  y ${b.min.y.toFixed(4)}..${b.max.y.toFixed(4)} → px y ${px(b.max.y)}..${px(b.min.y)}  z ${b.min.z.toFixed(4)}..${b.max.z.toFixed(4)}`);
});
console.log('card y range px:', (745 - (SLAB_SPEC.cardY + SLAB_SPEC.cardH/2) * 665).toFixed(0), '..', (745 - (SLAB_SPEC.cardY - SLAB_SPEC.cardH/2) * 665).toFixed(0));
console.log('windowY', L.windowY.toFixed(4), 'px top', (745 - (L.windowY + SLAB_SPEC.windowH/2) * 665).toFixed(0));
