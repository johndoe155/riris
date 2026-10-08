import sharp from 'sharp';
const { data, info } = await sharp('/home/user/riris/reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
const L = (x, y) => { const [r, g, b] = px(x, y); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const hex = (x, y) => { const [r, g, b] = px(x, y); return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''); };

function vscan(x, y0, y1, label) {
  console.log(`\n--- vertical x=${x} (${label}) ---`);
  const marks = [];
  for (let y = y0 + 1; y < y1 - 1; y++) {
    const g = L(x, y + 1) - L(x, y - 1);
    if (Math.abs(g) > 14) marks.push([y, g]);
  }
  // merge adjacent
  const merged = [];
  for (const [y, g] of marks) {
    const last = merged[merged.length - 1];
    if (last && y - last.y1 <= 2) { last.y1 = y; last.g = Math.abs(g) > Math.abs(last.g) ? g : last.g; }
    else merged.push({ y0: y, y1: y, g });
  }
  for (const m of merged) {
    const ym = Math.round((m.y0 + m.y1) / 2);
    console.log(`  y=${String(ym).padStart(5)}  d=${String(Math.round(m.g)).padStart(5)}   above ${hex(x, ym - 6)} (${Math.round(L(x, ym - 6))})  ->  below ${hex(x, ym + 6)} (${Math.round(L(x, ym + 6))})`);
  }
}
function hscan(y, x0, x1, label) {
  console.log(`\n--- horizontal y=${y} (${label}) ---`);
  const marks = [];
  for (let x = x0 + 1; x < x1 - 1; x++) {
    const g = L(x + 1, y) - L(x - 1, y);
    if (Math.abs(g) > 14) marks.push([x, g]);
  }
  const merged = [];
  for (const [x, g] of marks) {
    const last = merged[merged.length - 1];
    if (last && x - last.x1 <= 2) { last.x1 = x; last.g = Math.abs(g) > Math.abs(last.g) ? g : last.g; }
    else merged.push({ x0: x, x1: x, g });
  }
  for (const m of merged) {
    const xm = Math.round((m.x0 + m.x1) / 2);
    console.log(`  x=${String(xm).padStart(5)}  d=${String(Math.round(m.g)).padStart(5)}   left ${hex(xm - 6, y)} (${Math.round(L(xm - 6, y))})  ->  right ${hex(xm + 6, y)} (${Math.round(L(xm + 6, y))})`);
  }
}
vscan(740, 170, 1330, 'centre column, top to bottom');
hscan(292, 400, 1090, 'through label plate');
hscan(460, 400, 1090, 'through window apron (above card)');
hscan(1200, 400, 1090, 'through card bottom / tray');
