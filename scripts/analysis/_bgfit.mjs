// Fits the hero backdrop to the photo's background.
//
// The backdrop is a three-stop linear gradient (bottom t=0, glow t=0.5, top t=1)
// along an angle θ, painted on a square plane whose extent is the photo frame.
// In case units (x = (px-744.5)/665, y = (745-py)/665) the parameter is exactly
//   t = clamp(0.5 + (u cosθ + v sinθ) / (2 * HALF), 0, 1),  HALF = 1.1168
// so for every θ the colour is linear in the three stop colours. This scans θ,
// solves the stop colours by least squares on background pixels only (outside
// the case and its contact shadow), and reports the best fit alongside the
// current REF_BACKDROP values.
//
//   node scripts/analysis/_bgfit.mjs
import sharp from 'sharp';

const HALF = 1.1168;
const { data, info } = await sharp('reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;

// collect background samples (grid step 6 px), outside the case and shadow band
const samples = [];
for (let py = 0; py < H; py += 6) for (let px = 0; px < W; px += 6) {
  const inCase = px > 400 && px < 1090 && py > 165 && py < 1330;
  const inShadow = px > 395 && px < 1095 && py > 1296 && py < 1345;
  if (inCase || inShadow) continue;
  const i = (py * W + px) * C;
  samples.push([(px - 744.5) / 665, (745 - py) / 665, data[i], data[i + 1], data[i + 2]]);
}

// least squares for the three stop colours at angle θ
function fitAt(theta) {
  const cs = Math.cos(theta), sn = Math.sin(theta);
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const b = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; // b[channel][k]
  let yy = [0, 0, 0];
  for (const [u, v, r, g, bl] of samples) {
    const t = Math.min(1, Math.max(0, 0.5 + (u * cs + v * sn) / (2 * HALF)));
    let w;
    if (t <= 0.5) w = [1 - 2 * t, 2 * t, 0]; else w = [0, 2 - 2 * t, 2 * t - 1];
    for (let a = 0; a < 3; a++) for (let k = 0; k < 3; k++) M[a][k] += w[a] * w[k];
    const y = [r, g, bl];
    for (let c = 0; c < 3; c++) { yy[c] += y[c] * y[c]; for (let a = 0; a < 3; a++) b[c][a] += w[a] * y[c]; }
  }
  // solve M x = b[c] for each channel (3x3, Gaussian elimination)
  const solve = (A, rhs) => {
    const n = 3; const Mx = A.map((row, i) => [...row, rhs[i]]);
    for (let i = 0; i < n; i++) {
      let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(Mx[k][i]) > Math.abs(Mx[p][i])) p = k;
      [Mx[i], Mx[p]] = [Mx[p], Mx[i]];
      for (let k = 0; k < n; k++) if (k !== i) { const f = Mx[k][i] / Mx[i][i]; for (let j = i; j <= n; j++) Mx[k][j] -= f * Mx[i][j]; }
    }
    return Mx.map((row, i) => row[n] / row[i]);
  };
  const stops = [0, 1, 2].map((c) => solve(M, b[c])); // stops[c][k]: channel c, stop k (bottom, glow, top)
  // residual: Σ y² − 2 Σ x·b + xᵀ M x, per channel
  let rss = 0;
  for (let c = 0; c < 3; c++) {
    const x = stops[c];
    let xb = 0, xMx = 0;
    for (let a = 0; a < 3; a++) { xb += x[a] * b[c][a]; for (let k = 0; k < 3; k++) xMx += x[a] * M[a][k] * x[k]; }
    rss += yy[c] - 2 * xb + xMx;
  }
  return { rss, stops, n: samples.length };
}

const hex = (c) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
const stopsHex = (stops) => [0, 1, 2].map((k) => hex([stops[0][k], stops[1][k], stops[2][k]]));

let best = null;
for (let deg = 0; deg <= 90; deg += 0.5) {
  const f = fitAt((deg * Math.PI) / 180);
  if (!best || f.rss < best.rss) best = { ...f, deg };
}
const rms = Math.sqrt(best.rss / (best.n * 3));
const [bottom, glow, top] = stopsHex(best.stops);
console.log(`samples: ${best.n} background pixels (grid 6 px)`);
console.log(`best angle: ${best.deg.toFixed(1)} deg  (${((best.deg * Math.PI) / 180).toFixed(3)} rad)`);
console.log(`best stops: bottom ${bottom}  glow ${glow}  top ${top}`);
console.log(`rms residual: ${rms.toFixed(1)} per channel (0-255)`);

// the same residual for the stops that were in REF_BACKDROP before this fit
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const OLD = { angle: 0.28, bottom: '#34202d', glow: '#6d5566', top: '#b9a8b4' };
const oldAngleCurrent = 0.857;
const evalStops = (theta, bottomHex, glowHex, topHex) => {
  const cs = Math.cos(theta), sn = Math.sin(theta);
  let rss = 0;
  const cols = [bottomHex, glowHex, topHex].map(hexToRgb);
  for (const [u, v, r, g, bl] of samples) {
    const t = Math.min(1, Math.max(0, 0.5 + (u * cs + v * sn) / (2 * HALF)));
    const [a, c2, k] = t <= 0.5 ? [1 - 2 * t, 2 * t, 0] : [0, 2 - 2 * t, 2 * t - 1];
    const model = [0, 1, 2].map((ch) => a * cols[0][ch] + c2 * cols[1][ch] + k * cols[2][ch]);
    const y = [r, g, bl];
    for (let ch = 0; ch < 3; ch++) rss += (y[ch] - model[ch]) ** 2;
  }
  return Math.sqrt(rss / (samples.length * 3));
};
console.log(`rms, current REF_BACKDROP (angle 0.857, stops #34202d/#6d5566/#b9a8b4): ${evalStops(oldAngleCurrent, OLD.bottom, OLD.glow, OLD.top).toFixed(1)}`);
console.log(`rms, best fit (angle ${best.deg.toFixed(1)} deg): ${evalStops((best.deg * Math.PI) / 180, bottom, glow, top).toFixed(1)}`);
