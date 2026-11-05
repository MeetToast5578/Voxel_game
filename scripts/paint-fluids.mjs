// Paints the water and lava animations from periodic noise: every frame tiles seamlessly and the eight frames loop.
// Writes the packed frames into the expansion effects, the runtime variation art and the tile PNGs.
// Usage: node scripts/paint-fluids.mjs (scripts/pack-expansion.mjs also runs it, after slicing the source sheet).
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 32, FRAMES = 8, TAU = Math.PI * 2;
const root = 'assets/woodland-ember/expansion';

/** A small deterministic random source, so repainting gives identical files. */
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Noise made of cosine waves with whole-number frequencies across the tile and whole-number cycles over the loop,
 * so it repeats exactly at the tile edges and after the last frame. A lower `speed` leaves more waves still.
 */
function periodicNoise(seed, waves, maxFreq, speed) {
  const r = rng(seed), list = [];
  for (let i = 0; i < waves; i++) {
    let kx, ky;
    do { kx = Math.round((r() * 2 - 1) * maxFreq); ky = Math.round((r() * 2 - 1) * maxFreq); } while (!kx && !ky);
    const amp = 1 / Math.hypot(kx, ky);
    list.push({ kx, ky, phase: r() * TAU, cycles: Math.round((r() * 2 - 1) * speed), amp });
  }
  const total = list.reduce((s, w) => s + w.amp, 0);
  return (x, y, t) => list.reduce((s, w) => s + w.amp * Math.cos(TAU * (w.kx * x + w.ky * y) / N + w.phase + TAU * w.cycles * t / FRAMES), 0) / total;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const water = {
  palette: ['#0d2a4f', '#123a66', '#174a7d', '#1d5b93', '#2a73ad', '#4f9ccf', '#a6dcf2'].map(hex),
  base: periodicNoise(11, 10, 2, 1),
  warp: periodicNoise(12, 8, 2, 1),
  ridge: periodicNoise(13, 12, 3, 1),
  shade(x, y, t) {
    // Broad, slow tone changes plus thin bright caustic lines along the zero crossings of a warped wave field.
    const b = this.base(x, y, t), w = this.warp(x, y, t) * 3;
    const r = Math.abs(this.ridge(x + w, y - w, t));
    const glint = r < 0.04 ? 3.2 : r < 0.1 ? 1.4 : 0;
    return 2.2 + b * 2.4 + glint;
  },
};

const lava = {
  palette: ['#260b08', '#45140b', '#6e200e', '#a2310f', '#d85316', '#f98a24', '#ffc94d', '#fff1a6'].map(hex),
  base: periodicNoise(21, 10, 2, 0.8),
  warp: periodicNoise(22, 8, 2, 0.8),
  ridge: periodicNoise(24, 24, 2, 0.8),
  shade(x, y, t) {
    // Dark cooling crust broken by bright molten seams; the seams glow hotter where the crust is thin.
    const w = this.warp(x, y, t) * 4, b = this.base(x, y, t);
    const r = Math.abs(this.ridge(x - w, y + w, t));
    const seam = r < 0.025 ? 6.6 : r < 0.055 ? 5.4 : r < 0.09 ? 4.2 : 0;
    return Math.max(seam, 1.4 + b * 2.2);
  },
};

/** Paints one frame as palette indices, row by row from the top. */
function paint(kind, t) {
  const out = new Uint16Array(N * N), last = kind.palette.length - 1;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) out[y * N + x] = Math.max(0, Math.min(last, Math.round(kind.shade(x, y, t))));
  }
  return out;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let c = 0xffffffff;
  for (const b of body) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  const len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, body, crc]);
}
/** An RGBA PNG of one frame. */
function png(indices, palette) {
  const raw = Buffer.alloc(N * (N * 4 + 1));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = palette[indices[y * N + x]], o = y * (N * 4 + 1) + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(N, 0); head.writeUInt32BE(N, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const effects = JSON.parse(readFileSync(`${root}/effects.json`, 'utf8'));
const variations = JSON.parse(readFileSync('src/render/variationArt.json', 'utf8'));
for (const [name, kind] of Object.entries({ water, lava })) {
  for (let f = 0; f < FRAMES; f++) {
    const indices = paint(kind, f), bytes = Buffer.alloc(indices.length * 2);
    indices.forEach((v, i) => bytes.writeUInt16LE(v, i * 2));
    const tile = { palette: kind.palette.flatMap((c) => [...c, 255]), indices: bytes.toString('base64') };
    effects[`${name}_${f}`] = variations[`${name}_${f}`] = tile;
    writeFileSync(`${root}/tiles/effects/${name}_${f}.png`, png(indices, kind.palette));
  }
}
writeFileSync(`${root}/effects.json`, JSON.stringify(effects));
writeFileSync('src/render/variationArt.json', JSON.stringify(variations));
console.log('Water and lava frames painted.');
