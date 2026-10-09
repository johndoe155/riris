/** Transition runs along scanlines of reference-image.jpg (the REAL target). */
import sharp from 'sharp';
const { data, info } = await sharp('/home/user/riris/reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
const L = (x, y) => { const c = px(x, y); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function runs(get, n, from, to, thr) {
  const vals = []; for (let i = 0; i < n; i++) vals.push(get(i));
  const out = []; let start = from;
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const grads = [];
  for (let i = 1; i < n - 1; i++) grads.push([i, Math.abs(lum(vals[i + 1]) - lum(vals[i - 1]))]);
  const cuts = [0];
  for (const [i, g] of grads) if (g > thr) cuts.push(i);
  cuts.push(n - 1);
  for (let k = 0; k < cuts.length - 1; k++) {
    const a = cuts[k], b = cuts[k + 1];
    if (b - a < 1) continue;
    let R = 0, G = 0, B = 0;
    for (let i = a; i <= b; i++) { const c = vals[i]; R += c[0]; G += c[1]; B += c[2]; }
    const m = [(R / (b - a + 1)), (G / (b - a + 1)), (B / (b - a + 1))];
    out.push(`${from + a}..${from + b} ${hex(m)}`);
  }
  return out.join(' | ');
}
const row = (y, x0, x1, thr = 14) => runs((i) => px(x0 + i, y), x1 - x0, x0, x1, thr);
const col = (x, y0, y1, thr = 14) => runs((i) => px(x, y0 + i), y1 - y0, y0, y1, thr);

console.log('ROW y=300 (label):   ', row(300, 440, 1480));
console.log('\nROW y=240 (rail):    ', row(240, 440, 1480));
console.log('\nROW y=960 (card mid):', row(960, 440, 1480));
console.log('\nROW y=1660 (apron):  ', row(1660, 440, 1480));
console.log('\nCOL x=960 (centre):  ', col(960, 140, 1780));
console.log('\nCOL x=620 (left apron):', col(620, 140, 1780));
