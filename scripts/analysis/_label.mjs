import sharp from 'sharp';
const { data, info } = await sharp('/home/user/riris/reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, channels: C } = info;
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
const L = (x, y) => { const [r, g, b] = px(x, y); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const hex = (x, y) => '#' + px(x, y).map((v) => v.toString(16).padStart(2, '0')).join('');

/** walk a row/col and report every region boundary using a local threshold */
function profile(fixed, from, to, vertical, label) {
  console.log(`\n--- ${label} (${vertical ? 'col x=' + fixed : 'row y=' + fixed}) ---`);
  const v = (i) => (vertical ? L(fixed, i) : L(i, fixed));
  let prev = v(from) > 90 ? 'light' : 'dark';
  const start = from;
  for (let i = from + 1; i <= to; i++) {
    const cur = v(i) > 90 ? 'light' : 'dark';
    if (cur !== prev) {
      const pos = vertical ? [fixed, i] : [i, fixed];
      console.log(`   ${prev} ends at ${i - 1} → ${cur} from ${i}   (${hex(...(vertical ? [fixed, i - 2] : [i - 2, fixed]))} → ${hex(...(vertical ? [fixed, i + 2] : [i + 2, fixed]))})`);
      prev = cur;
    }
  }
}
profile(520, 220, 400, true, 'label plate vertical, x=520 (left of the title text)');
profile(370, 400, 1090, false, 'label plate horizontal, y=370 (below the text)');
profile(240, 400, 1090, false, 'label plate horizontal, y=240 (above the text)');
// well position
for (const x of [700, 900, 500]) profile(x, 455, 520, true, `sash well, x=${x}`);
// colours
const sample = (x, y, l) => console.log(`  ${l.padEnd(30)} (${x},${y}) ${hex(x, y)}  luma ${Math.round(L(x, y))}`);
console.log('\n=== reference colours ===');
sample(740, 205, 'case front face, top strip');
sample(740, 320, 'label plate (left of mark)');
sample(440, 300, 'label border / gap left of plate');
sample(460, 300, 'label border line');
sample(740, 400, 'front face between label and ridge');
sample(740, 424, 'ridge highlight');
sample(740, 450, 'front face above the well');
sample(740, 495, 'sash well interior');
sample(700, 500, 'sash well interior 2');
sample(740, 555, 'tray above the card');
sample(520, 700, 'tray left of the card');
sample(610, 520, 'card ring white band');
sample(700, 1000, 'card art');
sample(740, 1270, 'bottom ledge');
sample(470, 700, 'left wall / inner ledge');
sample(1050, 700, 'right wall / inner ledge');
sample(1040, 250, 'case right of the label');
sample(430, 1000, 'case left edge');
sample(560, 380, 'label bottom border');
