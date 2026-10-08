/**
 * Runs the parity table against the spec from before this pass (read out of
 * git) and against the current one, so the gap list has real numbers.
 */
import { execSync } from 'node:child_process';
import { createJiti } from 'jiti';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const CASE = { w: 665, h: 1116, x0: 412, y0: 187, x1: 1077, y1: 1303 };

const oldSrc = execSync(`git -C ${root} show HEAD:src/components/canvas/slab/SlabSpec.ts`, { encoding: 'utf8' });
fs.writeFileSync('/tmp/_oldSpec.ts', oldSrc);
const jiti = createJiti(import.meta.url, { moduleCache: false });
const oldMod = await jiti.import('/tmp/_oldSpec.ts');
const OLD = oldMod.SLAB_SPEC;
const { SLAB_SPEC: NEW } = await jiti.import(root + 'src/components/canvas/slab/SlabSpec.ts');

function measure(S, show) {
  const fy = (yTop) => yTop / S.h;
  const fxc = (xc) => xc / S.w + 0.5;
  const cardTop = S.cardY + S.cardH / 2;
  const fromTop = (yc) => S.h / 2 - yc;
  // the old spec had no ridgeTop: derive its ridge placement the way it did
  const ridgeTop = S.ridgeTop ?? (() => {
    const labelY = S.h / 2 - S.labelTop - S.labelH / 2;
    const ridgeY = labelY - S.labelH / 2 - S.ridgeGap - S.ridgeH / 2;
    return S.h / 2 - ridgeY - S.ridgeH / 2;
  })();
  const T = {
    'aspect w/h': [S.w / S.h, 665 / 1116, 'ratio'],
    'label top': [fy(S.labelTop) * CASE.h, 40, 'y'],
    'label bottom': [fy(S.labelTop + S.labelH) * CASE.h, 192, 'y'],
    'label left': [fxc(-S.labelW / 2) * CASE.w, 40, 'x'],
    'label right': [fxc(S.labelW / 2) * CASE.w, 624, 'x'],
    'ridge top': [fy(ridgeTop) * CASE.h, 231, 'y'],
    'ridge bottom': [fy(ridgeTop + S.ridgeH) * CASE.h, 240, 'y'],
    'window left': [fxc(-S.windowW / 2) * CASE.w, 53, 'x'],
    'window top': [fy(S.windowTop) * CASE.h, 283, 'y'],
    'window bottom': [fy(S.windowTop + S.windowH) * CASE.h, 1108, 'y'],
    'card left': [fxc(-S.cardW / 2) * CASE.w, 88, 'x'],
    'card top': [fy(fromTop(cardTop)) * CASE.h, 321, 'y'],
    'card bottom': [fy(fromTop(S.cardY - S.cardH / 2)) * CASE.h, 1053, 'y'],
    'art frame top': [fy(fromTop(cardTop - S.artTop * S.cardH)) * CASE.h, 348, 'y'],
    'art frame bottom': [fy(fromTop(cardTop - (1 - S.artBottom) * S.cardH)) * CASE.h, 783, 'y'],
    'hanger ledge h': [(S.slotH / S.h) * CASE.h, 15, 'y'],
    'hanger ledge w': [(S.slotW / S.w) * CASE.w, 60, 'x'],
  };
  if (show) {
    console.log('feature'.padEnd(18), 'model'.padStart(9), 'ref'.padStart(9), 'delta'.padStart(9));
    let worst = 0;
    for (const [k, [m, r, u]] of Object.entries(T)) {
      const d = u === 'ratio' ? (m - r) * CASE.h : m - r;
      worst = Math.max(worst, Math.abs(d));
      console.log(k.padEnd(18), m.toFixed(u === 'ratio' ? 4 : 1).padStart(9), r.toFixed(u === 'ratio' ? 4 : 1).padStart(9), (d >= 0 ? '+' : '') + d.toFixed(1).padStart(8));
    }
    console.log('worst |delta|:', worst.toFixed(1), 'px');
  }
  return Object.fromEntries(Object.entries(T).map(([k, [m, r, u]]) => [k, u === 'ratio' ? (m - r) * CASE.h : m - r]));
}
console.log('=== BEFORE (spec at HEAD) ===');
const before = measure(OLD, true);
console.log('\n=== AFTER (this pass) ===');
const after = measure(NEW, true);
console.log('\n=== IMPROVEMENT ===');
for (const k of Object.keys(before)) {
  const b = Math.abs(before[k]), a = Math.abs(after[k]);
  const tag = a < b - 0.05 ? `fixed (${b.toFixed(1)} -> ${a.toFixed(1)})` : b < 3.5 ? 'already within tolerance' : 'unchanged';
  console.log(`  ${k.padEnd(18)} ${tag}`);
}
