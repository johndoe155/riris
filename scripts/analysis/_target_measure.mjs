/**
 * Full re-measurement of `reference-image.jpg` — the actual parity target.
 *
 * The frozen numbers in `scripts/verify/parity-check.mjs` were recovered from
 * `public/reference.jpg` (the Ghost-Lab slab, 1488x1484): its case box is
 * 412..1077 x 187..1303, which is not where the case sits in this 1920x1920
 * photo. Everything here is re-derived from the target itself:
 *
 *   _target_silhouette.mjs  outer box, edge-highlight structure
 *   _target_scan.mjs        run/colour profiles along the key scanlines
 *   this script             the consolidated feature table + tones + backdrop
 *
 * Outputs text only; numbers are pasted into SlabSpec.ts / parity-check.mjs.
 */
import sharp from 'sharp';

const { data, info } = await sharp('/home/user/riris/reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const L = (x, y) => lum(px(x, y));
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mean = (cx, cy, r) => {
  let R = 0, G = 0, B = 0, n = 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) { const c = px(x, y); R += c[0]; G += c[1]; B += c[2]; n++; }
  return [R / n, G / n, B / n];
};

/* ---------- silhouette: first sustained deviation from the wall ---------- */
/* the case's edge hairlines are near-white (luma 230..250) against a wall that
   never exceeds ~140 above the floor line, so an absolute threshold tracks the
   silhouette cleanly where a background-delta test does not. */
const BRIGHT = 175;
function leftEdge(y, thr = BRIGHT) {
  for (let x = 320; x < 960; x++) if (L(x, y) > thr && L(x + 2, y) > thr) return x;
  return -1;
}
function rightEdge(y, thr = BRIGHT) {
  for (let x = 1600; x > 960; x--) if (L(x, y) > thr && L(x - 2, y) > thr) return x;
  return -1;
}
function topEdge(x, thr = BRIGHT) {
  for (let y = 120; y < 960; y++) if (L(x, y) > thr && L(x, y + 2) > thr) return y;
  return -1;
}
function bottomEdge(x) {
  return 1716; // floor line: contact shadow row, see col scan in _target_scan.mjs
}

const rows = [400, 700, 960, 1200, 1500];
const le = rows.map((y) => leftEdge(y)), re = rows.map((y) => rightEdge(y));
const cols = [700, 960, 1200];
const te = cols.map((x) => topEdge(x)), be = cols.map((x) => bottomEdge(x));
console.log('left edges ', rows.map((y, i) => `y${y}:${le[i]}`).join(' '));
console.log('right edges', rows.map((y, i) => `y${y}:${re[i]}`).join(' '));
console.log('top edges  ', cols.map((x, i) => `x${x}:${te[i]}`).join(' '));
console.log('bottom edges', cols.map((x, i) => `x${x}:${be[i]}`).join(' '));

const X0 = Math.min(...le), X1 = Math.max(...re) + 1;
const Y0 = Math.min(...te), Y1 = 1717; // floor line: contact shadow starts (col scan)
const CW = X1 - X0, CH = Y1 - Y0;
console.log(`\nCASE BOX  x ${X0}..${X1}  y ${Y0}..${Y1}   ${CW} x ${CH}  aspect ${(CW / CH).toFixed(4)}  world h ${(CH / CW).toFixed(4)}`);
const fx = (x) => (x - X0) / CW;           // 0..1 across the case
const fy = (y) => (y - Y0) / CH;           // 0..1 down the case
const wx = (x) => fx(x) - 0.5;             // world x, slab = 1 wide
const wy = (y) => fy(y) * (CH / CW);       // world y down from the top edge

/* ---------- corner profile: inset of the contour per row ---------- */
console.log('\ncorner profile (row, left-edge x, inset px from X0):');
for (let y = Y0 + 2; y <= Y0 + 120; y += 6) console.log(`  y+${y - Y0}  x=${leftEdge(y)}  inset=${leftEdge(y) - X0}`);

