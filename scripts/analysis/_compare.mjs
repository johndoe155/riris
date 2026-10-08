/**
 * Builds one side-by-side sheet: the reference cropped to the case box, the
 * model's layer stack at the same scale, and a 50/50 overlay that shows where
 * the boundaries land relative to each other.
 */
import sharp from 'sharp';

const OUT = '/home/user/.scratch/side_by_side.png';
const BOX = { left: 412, top: 187, width: 665, height: 1116 };
const PAD = 26;

const ref = await sharp('/home/user/riris/reference-image.jpg')
  .extract(BOX)
  .resize({ width: 500 })
  .png()
  .toBuffer();
const ren = await sharp('/home/user/.scratch/current_layout.png')
  .extract(BOX)
  .resize({ width: 500 })
  .png()
  .toBuffer();
const overlay = await sharp(await sharp('/home/user/riris/reference-image.jpg').extract(BOX).resize({ width: 500 }).png().toBuffer())
  .composite([{ input: await sharp('/home/user/.scratch/current_layout.png').extract(BOX).resize({ width: 500 }).png().toBuffer(), blend: 'over' }])
  .png()
  .toBuffer();
// alpha-blend the two so alignment shows as a double image rather than a stack
const ghost = await sharp(await sharp('/home/user/riris/reference-image.jpg').extract(BOX).resize({ width: 500 }).modulate({ brightness: 1 }).png().toBuffer())
  .composite([{ input: await sharp('/home/user/.scratch/current_layout.png').extract(BOX).resize({ width: 500, height: 839 }).ensureAlpha(0.5).png().toBuffer(), blend: 'over' }])
  .png()
  .toBuffer();

const H = 839;
const W = 500 * 3 + PAD * 4;
const svg = `<svg width="${W}" height="${H + PAD * 2 + 26}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0b0b0d"/>
  <text x="${PAD}" y="${PAD + 14}" fill="#f5f3ef" font-family="monospace" font-size="13">reference-image.jpg (case box 665x1116)</text>
  <text x="${PAD * 2 + 500}" y="${PAD + 14}" fill="#f5f3ef" font-family="monospace" font-size="13">model layers, same scale (software raster)</text>
  <text x="${PAD * 3 + 1000}" y="${PAD + 14}" fill="#f5f3ef" font-family="monospace" font-size="13">50/50 overlay</text>
</svg>`;

await sharp(Buffer.from(svg))
  .resize(W, H + PAD * 2 + 26)
  .composite([
    { input: ref, left: PAD, top: PAD + 20 },
    { input: ren, left: PAD * 2 + 500, top: PAD + 20 },
    { input: ghost, left: PAD * 3 + 1000, top: PAD + 20 },
  ])
  .png()
  .toFile(OUT);
console.log('wrote', OUT);
