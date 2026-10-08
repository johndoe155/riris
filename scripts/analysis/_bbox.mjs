import sharp from 'sharp';
const { data, info } = await sharp('/home/user/riris/reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const L = (x, y) => { const i = (y * W + x) * C; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };

/** first x from `from` toward `to` where luma deviates from the running background mean */
function firstDeviation(fixed, from, to, vertical, win = 60, thr = 11, need = 5) {
  const dir = Math.sign(to - from);
  const val = (i) => (vertical ? L(fixed, i) : L(i, fixed));
  let sum = 0, n = 0;
  for (let i = from; i !== from + dir * win; i += dir) { sum += val(i); n++; }
  let mean = sum / n, run = 0, start = null;
  for (let i = from + dir * win; i !== to; i += dir) {
    const d = Math.abs(val(i) - mean);
    if (d > thr) { if (start === null) start = i; if (++run >= need) return start; } else run = 0;
    mean += (val(i) - mean) * 0.02;
  }
  return null;
}
console.log('LEFT  edge by row:', [200, 250, 350, 450, 600, 800, 1000, 1150, 1250, 1300].map((y) => `y${y}:${firstDeviation(y, 300, 470, false)}`).join(' '));
console.log('RIGHT edge by row:', [200, 250, 350, 450, 600, 800, 1000, 1150, 1250, 1300].map((y) => `y${y}:${firstDeviation(y, 1200, 1010, false)}`).join(' '));
console.log('TOP   edge by col:', [440, 500, 600, 700, 800, 900, 1000, 1060].map((x) => `x${x}:${firstDeviation(x, 120, 260, true)}`).join(' '));
console.log('BOT   edge by col:', [440, 500, 600, 700, 800, 900, 1000, 1060].map((x) => `x${x}:${firstDeviation(x, 1400, 1240, true)}`).join(' '));

// horizontal cross-sections in the middle of the case to see the left/right wall structure
const prof = (y, x0, x1) => { const o = []; for (let x = x0; x <= x1; x++) o.push(`${x}:${Math.round(L(x, y))}`); return o.join(' '); };
console.log('\nrow y=620 (mid case, above card art):', prof(620, 405, 470));
console.log('row y=620 right:', prof(620, 1030, 1090));
console.log('col x=740 top:', [180,190,200,210,220].map(y=>`${y}:${Math.round(L(740,y))}`).join(' '));
