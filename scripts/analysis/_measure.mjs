/**
 * Reference measurement harness for `public/reference.jpg` (1488 x 1484).
 *
 * Prints colour runs along a row or column so every boundary the eye uses
 * (frame strokes, gutters, dividers, cap heights, tab extents) becomes a number
 * with a px position and the mean colour on each side. Usage:
 *
 *   node scripts/analysis/_measure.mjs row 1155          # horizontal scan
 *   node scripts/analysis/_measure.mjs col 744           # vertical scan
 *   node scripts/analysis/_measure.mjs box 500 508 991 1240   # box summary
 *
 * Runs shorter than `min` px or with a smaller colour step than `step` are
 * merged, so the output reads as "the edges a designer would mark".
 */
import sharp from 'sharp';

const IMG = new URL('../../public/reference.jpg', import.meta.url).pathname;
const { data, info } = await sharp(IMG).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const px = (x, y) => {
  const i = (y * W + x) * 3;
  return [data[i], data[i + 1], data[i + 2]];
};
const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function runs(get, len, min = 3, step = 14) {
  const out = [];
  let start = 0;
  let acc = [get(0)];
  for (let i = 1; i <= len; i++) {
    const c = i < len ? get(i) : null;
    const prev = acc[acc.length - 1];
    const mean = acc.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], [0, 0, 0]).map((v) => v / acc.length);
    if (c && Math.max(...c.map((v, k) => Math.abs(v - prev[k]))) < step) {
      acc.push(c);
      continue;
    }
    if (i - start >= min || !c) {
      out.push({ a: start, b: i - 1, n: i - start, rgb: mean.map(Math.round), l: Math.round(luma(mean)) });
    }
    start = i;
    acc = c ? [c] : [];
  }
  return out;
}

const fmt = (r) => `${r.a}..${r.b} (n${r.n}) rgb(${r.rgb}) L${r.l}`;
const [mode, a, b] = process.argv.slice(2);

if (mode === 'row') {
  const y = Number(a);
  console.log(`row y=${y}`);
  runs((x) => px(x, y), W).forEach((r) => console.log('  ', fmt(r)));
} else if (mode === 'col') {
  const x = Number(a);
  console.log(`col x=${x}`);
  runs((y) => px(x, y), H).forEach((r) => console.log('  ', fmt(r)));
} else if (mode === 'box') {
  const [x0, y0, x1, y1] = process.argv.slice(3, 7).map(Number);
  let n = 0;
  const acc = [0, 0, 0];
  let lmin = 999;
  let lmax = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const c = px(x, y);
      acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      const l = luma(c);
      lmin = Math.min(lmin, l); lmax = Math.max(lmax, l);
      n++;
    }
  }
  console.log(`box ${x0},${y0}..${x1},${y1} mean rgb(${acc.map((v) => Math.round(v / n))}) luma ${Math.round(lmin)}..${Math.round(lmax)}`);
} else if (mode === 'white') {
  // bounding box of near-white pixels inside a region (art content, text blocks)
  const [x0, y0, x1, y1, thr] = [a, b, process.argv[4], process.argv[5], process.argv[6] ?? 200].map(Number);
  let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (luma(px(x, y)) >= thr) {
        n++;
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      }
    }
  }
  console.log(`white>=${thr} in ${x0},${y0}..${x1},${y1}: n=${n} box ${minx},${miny}..${maxx},${maxy}`);
}

if (mode === 'band') {
  const [x0, y0, x1, y1, thr] = process.argv.slice(3, 8).map((v, i) => Number(v ?? (i === 4 ? 150 : 0)));
  const colHit = new Array(x1 - x0 + 1).fill(0);
  const rowHit = new Array(y1 - y0 + 1).fill(0);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (luma(px(x, y)) >= thr) { colHit[x - x0]++; rowHit[y - y0]++; }
    }
  }
  const project = (hits, off, minGap = 2, minLen = 1) => {
    const out = [];
    let s = -1;
    for (let i = 0; i <= hits.length; i++) {
      const on = i < hits.length && hits[i] > 0;
      if (on && s < 0) s = i;
      if (!on && s >= 0) {
        // close only after minGap empty slots
        let j = i;
        while (j < hits.length && hits[j] === 0 && j - i < minGap) j++;
        const on2 = j < hits.length && hits[j] > 0;
        if (on2) { i = j; continue; }
        if (i - s >= minLen) out.push({ a: s + off, b: i - 1 + off, n: i - s, peak: Math.max(...hits.slice(s, i)) });
        s = -1;
      }
    }
    return out;
  };
  console.log(`band ${x0},${y0}..${x1},${y1} thr${thr}`);
  console.log('  rows :', project(rowHit, y0).map((r) => `${r.a}..${r.b}(h${r.n},pk${r.peak})`).join(' '));
  console.log('  cols :', project(colHit, x0).map((r) => `${r.a}..${r.b}(w${r.n},pk${r.peak})`).join(' '));
}
