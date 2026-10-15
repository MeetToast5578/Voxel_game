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
const SEA_LEVEL = 67; // SEA_LEVEL in src/config.ts (40 m at 0.6 m per block), in blocks
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
      // Bricks 40 blocks below and above the player: teleport there first so their chunks are loaded.
      const waitMeshed = () => p.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      for (const dy of [-40, 40]) {
        await p.evaluate(([x, y, z]) => {
          window.__game.setFlying(true);
          window.__game.teleport(x + 0.5, y, z + 0.5);
        }, [x, y + dy, z]);
        await waitMeshed();
        const placed = await p.evaluate(([x, y, z]) => window.__game.setBlock(x + 2, y, z, 12), [x, y + dy, z]);
        if (!placed) throw new Error(`could not place a brick at y ${y + dy}`);
      }
      await p.evaluate(([px, py, pz, flying]) => {
        window.__game.teleport(px, py, pz);
        window.__game.setFlying(flying);
      }, [...before.position, before.flying]);
      await waitMeshed();
      const saved = await p.evaluate(() => {
        window.__game.selectSlot(4);
        window.__game.setHotbarSlot(0, 13); // glowstone
        window.__game.setTimeOfDay(0.6);
        return window.__game.save();
      });
      if (!saved) throw new Error('save() resolved to false');
      await p.reload();
      await p.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
      const after = await p.evaluate(() => window.__game.state());
      const brick = await p.evaluate(([x, y, z]) => window.__game.getBlock(x + 2, y + 3, z), [x, y, z]);
      // The chunks 40 blocks away load shortly after the player is placed.
      const deepAndHigh = await p
        .waitForFunction(
          ([x, y, z]) => window.__game.getBlock(x + 2, y - 40, z) === 12 && window.__game.getBlock(x + 2, y + 40, z) === 12,
          [x, y, z],
          { timeout: 30_000 },
        )
        .then(() => true, () => false);
      await context.close();
      if (after.seed !== before.seed) throw new Error(`seed changed: ${before.seed} -> ${after.seed}`);
      if (brick !== 12) throw new Error(`saved brick missing, found block ${brick}`);
      if (!deepAndHigh) throw new Error('the bricks 40 blocks below and above were not restored');
      if (after.selectedSlot !== 4) throw new Error(`selected slot not restored: ${after.selectedSlot}`);
      if (after.hotbar[0] !== 13) throw new Error(`hotbar not restored: ${JSON.stringify(after.hotbar)}`);
      if (Math.abs(after.timeOfDay - 0.6) > 0.01) throw new Error(`time of day not restored: ${after.timeOfDay}`);
      const moved = Math.hypot(after.position[0] - before.position[0], after.position[2] - before.position[2]);
      if (moved > 1) throw new Error(`player position not restored: ${before.position} -> ${after.position}`);
    },
  },
  {
    name: 'swims in water and sees the underwater fog',
    run: async (page) => {
      const start = await page.evaluate(() => window.__game.state());
      // Find a water column near the player (seed 1 has a lake next to spawn).
      const spot = await page.evaluate(([px, pz, sea]) => {
        for (let r = 0; r < 48; r++)
          for (let dx = -r; dx <= r; dx++)
            for (let dz = -r; dz <= r; dz++) {
              const x = Math.floor(px) + dx;
              const z = Math.floor(pz) + dz;
              if (window.__game.getBlock(x, sea - 2, z) === 5 && window.__game.getBlock(x, sea - 4, z) === 5) return [x, z];
            }
        return null;
      }, [start.position[0], start.position[2], SEA_LEVEL]);
      if (!spot) throw new Error('no deep water found near spawn');
      await page.evaluate(([x, z, sea]) => {
        window.__game.teleport(x + 0.5, sea - 4, z + 0.5);
        window.__game.look(0, 0);
      }, [...spot, SEA_LEVEL]);
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
        let top = 240; // the legacy column's top, above all terrain
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
    name: 'deep and high chunks',
    run: async (page) => {
      const start = await page.evaluate(() => window.__game.state());
      const [x, , z] = start.position;
      const bx = Math.floor(x);
      const bz = Math.floor(z);
      const waitMeshed = () => page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });

      await page.evaluate(([x, z]) => {
        window.__game.setFlying(true); // hover: no gravity, and no input moves the player
        window.__game.teleport(x, -200, z);
      }, [x, z]);
      await waitMeshed();
      const below = await page.evaluate(([x, z]) => window.__game.getBlock(x, -205, z), [bx, bz]);
      if (below !== 1) throw new Error(`expected stone 5 blocks below y = -200, found ${below}`);

      await page.evaluate(([x, z]) => window.__game.teleport(x, 300, z), [x, z]);
      await waitMeshed();
      const placed = await page.evaluate(([x, z]) => window.__game.setBlock(x + 2, 301, z, 9), [bx, bz]); // glass
      const glass = await page.evaluate(([x, z]) => window.__game.getBlock(x + 2, 301, z), [bx, bz]);
      if (!placed || glass !== 9) throw new Error(`glass at y = 301: placed ${placed}, read back ${glass}`);
      await page.screenshot({ path: 'screenshots/high.png' });

      await page.evaluate(([x, y, z, flying]) => {
        window.__game.teleport(x, y, z);
        window.__game.setFlying(flying);
      }, [...start.position, start.flying]);
      await waitMeshed();
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

  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}${URL_PATH}`);
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
  console.log(`ready ${Date.now() - t0} ms after opening the page`);
  await page.waitForTimeout(1000);
  console.log('state:', JSON.stringify(await page.evaluate(() => window.__game.state())));
  await page.screenshot({ path: 'screenshots/smoke.png' });
  console.log('saved screenshots/smoke.png');

  for (const check of CHECKS) {
    await check.run(page);
    console.log(`check passed: ${check.name}`);
  }

  // Measurement only (not a check): time until nothing is left to load or mesh, then the steady frame rate.
  const loadStart = Date.now();
  await page.evaluate(() => window.__game.look(0, -0.1));
  await page
    .waitForFunction(() => {
      const s = window.__game.state();
      return s.pendingGen === 0 && s.pendingMesh === 0;
    }, null, { timeout: 120_000, polling: 250 })
    .catch(() => console.log('still loading after 120 s'));
  const loadMs = Date.now() - loadStart;
  await page.waitForTimeout(3000);
  const steady = await page.evaluate(() => window.__game.state());
  console.log(`fully loaded ${loadMs} ms after the checks; then ${steady.fps} fps, ${steady.loaded} chunks loaded, ${steady.meshed} meshed, ${steady.drawCalls} draw calls`);
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