/* ---------- internal features, from the run profiles ---------- */
const F = {
  labelL: 583, labelR: 1337, labelT: 239, labelB: 437,
  railT: 446, railB: 479,
  windowL: 545, windowR: 1370, windowT: 480, windowB: 1658,
  cardL: 590, cardR: 1328, cardT: 560, cardB: 1580,
  lipTopT: 543, lipTopB: 548, lipBotT: 1588, lipBotB: 1602,
  railL1: 576, railL2: 587, railR1: 1327, railR2: 1338,
};
console.log('\nfeature                 px box            fraction(x,w / y,top,h)      world');
const rep = (name, x0, x1, y0, y1) => {
  const s = name.padEnd(20);
  const box = `x${x0}..${x1} y${y0}..${y1}`.padEnd(26);
  const world = `worldW ${((x1 - x0) / CW).toFixed(4)} worldTop ${(fy(y0) * (CH / CW)).toFixed(4)} worldH ${(((y1 - y0) / CH) * (CH / CW)).toFixed(4)}`;
  console.log(`${s}${box}${world}`);
};
rep('label plate', F.labelL, F.labelR, F.labelT, F.labelB);
rep('rail (moulding)', 545, 1370, F.railT, F.railB);
rep('window opening', F.windowL, F.windowR, F.windowT, F.windowB);
rep('card', F.cardL, F.cardR, F.cardT, F.cardB);
rep('lip bar top', 642, 1270, F.lipTopT, F.lipTopB);
rep('lip bar bottom', 642, 1270, F.lipBotT, F.lipBotB);
console.log(`rails vertical: left x${F.railL1}..${F.railL2} right x${F.railR1}..${F.railR2} (gap to card edge: ${F.cardL - F.railL2}px / ${F.railR1 - F.cardR}px)`);

/* ---------- card + label corner radii ---------- */
console.log('\ncard corner (row offset from card top, left edge x, inset):');
for (const y of [560, 562, 565, 570, 578, 590, 610]) {
  let e = -1;
  for (let x = 560; x < 700; x++) if (lum(px(x, y)) > 150 && lum(px(x + 2, y)) > 150) { e = x; break; }
  console.log(`  y+${y - F.cardT}  x=${e} inset=${e - F.cardL}`);
}
console.log('label corner (row offset from label top, left edge x, inset):');
for (const y of [239, 241, 244, 249, 257, 270]) {
  let e = -1;
  for (let x = 560; x < 700; x++) if (lum(px(x, y)) > 190 && lum(px(x + 2, y)) > 190) { e = x; break; }
  console.log(`  y+${y - F.labelT}  x=${e} inset=${e - F.labelL}`);
}

/* ---------- tones ---------- */
console.log('\ntones (5x5 means):');
const T = [
  ['wall top centre', 960, 120], ['wall top left', 200, 200], ['wall top right', 1720, 200],
  ['wall mid left', 200, 960], ['wall mid right', 1720, 960],
  ['wall low left', 200, 1600], ['wall low right', 1720, 1600],
  ['wall at floor left', 200, 1700], ['wall at floor right', 1720, 1700],
  ['floor left', 200, 1800], ['floor centre (reflection)', 960, 1820], ['floor right', 1720, 1800],
  ['contact shadow', 700, 1722],
  ['rim outer band left', 502, 960], ['rim hairline 2 left', 510, 960], ['rim mid left', 528, 960],
  ['rim inner left', 536, 960],
  ['rim outer band right', 1412, 960], ['rim hairline right', 1396, 960], ['rim mid right', 1378, 960],
  ['tray left of card', 566, 960], ['tray right of card', 1350, 960], ['tray above card', 960, 520],
  ['tray below card', 960, 1630],
  ['label plate', 960, 330], ['label plate edge', 600, 330],
  ['card art paper', 700, 700], ['card art paper 2', 1200, 1400],
  ['lip bar top', 960, 545], ['lip bar bottom', 960, 1595],
  ['rail left bright', 588, 960], ['rail right bright', 1339, 960],
  ['top edge hairline', 960, 182], ['bottom edge hairline', 960, 1712],
];
for (const [name, x, y] of T) console.log(`  ${name.padEnd(26)} ${hex(mean(x, y, 2))}  luma ${lum(mean(x, y, 2)).toFixed(0)}`);

/* ---------- backdrop vertical profile (wall, left of the case) ---------- */
console.log('\nwall vertical profile at x=200 and x=1720:');
for (let y = 100; y <= 1700; y += 100) console.log(`  y${y}  left ${hex(mean(200, y, 3))}  right ${hex(mean(1720, y, 3))}`);
console.log('floor profile x=200 / x=960:');
for (let y = 1718; y <= 1910; y += 16) console.log(`  y${y}  left ${hex(mean(200, y, 2))}  centre ${hex(mean(960, y, 2))}`);

/* ---------- edge highlight profiles (specular structure) ---------- */
console.log('\nleft rim luma profile, row 960:');
console.log(Array.from({ length: 60 }, (_, i) => `${494 + i}:${L(494 + i, 960).toFixed(0)}`).join(' '));
console.log('\ntop rim luma profile, col 960:');
console.log(Array.from({ length: 60 }, (_, i) => `${181 + i}:${L(960, 181 + i).toFixed(0)}`).join(' '));
