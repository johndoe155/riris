// Hero render vs reference-image.jpg, at matched case-relative positions.
//
// The hero grab is a DPR 1 canvas of 363 x 500 px. The slab is 240.4 px per case
// unit, centred at (181.5, 250). Reference px map to case units as
//   u = (x - 744.5) / 665,   v = (745 - y) / 665
// so each pair below is the same place on the case. Values are 5 x 5 means on the
// photo and 3 x 3 on the render; points on an edge are noisy at this scale.
//
//   node scripts/analysis/_tones.mjs <hero-grab.png>
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../package.json', import.meta.url));
const sharp = require('sharp');

const renderPath = process.argv[2];
if (!renderPath) {
  console.error('usage: node scripts/analysis/_tones.mjs <hero-grab.png>');
  process.exit(1);
}
const refPath = fileURLToPath(new URL('../../reference-image.jpg', import.meta.url));

async function load(p) {
  const { data, info } = await sharp(p).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height, C: info.channels };
}
const ref = await load(refPath);
const ren = await load(renderPath);

function mean(img, cx, cy, r) {
  let R = 0, G = 0, B = 0, n = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(img.H - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(img.W - 1, cx + r); x++) {
      const i = (y * img.W + x) * img.C;
      R += img.data[i]; G += img.data[i + 1]; B += img.data[i + 2]; n++;
    }
  return [R / n, G / n, B / n];
}
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const toRen = (x, y) => [
  Math.round(181.5 + ((x - 744.5) / 665) * 240.4),
  Math.round(250 - ((745 - y) / 665) * 240.4),
];

// [name, reference x, reference y]
const pairs = [
  ['backdrop TL', 250, 60], ['backdrop TR', 1240, 60], ['backdrop BL', 250, 1430], ['backdrop BR', 1240, 1430],
  ['backdrop mid-L', 250, 745], ['backdrop mid-R', 1240, 745], ['backdrop bottom-C', 744, 1420],
  ['shadow under case', 744, 1330],
  ['rim L (dark)', 416, 600], ['face L edge', 432, 600], ['face R', 1050, 600], ['rim R (lit)', 1072, 600],
  ['face top strip', 600, 205], ['label plate', 760, 350], ['ridge rail body', 600, 422], ['ridge tab 2', 744, 422],
  ['lip (slot 1)', 556, 477], ['tray floor', 482, 700],
  ['card paper ring', 504, 900], ['card ink band', 518, 900], ['card paper gap', 530, 900], ['card top paper', 745, 512],
];

console.log('name'.padEnd(20), 'photo'.padEnd(9), 'L'.padStart(4), '  hero'.padEnd(9), 'L'.padStart(4), '  ratio');
for (const [name, x, y] of pairs) {
  const r = mean(ref, x, y, 2);
  const [rx, ry] = toRen(x, y);
  const m = mean(ren, rx, ry, 1);
  console.log(
    name.padEnd(20), hex(r).padEnd(9), luma(r).toFixed(0).padStart(4),
    '  ' + hex(m).padEnd(9), luma(m).toFixed(0).padStart(4),
    '  ' + (luma(m) / luma(r)).toFixed(2),
  );
}
