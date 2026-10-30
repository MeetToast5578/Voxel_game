// Loads next.html in headless Chromium, waits until streaming is idle, reports counts and saves screenshots.
// Usage: node scripts/next-smoke.mjs [--view N] (needs a prior `vite build`).
import { chromium } from 'playwright';
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';

const view = Number(process.argv[process.argv.indexOf('--view') + 1]) || 12;
const server = await preview({ preview: { port: 4174, strictPort: true } });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  mkdirSync('screenshots', { recursive: true });
  const poses = [
    { name: 'next-spawn', url: `?seed=1&view=${view}` },
    { name: 'next-high', url: `?seed=1&view=${view}&x=0.5&y=200&z=0.5&pitch=-0.6` },
    { name: 'next-evening', url: `?seed=1&view=${view}&time=0.77` },
  ];
  for (const pose of poses) {
    await page.goto(`http://localhost:4174/next.html${pose.url}`);
    const t0 = Date.now();
    await page.waitForFunction(() => window.__next?.idle, null, { timeout: 180_000, polling: 250 });
    await page.waitForTimeout(1000);
    const stats = await page.evaluate(() => {
      const n = window.__next;
      return { fps: n.fps, chunks: n.world.chunks.size, meshes: n.renderer.chunks.count, quads: n.renderer.chunks.quads,
        calls: n.renderer.renderer.info.render.calls, failures: n.streamer.failures };
    });
    console.log(pose.name, JSON.stringify({ ...stats, loadMs: Date.now() - t0 }));
    await page.screenshot({ path: `screenshots/${pose.name}.png` });
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
if (errors.length) {
  console.error('console errors:\n' + errors.join('\n'));
  process.exit(1);
}
