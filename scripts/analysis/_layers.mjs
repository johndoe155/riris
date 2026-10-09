import sharp from 'sharp';
const PALETTE = [[255,0,0],[0,255,0],[0,0,255],[255,255,0],[255,0,255],[0,255,255],[255,128,0],[128,0,255],[0,128,0],[128,64,0],[64,64,255]];
import fs from 'node:fs';
const IDS = JSON.parse(fs.readFileSync('/home/user/.scratch/current_layout_id.json', 'utf8'));
const { data, info } = await sharp('/home/user/.scratch/current_layout_id.png').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const name = (x, y) => {
  const i = (y * W + x) * 3;
  const c = [data[i], data[i+1], data[i+2]];
  for (let k = 0; k < PALETTE.length; k++) if (Math.abs(c[0]-PALETTE[k][0])<20 && Math.abs(c[1]-PALETTE[k][1])<20 && Math.abs(c[2]-PALETTE[k][2])<20) return IDS[k];
  return c[0]===0&&c[1]===0&&c[2]===0 ? 'bg' : '?';
};
const R = { x: 412, y: 187, y1: 1327 };
const fy = (y) => ((y - R.y) / 1140).toFixed(4);
function runs(x, y0, y1) {
  const out = []; let cur = null;
  for (let y = y0; y <= y1; y++) {
    const n = name(x, y);
    if (!cur || cur.n !== n) { if (cur) out.push(cur); cur = { n, y0: y, y1: y }; }
    else cur.y1 = y;
  }
  out.push(cur);
  return out.filter((r) => r.y1 - r.y0 >= 2);
}
console.log('=== render, centre column x=744, top→bottom ===');
for (const r of runs(744, 186, 1330)) console.log(`  ${r.n.padEnd(10)} y ${String(r.y0).padStart(5)}..${String(r.y1).padStart(5)}  frac ${fy(r.y0)}..${fy(r.y1)}`);
console.log('\n=== render, column x=470 (inside left wall) ===');
for (const r of runs(470, 186, 1330)) console.log(`  ${r.n.padEnd(10)} y ${String(r.y0).padStart(5)}..${String(r.y1).padStart(5)}  frac ${fy(r.y0)}..${fy(r.y1)}`);
console.log('\n=== render, column x=1010 (inside right wall) ===');
for (const r of runs(1010, 186, 1330)) console.log(`  ${r.n.padEnd(10)} y ${String(r.y0).padStart(5)}..${String(r.y1).padStart(5)}  frac ${fy(r.y0)}..${fy(r.y1)}`);
function hrun(y, x0, x1) {
  const out = []; let cur = null;
  for (let x = x0; x <= x1; x++) {
    const n = name(x, y);
    if (!cur || cur.n !== n) { if (cur) out.push(cur); cur = { n, x0: x, x1: x }; }
    else cur.x1 = x;
  }
  out.push(cur);
  return out.filter((r) => r.x1 - r.x0 >= 2);
}
const fx = (x) => ((x - R.x) / 665).toFixed(4);
for (const y of [300, 430, 470, 700, 1250]) {
  console.log(`\n=== render, row y=${y} (frac ${fy(y)}) ===`);
  for (const r of hrun(y, 410, 1080)) console.log(`  ${r.n.padEnd(10)} x ${String(r.x0).padStart(5)}..${String(r.x1).padStart(5)}  frac ${fx(r.x0)}..${fx(r.x1)}`);
}
