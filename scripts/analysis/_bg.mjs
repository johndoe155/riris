import sharp from 'sharp';
const { data, info } = await sharp('/home/user/riris/reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, channels: C } = info;
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
const hex = (x, y) => '#' + px(x, y).map((v) => v.toString(16).padStart(2, '0')).join('');
console.log('vertical profile at x=100 (left margin, clear of the slab):');
for (let y = 0; y < 1484; y += 60) console.log(`  y=${String(y).padStart(4)}  ${hex(100, y)}`);
console.log('\nvertical profile at x=1400 (right margin):');
for (let y = 0; y < 1484; y += 120) console.log(`  y=${String(y).padStart(4)}  ${hex(1400, y)}`);
console.log('\nhorizontal profile at y=740 (mid height):');
for (let x = 0; x < 1488; x += 80) console.log(`  x=${String(x).padStart(4)}  ${hex(x, 740)}`);
console.log('\nhorizontal profile at y=120:');
for (let x = 0; x < 1488; x += 120) console.log(`  x=${String(x).padStart(4)}  ${hex(x, 120)}`);
console.log('\nslab shadow region (below the case):');
for (const [x, y] of [[744, 1320], [744, 1360], [744, 1420], [600, 1340], [900, 1340], [744, 1470], [300, 1400], [1200, 1400]]) {
  console.log(`  (${x},${y}) ${hex(x, y)}`);
}
