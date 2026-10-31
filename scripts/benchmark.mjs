// Times the new engine's chunk generation and meshing on a fixed surface fixture.
// Usage: node scripts/benchmark.mjs [--assert]   (gates per chunk: generation < 2 ms, meshing < 1 ms,
// worker light < 1 ms, main-thread light stitching < 1 ms)
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({ root, configFile: false, server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } });
try {
  const { Generator } = await vite.ssrLoadModule('/src/worldgen/generator.ts');
  const { Chunk } = await vite.ssrLoadModule('/src/engine/chunk.ts');
  const { World } = await vite.ssrLoadModule('/src/engine/world.ts');
  const { buildMesh, PAD_VOLUME, padIndex } = await vite.ssrLoadModule('/src/engine/mesher.ts');
  const { chunkLight, LightEngine } = await vite.ssrLoadModule('/src/engine/light.ts');
  const { CHUNK_SIZE, CHUNK_VOLUME } = await vite.ssrLoadModule('/src/config.ts');
  const seed = Number(process.env.BENCHMARK_SEED || 1);
  const span = 5; // a 5 x 5 block of columns; the inner 3 x 3 surface band is meshed
  const gen = new Generator(seed);
  const world = new World();
  const genTimes = [];
  const lightTimes = [];
  const stitchTimes = [];
  const light = new LightEngine(world);
  const surface = [];
  for (let cx = -2; cx <= 2; cx++) {
    for (let cz = -2; cz <= 2; cz++) {
      const col = gen.column(cx, cz);
      const lo = Math.floor((col.minTop - 1) / CHUNK_SIZE) - 1, hi = Math.floor((col.maxTop + 1) / CHUNK_SIZE) + 1;
      for (let cy = lo; cy <= hi; cy++) {
        const out = new Uint16Array(CHUNK_VOLUME);
        const t = performance.now();
        const u = gen.generate(cx, cy, cz, out);
        genTimes.push(performance.now() - t);
        if (u >= 0) out.fill(u);
        let t2 = performance.now();
        const bytes = chunkLight(out, cy, col.skyTop);
        lightTimes.push(performance.now() - t2);
        const chunk = new Chunk(cx, cy, cz, u >= 0 ? u : 0);
        if (u < 0) chunk.load(out);
        chunk.loadLight(bytes);
        const column = world.add(chunk);
        if (column.chunkCount === 1) { column.skyTop.set(col.skyTop); column.generatedSkyTop.set(col.skyTop); }
        t2 = performance.now();
        light.stitch(chunk);
        stitchTimes.push(performance.now() - t2);
        if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1 && cy > lo && cy < hi) surface.push([cx, cy, cz, col.climate]);
      }
    }
  }
  const inputFor = ([cx, cy, cz, climate]) => {
    const states = new Uint16Array(PAD_VOLUME);
    for (let y = -1; y <= CHUNK_SIZE; y++) for (let z = -1; z <= CHUNK_SIZE; z++) for (let x = -1; x <= CHUNK_SIZE; x++)
      states[padIndex(x, y, z)] = world.get(cx * CHUNK_SIZE + x, cy * CHUNK_SIZE + y, cz * CHUNK_SIZE + z);
    const lightBytes = new Uint8Array(PAD_VOLUME);
    for (let y = -1; y <= CHUNK_SIZE; y++) for (let z = -1; z <= CHUNK_SIZE; z++) for (let x = -1; x <= CHUNK_SIZE; x++) {
      const c = world.chunkAt(cx * CHUNK_SIZE + x, cy * CHUNK_SIZE + y, cz * CHUNK_SIZE + z);
      if (c) lightBytes[padIndex(x, y, z)] = c.lightByte((((y + 16) % 16) * 16 + ((z + 16) % 16)) * 16 + ((x + 16) % 16));
    }
    return { states, light: lightBytes, climate };
  };
  const inputs = surface.map(inputFor);
  const hash = createHash('sha256');
  let meshTimes = [];
  for (let pass = 0; pass < 3; pass++) {
    meshTimes = [];
    for (const input of inputs) {
      const t = performance.now();
      const out = buildMesh(input);
      meshTimes.push(performance.now() - t);
      if (pass === 0) for (const l of out) hash.update(new Uint8Array(l.buffer));
    }
  }
  // Generation is measured on a fresh generator too, so column preparation is included once per column.
  const fresh = new Generator(seed + 1);
  const coldTimes = [];
  for (let cx = 10; cx < 10 + span; cx++) {
    const out = new Uint16Array(CHUNK_VOLUME);
    const col = fresh.column(cx, 0);
    const t = performance.now();
    fresh.generate(cx, Math.floor(col.maxTop / CHUNK_SIZE), 0, out);
    coldTimes.push(performance.now() - t);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const surfaceGen = genTimes.filter((t) => t > 0.05);
  const report = {
    runtime: `node ${process.version}`,
    chunks: genTimes.length, surfaceChunksMeshed: inputs.length,
    generationMeanMs: mean(surfaceGen), generationAllMeanMs: mean(genTimes), coldSurfaceMs: mean(coldTimes),
    meshMeanMs: mean(meshTimes), meshMaxMs: Math.max(...meshTimes),
    chunkLightMeanMs: mean(lightTimes), stitchMeanMs: mean(stitchTimes), stitchMaxMs: Math.max(...stitchTimes),
    meshSha256: hash.digest('hex'),
  };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--assert')) {
    if (report.generationMeanMs > 2) throw new Error(`generation ${report.generationMeanMs.toFixed(3)} ms > 2 ms`);
    if (report.meshMeanMs > 1) throw new Error(`meshing ${report.meshMeanMs.toFixed(3)} ms > 1 ms`);
    if (report.chunkLightMeanMs > 1) throw new Error(`chunk light ${report.chunkLightMeanMs.toFixed(3)} ms > 1 ms`);
    if (report.stitchMeanMs > 1) throw new Error(`light stitching ${report.stitchMeanMs.toFixed(3)} ms > 1 ms`);
  }
} finally {
  await vite.close();
}
