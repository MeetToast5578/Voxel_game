// Reproducible terrain acceptance views. Screenshots are review evidence, not owner approval.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 4175, strictPort: true }, logLevel: 'warn' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:4175/?seed=1&autostart=1&nosave=1');
  await page.waitForFunction(() => window.__game?.ready, null, { timeout: 90000 });
  mkdirSync('screenshots', { recursive: true });
  const views = [
    { name: 'elevated', x: 101.5, y: 245, z: -26.5, yaw: -.8, pitch: -.35 },
    { name: 'recenter', x: 165.5, y: 245, z: -26.5, yaw: -.8, pitch: -.35 },
    { name: 'ground', x: 101.5, y: 20, z: -26.5, yaw: -.8, pitch: -.15 },
    { name: 'forest', x: 3480, y: 290, z: -2220, yaw: .55, pitch: -.25 },
    { name: 'ridge', x: 101.5, y: 300, z: -26.5, yaw: 2.3, pitch: -.15 },
  ];
  for (const view of views) {
    await page.evaluate(v => {
      const g = window.__game;
      g.setFlying(true); g.setTimeOfDay(.25); g.teleport(v.x, v.y, v.z); g.look(v.yaw, v.pitch);
    }, view);
    await page.waitForFunction(({ x, z }) => {
      const s = window.__game.state();
      return s.pendingGen === 0 && s.pendingMesh === 0 && s.jobsInFlight === 0 &&
        s.horizon.centerX === Math.floor(x / 64) * 64 && s.horizon.centerZ === Math.floor(z / 64) * 64;
    }, view, { timeout: 120000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/terrain-review-${view.name}.png`, timeout: 60000 });
    console.log(JSON.stringify({ view: view.name, state: await page.evaluate(() => window.__game.state()) }));
  }
  if (errors.length) throw Error(errors.join('\n'));
  console.log('TERRAIN REVIEW CAPTURE PASSED');
} finally {
  await browser?.close();
  await server.close();
}
