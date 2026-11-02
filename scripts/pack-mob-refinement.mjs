// Mechanical slice/export of the authored 8x8 refinement atlas; no runtime image requests.
import {chromium} from 'playwright';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
const root = 'assets/woodland-ember/refinement';
const sheet = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'));
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']});
try {
  const page = await browser.newPage();
  const tiles = await page.evaluate(async ({sheet, image}) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + image; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = sheet.size;
    const ctx = canvas.getContext('2d', {willReadFrequently: true}); ctx.imageSmoothingEnabled = false;
    return sheet.names.map((name, i) => {
      const w = img.width / sheet.columns, h = img.height / sheet.rows, inset = .025;
      ctx.drawImage(img, (i % sheet.columns + inset) * w, (Math.floor(i / sheet.columns) + inset) * h,
        w * (1 - inset * 2), h * (1 - inset * 2), 0, 0, sheet.size, sheet.size);
      const pixels = ctx.getImageData(0, 0, sheet.size, sheet.size), p = pixels.data;
      const palette = [], indices = [], colours = new Map();
      for (let j = 0; j < p.length; j += 4) {
        p[j] &= 248; p[j+1] &= 248; p[j+2] &= 248; p[j+3] = 255;
        const rgba = Array.from(p.subarray(j, j+4)), key = rgba.join(',');
        if (!colours.has(key)) { colours.set(key, palette.length / 4); palette.push(...rgba); }
        indices.push(colours.get(key));
      }
      ctx.putImageData(pixels, 0, 0);
      return {name, palette, indices, png: canvas.toDataURL().split(',')[1]};
    });
  }, {sheet, image: readFileSync(`${root}/creatures-source.png`).toString('base64')});
  mkdirSync(`${root}/tiles`, {recursive: true});
  const packed = {};
  for (const tile of tiles) {
    const bytes = Buffer.alloc(tile.indices.length * 2); tile.indices.forEach((v, i) => bytes.writeUInt16LE(v, i * 2));
    packed[tile.name] = {palette: tile.palette, indices: bytes.toString('base64')};
    writeFileSync(`${root}/tiles/${tile.name}.png`, Buffer.from(tile.png, 'base64'));
  }
  writeFileSync(`${root}/creatures.json`, JSON.stringify(packed));
  await import('./export-runtime-art.mjs');
  console.log(`Exported ${tiles.length} refined mob and accessory textures.`);
} finally { await browser.close(); }
