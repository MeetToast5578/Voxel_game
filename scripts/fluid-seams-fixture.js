import * as THREE from 'three';
import { BLOCKS } from '/src/engine/blocks.ts';
import { buildMesh, decodeVertex, PAD_VOLUME, padIndex } from '/src/engine/mesher.ts';
import { chunkKey } from '/src/core/coords.ts';

/** Compare actual fluid pixels with an independent union of filled boxes. Magenta reveals open seams. */
export function inspectFluidSeams(game) {
  const renderer = game.renderer, width = 320, height = 240;
  const target = new THREE.WebGLRenderTarget(width, height);
  const pixels = new Uint8Array(width * height * 4), results = [];
  const camera = new THREE.PerspectiveCamera(40, width / height, .1, 100);
  const box = new THREE.BoxGeometry(1, 1, 1), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const background = new THREE.Color(1, 0, 1), previousBackground = game.scene.background;
  const levels = [2, 4, 5, 7, 9, 11, 12, 14];
  const capture = scene => {
    renderer.setRenderTarget(target); renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    return new Uint8Array(pixels);
  };
  const magenta = (p, i) => p[i] === 255 && p[i + 1] === 0 && p[i + 2] === 255;
  const countHoles = (actual, expected) => {
    let checked = 0;
    const missing = new Set();
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      let interior = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (expected[((y + dy) * width + x + dx) * 4] !== 255 || expected[((y + dy) * width + x + dx) * 4 + 1] !== 255) interior = false;
      }
      if (interior) { checked++; if (magenta(actual, (y * width + x) * 4)) missing.add(y * width + x); }
    }
    const rawHoles = missing.size; let holes = 0, maxRun = 0;
    // Independent boxes and greedy quads have different triangulation. At an exact projected edge a pair of
    // raster pixels can disagree; a continuous opening or stripe must never pass as such an isolated mismatch.
    while (missing.size) {
      const seed = missing.values().next().value, queue = [seed]; missing.delete(seed);
      for (let i = 0; i < queue.length; i++) {
        const p = queue[i];
        for (const offset of [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1]) {
          if (missing.delete(p + offset)) queue.push(p + offset);
        }
      }
      maxRun = Math.max(maxRun, queue.length); if (queue.length > 2) holes += queue.length;
    }
    return { holes, rawHoles, maxRun, checked };
  };
  try {
    game.scene.background = background;
    for (const kind of ['water', 'lava']) for (const layout of ['flat', 'river-steps', 'flow-levels', 'waterfall']) {
      const cells = new Map(), reference = new THREE.Scene(); reference.background = background;
      const put = (x, y, z, state, exposedHeight) => cells.set(`${x},${y},${z}`, { x, y, z, state, exposedHeight });
      // Cross positive/negative X/Z chunk borders and a Y chunk border in one assembled field.
      for (let z = -2; z < 2; z++) for (let x = 14; x < 18; x++) {
        const surfaceY = layout === 'river-steps' ? 14 + Math.floor((z + 2) / 2) : layout === 'waterfall' && z < 0 ? 17 : 14;
        for (let y = 13; y <= surfaceY; y++) {
          let state = BLOCKS.state(kind), exposedHeight = 14 / 16;
          if (layout === 'flow-levels' && y === surfaceY) {
            const level = (x - 14 + (z + 2) * 2) % 8;
            state = BLOCKS.state('flowing_' + kind, level); exposedHeight = levels[level] / 16;
          }
          put(x, y, z, state, exposedHeight);
        }
        if (layout === 'waterfall' && z === 0) for (let y = 15; y <= 17; y++) {
          put(x, y, z, BLOCKS.state('flowing_' + kind, y === 17 ? 7 : 15), y === 17 ? 14 / 16 : 1);
        }
      }
      const chunks = new Map();
      for (const c of cells.values()) {
        const coords = [c.x, c.y, c.z].map(n => Math.floor(n / 16)), key = chunkKey(...coords);
        if (!chunks.has(key)) chunks.set(key, { coords });
        const h = cells.has(`${c.x},${c.y + 1},${c.z}`) ? 1 : c.exposedHeight;
        const cube = new THREE.Mesh(box, white); cube.position.set(c.x + .5, c.y + h / 2, c.z + .5); cube.scale.y = h; reference.add(cube);
      }
      for (const chunk of chunks.values()) {
        const [cx, cy, cz] = chunk.coords, states = new Uint16Array(PAD_VOLUME);
        for (let y = -1; y <= 16; y++) for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) {
          states[padIndex(x, y, z)] = cells.get(`${cx * 16 + x},${cy * 16 + y},${cz * 16 + z}`)?.state ?? 0;
        }
        chunk.mesh = buildMesh({ states, light: new Uint8Array(PAD_VOLUME).fill(0xf0), climate: new Uint8Array(256) });
        // Negative control: deliberately remove the joining strips, recreating the reported bug.
        chunk.broken = chunk.mesh.map(words => {
          const kept = [];
          for (let q = 0; q < words.length; q += 8) {
            const v = [0, 2, 4, 6].map(i => decodeVertex(words[q + i], words[q + i + 1]));
            const low = Math.min(...v.map(p => p.y));
            if (v[0].normal !== 2 && v[0].normal !== 3 && low % 1 !== 0) continue;
            kept.push(...words.subarray(q, q + 8));
          }
          return new Uint32Array(kept);
        });
      }
      const install = broken => {
        for (const key of [...game.chunks.keys()]) game.chunks.remove(key);
        for (const [key, c] of chunks) game.chunks.set(key, ...c.coords, broken ? c.broken : c.mesh);
      };
      const center = new THREE.Vector3(16, layout === 'waterfall' ? 15.5 : 14.5, 0);
      for (let facing = 0; facing < 4; facing++) {
        const angle = Math.PI / 4 + facing * Math.PI / 2;
        camera.position.copy(center).add(new THREE.Vector3(Math.cos(angle) * 8, 4.5, Math.sin(angle) * 8)); camera.lookAt(center);
        const expected = capture(reference);
        install(false); const actual = countHoles(capture(game.scene), expected);
        install(true); const broken = countHoles(capture(game.scene), expected);
        results.push({ kind, layout, facing, ...actual, brokenHoles: broken.holes });
        if (facing === 0 && layout !== 'flat') {
          install(false); game.scene.background = previousBackground;
          renderer.setRenderTarget(null); renderer.setSize(width, height, false); renderer.render(game.scene, camera);
          const card = document.createElement('div'); card.className = 'card';
          const title = document.createElement('b'); title.textContent = kind + ' · ' + layout;
          const note = document.createElement('small'); note.textContent = 'Assembled across X/Y/Z chunk borders';
          const img = new Image(); img.src = renderer.domElement.toDataURL(); card.append(title, note, img); document.querySelector('.grid').append(card);
          game.scene.background = background;
        }
      }
    }
  } finally {
    game.scene.background = previousBackground; renderer.setRenderTarget(null); target.dispose(); box.dispose(); white.dispose();
  }
  return results;
}
