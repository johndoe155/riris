// Ridge luma along its length: ridge rows (419..426) vs the face rows below it
// (431..436) and above it (408..413). Samples every 20 px across the case.
import sharp from 'sharp';
const { data, info } = await sharp('reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, C = info.channels;
const luma = (x, y) => { const i = (y * W + x) * C; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };
const mean = (ys, x) => ys.reduce((s, y) => s + luma(x, y), 0) / ys.length;
const R = [419, 420, 421, 422, 423, 424, 425, 426], B = [431, 432, 433, 434, 435, 436], A = [408, 409, 410, 411, 412, 413];
console.log('   x    ridge  below  above  ridge-below');
for (let x = 420; x <= 1070; x += 20) {
  const r = mean(R, x), b = mean(B, x), a = mean(A, x);
  console.log(String(x).padStart(5), r.toFixed(0).padStart(7), b.toFixed(0).padStart(6), a.toFixed(0).padStart(6), (r - b).toFixed(0).padStart(8));
}
