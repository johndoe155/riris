/** Left/right/top/bottom edges of the case in the render vs the reference. */
import sharp from 'sharp';
async function edges(file, { xl, xr }) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, channels: C } = info;
  const L = (x, y) => { const i = (y * W + x) * C; return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; };
  const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const out = {};
  const leftAt = (y) => { const bg = med(Array.from({ length: 60 }, (_, k) => L(xl - 160 + k, y))); for (let x = xl - 60; x < xl + 60; x++) if (Math.abs(L(x, y) - bg) > 9) return x; return null; };
  const rightAt = (y) => { const bg = med(Array.from({ length: 60 }, (_, k) => L(xr + 60 + k, y))); for (let x = xr + 60; x > xr - 60; x--) if (Math.abs(L(x, y) - bg) > 9) return x; return null; };
  const topAt = (x) => { const bg = med(Array.from({ length: 50 }, (_, k) => L(x, 110 + k))); for (let y = 120; y < 320; y++) if (Math.abs(L(x, y) - bg) > 9) return y; return null; };
  const botAt = (x) => { const bg = med(Array.from({ length: 50 }, (_, k) => L(x, 1400 + k))); for (let y = 1400; y > 1200; y--) if (Math.abs(L(x, y) - bg) > 9) return y; return null; };
  const ys = [300, 500, 700, 900, 1100];
  out.left = ys.map(leftAt); out.right = ys.map(rightAt);
  const xs = [500, 650, 800, 950];
  out.top = xs.map(topAt); out.bot = xs.map(botAt);
  return out;
}
const R = await edges('/home/user/riris/reference-image.jpg', { xl: 412, xr: 1077 });
const M = await edges('/home/user/.scratch/current_layout.png', { xl: 412, xr: 1077 });
const show = (t, v) => console.log(t.padEnd(7), v.map((x) => String(x).padStart(5)).join(''));
for (const k of ['left', 'right', 'top', 'bot']) { show('ref ' + k, R[k]); show('ren ' + k, M[k]); }
const d = (a, b) => a.map((v, i) => v - b[i]);
console.log('\ndelta  left', d(M.left, R.left).join(' '), ' right', d(M.right, R.right).join(' '), ' top', d(M.top, R.top).join(' '), ' bottom', d(M.bot, R.bot).join(' '));
