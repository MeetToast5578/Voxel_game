// Smoke test: `npm run smoke` (builds first, then runs this file).
// 1. Serves dist/ with `vite preview`.
// 2. Opens the game in headless Chromium with ?seed=1&autostart=1&nosave=1.
// 3. Waits until window.__game.ready === true, prints window.__game.state(), saves screenshots/smoke.png.
// 4. Runs every entry of CHECKS (each one drives the game through window.__game).
// Exits with code 1 if the page logged an error, threw, timed out, or a check failed.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';

const PORT = 4173;
const URL_PATH = process.env.SMOKE_PATH || '/?seed=1&autostart=1&nosave=1';

/** @type {{ name: string, run: (page: import('playwright').Page) => Promise<void> }[]} */
const CHECKS = [
  {
    name: 'player stands on the ground',
    run: async (page) => {
      const s = await page.evaluate(() => window.__game.state());
      if (!s.onGround) throw new Error(`expected onGround, got ${JSON.stringify(s)}`);
    },
  },
  {
    name: 'player falls and lands after teleport',
    run: async (page) => {
      const before = await page.evaluate(() => window.__game.state());
      await page.evaluate(([x, y, z]) => window.__game.teleport(x, y + 8, z), before.position);
      await page.waitForTimeout(2000);
      const after = await page.evaluate(() => window.__game.state());
      if (!after.onGround || Math.abs(after.position[1] - before.position[1]) > 0.05)
        throw new Error(`did not land: ${JSON.stringify(after)}`);
    },
  },
  {
    name: 'look around screenshot',
    run: async (page) => {
      await page.evaluate(() => window.__game.look(2.2, -0.25));
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'screenshots/look.png' });
    },
  },
  {
    name: 'break the block under the player',
    run: async (page) => {
      await page.evaluate(() => window.__game.look(0, -Math.PI / 2 + 0.01)); // straight down
      await page.waitForTimeout(300);
      const s = await page.evaluate(() => window.__game.state());
      if (!s.target) throw new Error(`no target below the player: ${JSON.stringify(s)}`);
      if (!(await page.evaluate(() => window.__game.breakTarget()))) throw new Error('breakTarget returned false');
      const id = await page.evaluate(([x, y, z]) => window.__game.getBlock(x, y, z), s.target);
      if (id !== 0) throw new Error(`block at ${s.target} should be air (0) but is ${id}`);
      await page.waitForTimeout(1000); // the player drops into the hole
    },
  },
  {
    name: 'place a brick in front of the player',
    run: async (page) => {
      await page.evaluate(() => window.__game.selectSlot(8)); // slot 9 = brick
      await page.evaluate(() => window.__game.look(0, -0.6));
      await page.waitForTimeout(300);
      const s = await page.evaluate(() => window.__game.state());
      if (s.selectedBlock !== 'Brick') throw new Error(`expected Brick selected, got ${s.selectedBlock}`);
      if (!s.target) throw new Error(`nothing targeted: ${JSON.stringify(s)}`);
      if (!(await page.evaluate(() => window.__game.placeTarget()))) throw new Error('placeTarget returned false');
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'screenshots/interaction.png' });
    },
  },
  {
    name: 'HUD shows 9 hotbar slots and the debug overlay toggles with F3',
    run: async (page) => {
      const slots = await page.locator('.hotbar .slot').count();
      const selected = await page.locator('.hotbar .slot.selected').count();
      if (slots !== 9 || selected !== 1) throw new Error(`hotbar: ${slots} slots, ${selected} selected`);
      await page.evaluate(() => window.__game.look(0, -0.3));
      await page.keyboard.press('F3');
      await page.waitForTimeout(600);
      const text = await page.locator('.debug-overlay').innerText();
      if (!text.includes('FPS')) throw new Error(`debug overlay text: ${text}`);
      await page.screenshot({ path: 'screenshots/hud.png' });
      await page.keyboard.press('F3');
    },
  },
  {
    name: 'start menu is shown without autostart',
    run: async (page) => {
      const menuPage = await page.context().browser().newPage({ viewport: { width: 1280, height: 720 } });
      await menuPage.goto(new URL('/?seed=1&nosave=1', page.url()).href);
      await menuPage.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
      if (!(await menuPage.locator('.menu-overlay').isVisible())) throw new Error('menu not visible');
      const title = await menuPage.locator('.menu-title').innerText();
      if (title !== 'Voxel Game') throw new Error(`menu title: ${title}`);
      await menuPage.screenshot({ path: 'screenshots/menu.png' });
      await menuPage.close();
    },
  },
  {
    name: 'saves the world and restores it after a reload',
    run: async (page) => {
      // A fresh browser context has empty localStorage. No ?seed / ?nosave, so saving is on.
      const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 720 } });
      const p = await context.newPage();
      const url = new URL('/?autostart=1', page.url()).href;
      await p.goto(url);
      await p.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
      const before = await p.evaluate(() => window.__game.state());
      const [x, y, z] = before.position.map(Math.floor);
      await p.evaluate(([x, y, z]) => window.__game.setBlock(x + 2, y + 3, z, 12), [x, y, z]); // a floating brick
      await p.evaluate(() => {
        window.__game.selectSlot(4);
        window.__game.save();
      });
      await p.reload();
      await p.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
      const after = await p.evaluate(() => window.__game.state());
      const brick = await p.evaluate(([x, y, z]) => window.__game.getBlock(x + 2, y + 3, z), [x, y, z]);
      await context.close();
      if (after.seed !== before.seed) throw new Error(`seed changed: ${before.seed} -> ${after.seed}`);
      if (brick !== 12) throw new Error(`saved brick missing, found block ${brick}`);
      if (after.selectedSlot !== 4) throw new Error(`selected slot not restored: ${after.selectedSlot}`);
      const moved = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
      if (moved > 1) throw new Error(`player position not restored: ${before.position} -> ${after.position}`);
    },
  },
  {
    name: 'swims in water and sees the underwater fog',
    run: async (page) => {
      const start = await page.evaluate(() => window.__game.state());
      // Find a water column near the player (seed 1 has a lake next to spawn).
      const spot = await page.evaluate(([px, pz]) => {
        for (let r = 0; r < 48; r++)
          for (let dx = -r; dx <= r; dx++)
            for (let dz = -r; dz <= r; dz++) {
              const x = Math.floor(px) + dx;
              const z = Math.floor(pz) + dz;
              if (window.__game.getBlock(x, 38, z) === 5 && window.__game.getBlock(x, 36, z) === 5) return [x, z];
            }
        return null;
      }, [start.position[0], start.position[2]]);
      if (!spot) throw new Error('no deep water found near spawn');
      await page.evaluate(([x, z]) => {
        window.__game.teleport(x + 0.5, 36, z + 0.5);
        window.__game.look(0, 0);
      }, spot);
      await page.waitForTimeout(400);
      const s = await page.evaluate(() => window.__game.state());
      if (!s.inWater) throw new Error(`expected inWater: ${JSON.stringify(s)}`);
      await page.screenshot({ path: 'screenshots/underwater.png' });
      await page.evaluate(([x, y, z]) => window.__game.teleport(x, y, z), start.position);
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'night is dark',
    run: async (page) => {
      await page.evaluate(() => {
        window.__game.setTimeOfDay(0.75);
        window.__game.look(0.8, -0.2);
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'screenshots/night.png' });
      await page.evaluate(() => window.__game.setTimeOfDay(0.3));
      await page.waitForTimeout(200);
    },
  },
  {
    name: 'pick block puts the targeted block into the hotbar',
    run: async (page) => {
      await page.evaluate(() => window.__game.look(0, -Math.PI / 2 + 0.01)); // straight down
      await page.waitForTimeout(300);
      const s = await page.evaluate(() => window.__game.state());
      if (!s.target) throw new Error('nothing targeted');
      if (!(await page.evaluate(() => window.__game.pickTarget()))) throw new Error('pickTarget returned false');
      const after = await page.evaluate(() => window.__game.state());
      if (after.selectedBlock !== s.targetName)
        throw new Error(`expected ${s.targetName} selected, got ${after.selectedBlock}`);
    },
  },
  {
    name: 'clouds are visible when looking up',
    run: async (page) => {
      await page.evaluate(() => window.__game.look(0.5, 0.9));
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'screenshots/clouds.png' });
      await page.evaluate(() => window.__game.look(0, 0));
    },
  },
  {
    name: 'glowstone lights up the night',
    run: async (page) => {
      const s = await page.evaluate(() => window.__game.state());
      const [x, , z] = s.position.map(Math.floor);
      await page.evaluate(([x, z]) => {
        const g = window.__game;
        // Surface (first non-air from the top) of the column 4 blocks south of the player.
        let top = 120;
        while (top > 1 && g.getBlock(x, top, z + 4) === 0) top--;
        g.setBlock(x, top + 1, z + 4, 13); // glowstone on the ground
        g.setTimeOfDay(0.75); // midnight
        g.look(Math.PI, -0.35); // face south (+Z), slightly down
      }, [x, z]);
      await page.waitForTimeout(1500); // the 8 neighbor chunks are relit over a few frames
      await page.screenshot({ path: 'screenshots/glowstone.png' });
      await page.evaluate(() => window.__game.setTimeOfDay(0.3));
    },
  },
  {
    name: 'chunks are built by Web Workers',
    run: async (page) => {
      const s = await page.evaluate(() => window.__game.state());
      if (!s.workers) throw new Error(`expected workers: true, got ${JSON.stringify(s)}`);
      if (s.meshed < 50) throw new Error(`too few chunks meshed: ${s.meshed}`);
    },
  },
];

mkdirSync('screenshots', { recursive: true });
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' });
const errors = [];
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`page error: ${err.message}`));

  await page.goto(`http://localhost:${PORT}${URL_PATH}`);
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
  await page.waitForTimeout(1000);
  console.log('state:', JSON.stringify(await page.evaluate(() => window.__game.state())));
  await page.screenshot({ path: 'screenshots/smoke.png' });
  console.log('saved screenshots/smoke.png');

  for (const check of CHECKS) {
    await check.run(page);
    console.log(`check passed: ${check.name}`);
  }
} catch (err) {
  errors.push(`smoke failure: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

if (errors.length > 0) {
  console.error(`SMOKE TEST FAILED\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('SMOKE TEST PASSED');
