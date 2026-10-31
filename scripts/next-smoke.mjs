// Loads next.html in headless Chromium: views, edit latency and saving. Needs a prior `vite build`.
// Usage: node scripts/next-smoke.mjs [--view N]
import { chromium } from 'playwright';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const view = Number(process.argv[process.argv.indexOf('--view') + 1]) || 12;
const server = await preview({ preview: { port: 4174, strictPort: true } });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const errors = [];
mkdirSync('screenshots', { recursive: true });

/** A fresh page for each step, loaded and idle. Steps that only need the ground near the player load a short view. */
async function open(query, viewChunks = view) {
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(`http://localhost:4174/next.html?view=${viewChunks}&${query}`);
  await page.waitForFunction(() => window.__next?.idle, null, { timeout: 180_000, polling: 250 });
  await page.waitForTimeout(1000);
  return { page, loadMs: Date.now() - t0 };
}

try {
  for (const [name, query] of [
    ['next-spawn', 'seed=1&world=smoke-spawn&new=1'],
    ['next-high', 'seed=1&x=0.5&y=200&z=0.5&pitch=-0.6&fly=1&world=smoke-high&new=1'],
    ['next-evening', 'seed=1&time=0.77&world=smoke-evening&new=1'],
    ['next-night', 'seed=1&time=0.02&world=smoke-night&new=1&pitch=0.3'],
    ['next-river', 'seed=1&x=10&y=50&z=-130&yaw=0.3&pitch=-0.45&fly=1&world=smoke-river&new=1'],
    ['next-forest', 'seed=1&x=-950&y=95&z=-950&yaw=0.6&pitch=-0.25&fly=1&world=smoke-forest&new=1'],
    ['next-cave', 'seed=1&x=8&y=-60&z=8&fly=1&world=smoke-cave&new=1'],
  ]) {
    const { page, loadMs } = await open(query);
    const stats = await page.evaluate(() => {
      const n = window.__next;
      return { fps: n.fps, chunks: n.world.chunks.size, meshes: n.renderer.chunks.count, quads: n.renderer.chunks.quads,
        calls: n.renderer.renderer.info.render.calls, failures: n.streamer.failures,
        visible: [...n.renderer.chunks.keys()].length, creatures: n.creatures.list.length };
    });
    console.log(name, JSON.stringify({ ...stats, loadMs }));
    // The pause menu shows whenever the pointer is free, which it always is here: hide the UI for the views.
    await page.evaluate(() => { document.querySelector('#ui').style.display = 'none'; });
    await page.screenshot({ path: `screenshots/${name}.png` });
    await page.close();
  }
  // The UI: the pause menu with the world list, and a survival inventory with crafting.
  {
    const { page } = await open('seed=1&world=smoke-ui&new=1&mode=survival', 6);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/next-menu.png' });
    await page.evaluate(() => {
      const n = window.__next, S = (k) => n.blocks.state(k);
      n.play.inventory.add({ state: S('log'), count: 5 });
      n.play.inventory.add({ state: S('cobblestone'), count: 20 });
      n.play.inventory.add({ state: S('stone_pickaxe'), count: 1, wear: 40 });
      n.play.craft[0] = { state: S('planks'), count: 2 };
      n.play.craft[2] = { state: S('planks'), count: 2 };
      n.play.openScreen('inventory', 2);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/next-inventory.png' });
    const ui = await page.evaluate(() => ({ slots: document.querySelectorAll('.slot').length, menu: !!document.querySelector('.menu') }));
    console.log('ui', JSON.stringify(ui));
    if (ui.slots < 40) errors.push(`inventory screen shows too few slots: ${ui.slots}`);
    // Dropped items lying in front of the player (too far to be picked up).
    const drops = await page.evaluate(async () => {
      const n = window.__next, S = (k) => n.blocks.state(k), b = n.player.body;
      n.play.closeScreen();
      Object.assign(n.player, { yaw: 0, pitch: -0.35 });
      ['dirt', 'torch', 'stone_pickaxe', 'cooked_meat', 'log'].forEach((k, i) => {
        const x = Math.floor(b.x) - 2 + i, z = Math.floor(b.z) - 6;
        n.play.drops.spawn({ state: S(k), count: 1 }, x + 0.5, n.world.surfaceAt(x, z) + 2, z + 0.5);
      });
      for (let f = 0; f < 30; f++) await new Promise(requestAnimationFrame);
      return n.play.drops.list.length;
    });
    await page.evaluate(() => { document.querySelector('#ui').style.display = 'none'; });
    await page.screenshot({ path: 'screenshots/next-drops.png' });
    if (drops !== 5) errors.push(`expected 5 dropped items, found ${drops}`);
    await page.close();
  }

  // Edit latency: main-thread time of one edit, and frames until its chunks are remeshed.
  const { page } = await open('seed=1&world=smoke-edit&new=1', 6);
  const edits = await page.evaluate(async () => {
    const n = window.__next;
    const results = [];
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(n.player.body.x) + 2 + i, z = Math.floor(n.player.body.z) + 2;
      const y = n.world.surfaceAt(x, z) + 1;
      const t0 = performance.now();
      n.setBlock(x, y, z, n.blocks.state(i % 2 ? 'brick' : 'glowstone'), true);
      const syncMs = performance.now() - t0;
      // The edited cell's own chunk, done when its new mesh is in.
      const key = n.world.chunkAt(x, y, z).key;
      let frames = 0;
      await new Promise((resolve) => {
        const tick = () => {
          frames++;
          if (!n.streamer.isPending(key) || frames >= 120) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      results.push({ syncMs: Math.round(syncMs * 100) / 100, frames });
    }
    return results;
  });
  console.log('edits', JSON.stringify(edits));
  // Budget: a typical edit (median) takes at most 2 ms on the main thread; one that moves a lot of light (an opaque
  // block next to glowstone) at most 8 ms under software rendering; every edit is remeshed within 2 frames.
  const sorted = edits.map((e) => e.syncMs).sort((a, b) => a - b);
  if (sorted[Math.floor(sorted.length / 2)] > 2 || sorted[sorted.length - 1] > 8 || edits.some((e) => e.frames > 2)) {
    errors.push(`edit latency over budget: ${JSON.stringify(edits)}`);
  }

  // Saving: an edit and the player's position survive a reload.
  const mark = await page.evaluate(async () => {
    const n = window.__next;
    const x = Math.floor(n.player.body.x) - 3, z = Math.floor(n.player.body.z) - 3;
    const y = n.world.surfaceAt(x, z) + 1;
    n.setBlock(x, y, z, n.blocks.state('brick'));
    await n.save();
    return { x, y, z, px: n.player.body.x, pz: n.player.body.z };
  });
  await page.close();
  const reloaded = await open('world=smoke-edit', 6);
  const after = await reloaded.page.evaluate(({ x, y, z }) => {
    const n = window.__next;
    return { name: n.blocks.stateName(n.world.get(x, y, z)), seed: n.seed, px: n.player.body.x, pz: n.player.body.z };
  }, mark);
  console.log('reload', JSON.stringify(after));
  if (after.name !== 'brick' || after.seed !== 1 || Math.abs(after.px - mark.px) > 0.01) {
    errors.push(`save did not survive a reload: ${JSON.stringify({ mark, after })}`);
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
if (errors.length) {
  console.error('errors:\n' + errors.join('\n'));
  process.exit(1);
}
