import sharp from 'sharp';
const { data, info } = await sharp('/home/user/riris/reference-image.jpg').removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i + 1], data[i + 2]]; };
const L = (x, y) => { const c = px(x, y); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mean = (cx, cy, r) => { let R=0,G=0,B=0,n=0; for (let y=cy-r;y<=cy+r;y++) for (let x=cx-r;x<=cx+r;x++){const c=px(x,y);R+=c[0];G+=c[1];B+=c[2];n++;} return [R/n,G/n,B/n]; };

console.log('image', W, H);
/* ---- outer silhouette: strongest |dL/dx| run per row ---- */
function rowEdge(y, x0, x1) { let best=null; for (let x=x0+1;x<x1-1;x++){ const g=Math.abs(L(x+1,y)-L(x-1,y)); if(!best||g>best.g) best={x,g}; } return best; }
function colEdge(x, y0, y1) { let best=null; for (let y=y0+1;y<y1-1;y++){ const g=Math.abs(L(x,y+1)-L(x,y-1)); if(!best||g>best.g) best={y,g}; } return best; }
console.log('\n== LEFT outer edge (search 430..620) ==');
for (const y of [300,500,700,960,1200,1500,1650,1700]) { const b=rowEdge(y,430,620); console.log(`y${y}: x=${b.x} g=${b.g.toFixed(0)} col=${hex(px(b.x,y))}`); }
console.log('== RIGHT outer edge (search 1300..1500) ==');
for (const y of [300,500,700,960,1200,1500,1650,1700]) { const b=rowEdge(y,1300,1500); console.log(`y${y}: x=${b.x} g=${b.g.toFixed(0)} col=${hex(px(b.x,y))}`); }
console.log('== TOP outer edge (search 120..260) ==');
for (const x of [600,800,960,1100,1300]) { const b=colEdge(x,120,260); console.log(`x${x}: y=${b.y} g=${b.g.toFixed(0)}`); }
console.log('== BOTTOM outer edge (search 1600..1800) ==');
for (const x of [600,800,960,1100,1300]) { const b=colEdge(x,1600,1800); console.log(`x${x}: y=${b.y} g=${b.g.toFixed(0)}`); }
