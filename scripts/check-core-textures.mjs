// Disk checks stay outside the browser TypeScript project; no Node typings are needed by the game.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root = new URL('../assets/woodland-ember/core-rework/', import.meta.url);
const json = url => JSON.parse(readFileSync(url, 'utf8'));
const manifest = json(new URL('manifest.json', root));
const index = json(new URL('texture-index.json', root));
const packed = json(new URL('textures.json', root));
assert.deepEqual(packed, json(new URL('../src/render/coreArt.json', import.meta.url)));
assert.deepEqual(readdirSync(new URL('tiles/', root)).sort(), index.map(e => e.file.slice(6)).sort());
assert.deepEqual(Object.keys(packed).sort(), index.map(e => e.name).sort());

const dimensions = file => {
  const png = readFileSync(new URL(file, root));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};
for (const entry of manifest.entries) {
  const [width, height] = dimensions(entry.source);
  assert.equal(width, height, entry.source);
  assert.ok(width >= manifest.tileSize, entry.source);
}
for (const entry of index) {
  assert.deepEqual(dimensions(entry.file), [32, 32], entry.file);
  const tile = packed[entry.name];
  const indices = Buffer.from(tile.indices, 'base64');
  assert.equal(indices.length, 32 * 32 * 2, entry.name);
  const pixels = Buffer.alloc(32 * 32 * 4);
  for (let i = 0; i < 32 * 32; i++) {
    const offset = indices.readUInt16LE(i * 2) * 4;
    assert.ok(offset + 3 < tile.palette.length, entry.name);
    for (let channel = 0; channel < 4; channel++) pixels[i * 4 + channel] = tile.palette[offset + channel];
  }
  assert.equal(createHash('sha256').update(pixels).digest('hex'), entry.pixelSha256, entry.name);
}
console.log(`Core textures: ${new Set(manifest.entries.map(e=>e.source)).size} active source images, ${index.length} exact-size exports and matching runtime hashes.`);
