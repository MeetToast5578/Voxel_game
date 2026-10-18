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
const SEA_LEVEL = 0; // SEA_LEVEL in src/config.ts (y = 0, sea level in the roadmap), in blocks
const URL_PATH = process.env.SMOKE_PATH || '/?seed=1&autostart=1&nosave=1';

/** Auxiliary windows test menus and persistence, not draw distance. Keep their worlds small so multiple
 * SwiftShader contexts do not starve startup; the primary world and its performance measurement stay at defaults. */
async function configureAuxiliaryPage(page) {
  await page.addInitScript(() => {
    localStorage.setItem('voxel-game-settings-v1', JSON.stringify({ renderDistance: 2 }));
  });
}


/** Include auxiliary menus and persistence windows in the same error contract as the primary game. */
function watchPage(page) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error (${page.url()}): ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`page error (${page.url()}): ${err.message}`));
}

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
      await page.waitForFunction(() => window.__game.state().target !== null, null, { timeout: 10_000 });
      const s = await page.evaluate(() => window.__game.state());
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
      const before = s.inventory[8]?.[1];
      if (!(await page.evaluate(() => window.__game.placeTarget()))) throw new Error('placeTarget returned false');
      await page.waitForTimeout(300);
      const after = (await page.evaluate(() => window.__game.state())).inventory[8]?.[1];
      if (after !== before - 1) throw new Error(`placing should use one brick: ${before} -> ${after}`);
      await page.screenshot({ path: 'screenshots/interaction.png' });
    },
  },
  {
    name: 'HUD shows the key hints and block icons in the hotbar',
    run: async (page) => {
      const hints = await page.locator('.key-hints').innerText();
      if (!hints.includes('Inventory')) throw new Error(`key hints: ${hints}`);
      const icons = await page.locator('.hotbar .slot .icon').count();
      if (icons < 1) throw new Error(`no block icons in the hotbar: ${icons}`);
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
      watchPage(menuPage);
      await configureAuxiliaryPage(menuPage);
      await menuPage.goto(new URL('/?seed=1&nosave=1', page.url()).href);
      await menuPage.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
      if (!(await menuPage.locator('.menu-overlay').isVisible())) throw new Error('menu not visible');
      const title = await menuPage.locator('.menu-title').innerText();
      if (title !== 'Voxel Game') throw new Error(`menu title: ${title}`);
      const inventoryButtons = await menuPage.locator('.menu-button', { hasText: 'Inventory' }).count();
      if (inventoryButtons !== 0) throw new Error('the start menu should not have an inventory button');
      const sections = await menuPage.locator('.controls-title').allInnerTexts();
      if (!sections.includes('Volume tools')) throw new Error(`controls sections: ${sections}`);
      await menuPage.screenshot({ path: 'screenshots/menu.png' });
      await menuPage.close();
      await page.bringToFront(); // Closing a separate browser context does not reliably reactivate the game page.
    },
  },
  {
    name: 'saves the world and restores it after a reload',
    run: async (page) => {
      // A fresh browser context has no world save. No ?seed / ?nosave, so saving is on.
      const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 720 } });
      const p = await context.newPage();
      watchPage(p);
      await configureAuxiliaryPage(p);
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
      await page.bringToFront();
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
      // The spawn area has no sea nearby: go to the nearest deep ocean for seed 1 first, then search there.
      await page.evaluate(() => window.__game.teleport(-39.5, 20, 84.5));
      await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      const spot = await page.evaluate(([px, pz, sea]) => {
        for (let r = 0; r < 48; r++)
          for (let dx = -r; dx <= r; dx++)
            for (let dz = -r; dz <= r; dz++) {
              const x = Math.floor(px) + dx;
              const z = Math.floor(pz) + dz;
              if (window.__game.getBlock(x, sea - 2, z) === 5 && window.__game.getBlock(x, sea - 4, z) === 5) return [x, z];
            }
        return null;
      }, [-39.5, 84.5, SEA_LEVEL]);
      if (!spot) throw new Error('no deep water found near spawn');
      await page.evaluate(([x, z, sea]) => {
        window.__game.teleport(x + 0.5, sea - 4, z + 0.5);
        window.__game.look(0, 0);
      }, [...spot, SEA_LEVEL]);
      await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      await page.waitForFunction(() => window.__game.state().inWater, null, { timeout: 20_000 }).catch(() => {});
      const s = await page.evaluate(() => window.__game.state());
      if (!s.inWater) throw new Error(`expected inWater: ${JSON.stringify(s)}`);
      await page.screenshot({ path: 'screenshots/underwater.png' });
      await page.evaluate(([x, y, z]) => window.__game.teleport(x, y, z), start.position);
      await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      await page.waitForFunction(() => window.__game.state().onGround, null, { timeout: 20_000 }).catch(() => {});
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
      // The break check leaves a one-block hole under the player. The player is 1.6 blocks wide, so it rests on the edge
      // of the hole, and looking down finds nothing. Stand a few blocks away on solid ground instead.
      const p = await page.evaluate(() => window.__game.state().position);
      await page.evaluate(([x, y, z]) => window.__game.teleport(x + 4, y + 2, z), p);
      await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      // Wait for the body to settle instead of a fixed delay: the terrain at +4 blocks can be higher or lower than the
      // spawn ground (region simulation made the spawn area a slope), and a fixed 500 ms is fps-dependent (task T-A2a).
      await page.waitForFunction(() => {
        const s = window.__game.state();
        return s.onGround || s.inWater;
      }, null, { timeout: 20_000 });
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__game.look(0, -Math.PI / 2 + 0.01)); // straight down
      await page.waitForFunction(() => window.__game.state().target !== null, null, { timeout: 10_000, polling: 100 })
        .catch(() => {}); // Capture the useful position/ground diagnostic below if targeting still fails.
      const s = await page.evaluate(() => window.__game.state());
      if (!s.target) {
        const [px, py, pz] = s.position.map(Math.floor);
        const below = await page.evaluate(([x, y, z]) => window.__game.getBlock(x, y, z), [px, py - 1, pz]);
        throw new Error(
          `nothing targeted at ${JSON.stringify(s.position)}, below ${below}, playing ${s.playing}, inventoryOpen ${s.inventoryOpen}, look ${s.yaw} ${s.pitch}`,
        );
      }
      if (!(await page.evaluate(() => window.__game.pickTarget()))) throw new Error('pickTarget returned false');
      const after = await page.evaluate(() => window.__game.state());
      if (after.selectedBlock !== s.targetName)
        throw new Error(`expected ${s.targetName} selected, got ${after.selectedBlock}`);
    },
  },
  {
    name: 'E opens the inventory and Escape closes it',
    run: async (page) => {
      await page.bringToFront(); // earlier checks opened other pages, which may have taken the keyboard
      // Regress late icon readback: wait for the busy world, then put a not-yet-shown item outside the hotbar.
      // The old GPU-backed toDataURL path blocked for ~20 s when this icon first appeared in the inventory.
      await page.waitForFunction(() => {
        const s = window.__game.state();
        return s.pendingGen === 0 && s.pendingMesh === 0;
      }, null, { timeout: 120_000, polling: 100 });
      await page.evaluate(() => window.__game.setHotbarSlot(9, 18)); // slot 10: tall grass, not drawn by the HUD
      await page.keyboard.press('KeyE');
      // Timer polling also observes state when Chromium throttles RAF after the multi-page save checks.
      await page.waitForFunction(() => window.__game.state().inventoryOpen, null, { timeout: 10_000, polling: 100 })
        .catch(async () => { throw new Error(`E did not open inventory: ${JSON.stringify(await page.evaluate(() => window.__game.state()))}`); });
      await page.screenshot({ path: 'screenshots/inventory.png' });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.__game.state().inventoryOpen, null, { timeout: 10_000, polling: 100 })
        .catch(async () => { throw new Error(`Escape did not close inventory: ${JSON.stringify(await page.evaluate(() => window.__game.state()))}`); });
    },
  },
  {
    name: 'holding the left button breaks a block over time, and the item is picked up',
    run: async (page) => {
      const PLANTS = ['Tall grass', 'Poppy', 'Fern', 'Dandelion', 'Brown mushroom', 'Red mushroom']; // break at once
      await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      await page.evaluate(() => window.__game.look(0, -Math.PI / 2 + 0.01));
      await page.waitForFunction(() => {
        const s = window.__game.state();
        return s.target !== null && s.target[0] === Math.floor(s.position[0]) &&
          s.target[2] === Math.floor(s.position[2]) && s.target[1] < s.position[1];
      }, null, { timeout: 10_000, polling: 100 });
      const s = await page.evaluate(() => window.__game.state());
      const id = await page.evaluate(([x, y, z]) => window.__game.getBlock(x, y, z), s.target);
      const countOf = () =>
        page.evaluate((state) => window.__game.state().inventory.reduce((n, slot) => n + (slot && slot[0] === state ? slot[1] : 0), 0), id);
      const before = await countOf();
      await page.evaluate(() => window.__game.holdButton(0, true));
      let sawStage = false;
      for (let i = 0; i < 20 && !sawStage; i++) {
        await page.waitForTimeout(50);
        sawStage = (await page.evaluate(() => window.__game.state().breakStage)) >= 0;
      }
      // Do not leave mining held while screenshot readback runs: on slow software rendering it can mine several
      // more blocks, drop the item into a deeper shaft and turn an exact-one-item assertion into a timing race.
      try {
        await page.waitForFunction(([x, y, z]) => {
          if (window.__game.getBlock(x, y, z) !== 0) return false;
          window.__game.holdButton(0, false); // release in the same browser task that observes the break
          return true;
        }, s.target, { timeout: 8000, polling: 50 });
      } finally {
        await page.evaluate(() => window.__game.holdButton(0, false));
      }
      await page.screenshot({ path: 'screenshots/drop.png' }); // the dropped item, before anyone picks it up
      if (!sawStage && !PLANTS.includes(s.targetName)) throw new Error(`no crack stage shown while breaking ${s.targetName}`);
      // The item drops into the hole. Stand in the hole so the item is in pick-up reach, whether or not the player fell
      // in by itself, then poll: a loaded machine can take a while to collect it.
      // The player is wider than the one-block hole, so clear room around it first; then stand where the item landed.
      await page.evaluate(([x, y, z]) => {
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 2; dy++) window.__game.setBlock(x + dx, y + dy, z + dz, 0);
        window.__game.teleport(x + 0.5, y, z + 0.5);
      }, s.target);
      let after = await countOf();
      for (let i = 0; i < 40 && after !== before + 1; i++) {
        await page.waitForTimeout(250);
        after = await countOf();
      }
      if (after !== before + 1) {
        const st = await page.evaluate(() => window.__game.state());
        throw new Error(
          `expected one more ${s.targetName} in the inventory: ${before} -> ${after} (items on the ground ${st.items}, position ${JSON.stringify(st.position)}, target ${JSON.stringify(s.target)})`,
        );
      }
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
        let top = 8600; // above all terrain (the band top is 8,672 blocks)
        while (top > 1 && g.getBlock(x, top, z + 4) === 0) top--;
        g.setBlock(x, top + 1, z + 4, 13); // glowstone on the ground
        g.setTimeOfDay(0.75); // midnight
        g.look(Math.PI, -0.35); // face south (+Z), slightly down
      }, [x, z]);
      await page.waitForTimeout(1500); // the 8 neighbor chunks are relit over a few frames
      // A fully loaded night scene can make screenshot readback slow on SwiftShader; this is not a frame-time guard.
      await page.screenshot({ path: 'screenshots/glowstone.png', timeout: 60_000 });
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
      // stone and the seven strata rocks (specs 15, 20), plus the ores that can host at this depth (spec 26).
      const ROCKS = [1, 14, 15, 16, 17, 22, 23, 24, 28, 29, 30, 31, 32, 33, 34];
      if (!ROCKS.includes(below)) throw new Error(`expected rock 5 blocks below y = -200, found ${below}`);

      await page.evaluate(([x, z]) => window.__game.teleport(x, 8400, z), [x, z]); // above the highest terrain (2,450 m, 8,167 blocks)
      await waitMeshed();
      const placed = await page.evaluate(([x, z]) => window.__game.setBlock(x + 2, 8401, z, 9), [bx, bz]); // glass
      const glass = await page.evaluate(([x, z]) => window.__game.getBlock(x + 2, 8401, z), [bx, bz]);
      if (!placed || glass !== 9) throw new Error(`glass at y = 8401: placed ${placed}, read back ${glass}`);
      await page.screenshot({ path: 'screenshots/high.png' });

      await page.evaluate(([x, y, z, flying]) => {
        window.__game.teleport(x, y, z);
        window.__game.setFlying(flying);
      }, [...start.position, start.flying]);
      await waitMeshed();
    },
  },
  {
    name: 'volume tools add a box, and undo removes it',
    run: async (page) => {
      const waitMeshed = () => page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      const start = await page.evaluate(() => window.__game.state());
      const [x, z] = [Math.floor(start.position[0]), Math.floor(start.position[2])];
      const floorY = 8390; // above the highest terrain, so the test blocks are the only ones here
      await page.evaluate(([x, z, y]) => {
        window.__game.setFlying(true);
        window.__game.teleport(x + 0.5, y + 10, z + 0.5);
      }, [x, z, floorY]);
      await waitMeshed();
      await page.evaluate(([x, z, y]) => {
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) window.__game.setBlock(x + i, y, z + j, 1); // stone floor
        window.__game.selectSlot(8); // brick
        window.__game.setTool({ mode: 'add', kind: 'box', size: 3, thickness: 0 });
        window.__game.look(0, -Math.PI / 2 + 0.01); // straight down at the floor
      }, [x, z, floorY]);
      await page.waitForFunction(() => window.__game.state().target !== null, null, { timeout: 10_000 });
      await page.evaluate(() => window.__game.toolClick(true));
      await page.waitForFunction(() => !window.__game.editsBusy, null, { timeout: 10_000 });
      const countBrick = () =>
        page.evaluate(([x, z, y]) => {
          let n = 0;
          for (let dy = 1; dy <= 3; dy++) for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
            if (window.__game.getBlock(x + i, y + dy, z + j) === 12) n++;
          return n;
        }, [x, z, floorY]);
      const placed = await countBrick();
      if (placed !== 27) {
        const st = await page.evaluate(() => window.__game.state());
        throw new Error(`a 3x3x3 box should place 27 bricks, placed ${placed} (selected ${st.selectedBlock}, position ${st.position}, target ${JSON.stringify(st.target)}, flying ${st.flying}, playing ${st.playing})`);
      }

      if (!(await page.evaluate(() => window.__game.undoEdit()))) throw new Error('undoEdit returned false');
      await page.waitForFunction(() => !window.__game.editsBusy, null, { timeout: 10_000 });
      const left = await countBrick();
      if (left !== 0) throw new Error(`undo should leave no bricks, found ${left}`);

      await page.evaluate(([x, z, y]) => {
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) window.__game.setBlock(x + i, y, z + j, 0);
        window.__game.setTool({ mode: 'single' });
      }, [x, z, floorY]);
      await page.evaluate(([p, flying]) => {
        window.__game.teleport(p[0], p[1], p[2]);
        window.__game.setFlying(flying);
      }, [start.position, start.flying]);
      await waitMeshed();
    },
  },
  {
    name: 'physics: sand falls, water flows, and a broken stack tumbles',
    run: async (page) => {
      const waitMeshed = () => page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      const start = await page.evaluate(() => window.__game.state());
      const [x, z] = [Math.floor(start.position[0]), Math.floor(start.position[2])];
      const y = 8390; // the clean area the volume check uses
      await page.evaluate(([x, z, y]) => {
        window.__game.setFlying(true);
        window.__game.teleport(x + 0.5, y + 10, z + 0.5);
      }, [x, z, y]);
      await waitMeshed();
      // A stone floor, with sand above one cell, water at another, and a stack of two stone blocks on a third.
      await page.evaluate(([x, z, y]) => {
        for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) window.__game.setBlock(x + i, y, z + j, 1);
        window.__game.setBlock(x + 1, y + 5, z + 1, 4); // sand, in the air
        window.__game.setBlock(x - 2, y + 1, z - 2, 5); // a water source on the floor
        window.__game.setBlock(x + 2, y + 1, z - 2, 1); // stack: bottom block
        window.__game.setBlock(x + 2, y + 2, z - 2, 1);
        window.__game.setBlock(x + 2, y + 3, z - 2, 1);
      }, [x, z, y]);
      await page.waitForFunction(([x, z, y]) => window.__game.getBlock(x + 1, y + 1, z + 1) === 4, [x, z, y], { timeout: 20_000 });
      const water = await page.evaluate(([x, z, y]) => window.__game.getBlock(x - 1, y + 1, z - 2), [x, z, y]);
      if (water < 36 || water >= 52) throw new Error(`water beside the source should flow (a flowing water state, 36 to 51), found ${water}`);
      // Break the bottom of the stack: the two blocks above lose their support and tumble.
      await page.evaluate(([x, z, y]) => window.__game.setBlock(x + 2, y + 1, z - 2, 0), [x, z, y]);
      await page.waitForFunction(() => window.__game.state().looseBodies > 0, null, { timeout: 5_000 });
      await page.waitForFunction(() => window.__game.state().looseBodies === 0, null, { timeout: 30_000 });
      await page.evaluate(([x, z, y, p]) => {
        for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) for (let k = 0; k <= 12; k++) window.__game.setBlock(x + i, y + k, z + j, 0);
        window.__game.setTool({ mode: 'single' });
        window.__game.setFlying(false);
        window.__game.teleport(p[0], p[1], p[2]);
      }, [x, z, y, start.position]);
      await waitMeshed();
    },
  },
  {
    name: 'water flows over game ticks, one block at a time, not in one frame',
    run: async (page) => {
      const waitMeshed = () => page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      const start = await page.evaluate(() => window.__game.state());
      const [x, z] = [Math.floor(start.position[0]), Math.floor(start.position[2])];
      const y = 8390; // the clean area the other physics checks use
      await page.evaluate(([x, z, y]) => {
        window.__game.setFlying(true);
        window.__game.teleport(x + 0.5, y + 10, z + 0.5);
      }, [x, z, y]);
      await waitMeshed();
      await page.evaluate(([x, z, y]) => {
        for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) window.__game.setBlock(x + i, y, z + j, 1);
        window.__game.setBlock(x - 2, y + 1, z - 2, 5); // a water source on the floor
        // Check synchronously with placement, before the game can advance any ticks between browser RPCs.
        if (window.__game.getBlock(x - 3, y + 1, z - 2) !== 0 || window.__game.getBlock(x - 4, y + 1, z - 2) !== 0)
          throw new Error('water flowed synchronously when the source was placed');
      }, [x, z, y]);
      const distOne = [x - 3, y + 1, z - 2];
      const distTwo = [x - 4, y + 1, z - 2];
      // Browser RPC/polling latency can span multiple game ticks: do not assert a transient empty second cell
      // after observing the first. tests/flow.test.ts checks the exact delay for BOTH cells tick by tick.
      await page.waitForFunction((c) => window.__game.getBlock(...c) >= 36 && window.__game.getBlock(...c) < 52, distOne, { timeout: 5_000 });
      await page.waitForFunction((c) => window.__game.getBlock(...c) >= 36 && window.__game.getBlock(...c) < 52, distTwo, { timeout: 5_000 });
      await page.evaluate(([x, z, y, p]) => {
        for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) for (let k = 0; k <= 12; k++) window.__game.setBlock(x + i, y + k, z + j, 0);
        window.__game.setFlying(false);
        window.__game.teleport(p[0], p[1], p[2]);
      }, [x, z, y, start.position]);
      await waitMeshed();
    },
  },
  {
    name: 'the build tool panel shows every setting, in single-block mode as well',
    run: async (page) => {
      const panel = () => page.evaluate(() => document.querySelector('.tool-panel')?.textContent ?? '');
      await page.evaluate(() => window.__game.setTool({ mode: 'single' }));
      await page
        .waitForFunction(() => document.querySelector('.tool-panel')?.textContent?.includes('Single block'), null, { timeout: 5_000 })
        .catch(async () => {
          throw new Error(`the build tool panel never showed single block mode: ${await panel()}`);
        });
      const single = await panel();
      for (const label of ['Mode', 'Shape', 'Size', 'Thickness', 'Outline', 'Frame', 'Preview', 'Block', 'Undo']) {
        if (!single.includes(label)) throw new Error(`the build tool panel is missing the ${label} row: ${single}`);
      }
      await page.evaluate(() => window.__game.setTool({ mode: 'add', kind: 'sphere', size: 6, thickness: 1 }));
      await page.waitForFunction(() => document.querySelector('.tool-panel')?.textContent?.includes('shell 0.3 m'), null, { timeout: 5_000 });
      const sphere = await panel();
      if (!sphere.includes('shell 0.3 m') || !sphere.includes('Add')) throw new Error(`the panel should show add, sphere and shell: ${sphere}`);
      await page.evaluate(() => window.__game.setTool({ mode: 'single', kind: 'box', size: 3, thickness: 0 }));
    },
  },
  {
    name: 'the Blocks tab puts any block into the selected hotbar slot',
    run: async (page) => {
      await page.keyboard.press('KeyE'); // open the inventory from play
      await page.waitForFunction(() => window.__game.state().inventoryOpen, null, { timeout: 5_000 });
      await page.getByRole('tab', { name: 'Blocks (creative)' }).click();
      await page.click('.block-picker button[aria-label^="basalt,"]');
      const selected = await page.evaluate(() => window.__game.state().selectedBlock);
      if (selected !== 'Basalt') throw new Error(`picking basalt should select it in the hotbar, got ${selected}`);
      await page.click('.block-picker button[aria-label^="cactus,"]');
      const cactus = await page.evaluate(() => window.__game.state().selectedBlock);
      if (cactus !== 'Cactus') throw new Error(`picking cactus should select it, got ${cactus}`);
      const cactusIcon = page.locator('.block-picker button[aria-label^="cactus,"] img');
      if (!(await cactusIcon.evaluate((img) => img.complete && img.naturalWidth > 0))) throw new Error('cactus icon did not render');
      await page.click('.block-picker button[aria-label^="clay,"]');
      if ((await page.evaluate(() => window.__game.state().selectedBlock)) !== 'Clay') throw new Error('clay picker did not select clay');
      if (!(await page.locator('.block-picker button[aria-label^="clay,"] img').evaluate((img) => img.complete && img.naturalWidth > 0))) throw new Error('clay icon did not render');
      await page.keyboard.press('KeyE'); // close
      await page.waitForFunction(() => !window.__game.state().inventoryOpen, null, { timeout: 5_000 });
    },
  },
  {
    name: 'the pause menu opens the inventory from its button, and Escape goes back to the pause menu',
    run: async (page) => {
      const pausePage = await page.context().browser().newPage({ viewport: { width: 1280, height: 720 } });
      watchPage(pausePage);
      await configureAuxiliaryPage(pausePage);
      await pausePage.goto(new URL('/?seed=1&nosave=1', page.url()).href);
      await pausePage.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
      await pausePage.getByRole('button', { name: 'Play', exact: true }).click(); // The mode picker also has a primary-styled control.
      await pausePage.waitForFunction(() => window.__game.state().playing, null, { timeout: 10_000, polling: 100 })
        .catch(async () => { throw new Error(`Play did not capture the mouse: ${await pausePage.locator('.menu-overlay').innerText()}`); });
      await pausePage.evaluate(() => document.exitPointerLock());
      await pausePage.waitForFunction(() => !window.__game.state().playing, null, { timeout: 10_000, polling: 100 })
        .catch(() => { throw new Error('releasing pointer lock did not pause play'); });
      const title = await pausePage.locator('.menu-title').innerText();
      if (title !== 'Paused') throw new Error(`expected the pause menu, got "${title}"`);
      await pausePage.locator('.menu-button', { hasText: 'Inventory' }).click();
      await pausePage.waitForFunction(() => window.__game.state().inventoryOpen, null, { timeout: 10_000, polling: 100 })
        .catch(() => { throw new Error('pause-menu Inventory button did not open inventory'); });
      if (await pausePage.locator('.menu-overlay').isVisible()) throw new Error('the pause menu should be hidden with the inventory open');
      await pausePage.keyboard.press('Escape');
      await pausePage.waitForFunction(() => !window.__game.state().inventoryOpen, null, { timeout: 10_000, polling: 100 })
        .catch(() => { throw new Error('Escape did not close pause-menu inventory'); });
      if (!(await pausePage.locator('.menu-overlay').isVisible())) throw new Error('Escape should return to the pause menu');
      // Only the HUD button, not the whole HUD, must sit above the pause overlay.
      await pausePage.locator('.hud-inventory').click();
      await pausePage.waitForFunction(() => window.__game.state().inventoryOpen, null, { timeout: 5_000 });
      await pausePage.keyboard.press('Escape');
      await pausePage.waitForFunction(() => !window.__game.state().inventoryOpen, null, { timeout: 5_000 });
      if ((await pausePage.locator('.menu-title').innerText()) !== 'Paused') throw new Error('HUD inventory must return to the pause menu');
      if (await pausePage.evaluate(() => document.pointerLockElement !== null)) throw new Error('HUD inventory should leave the pause-menu pointer free');
      await pausePage.close();
      await page.bringToFront();
    },
  },
  {
    name: 'HUD Inventory button works without pointer capture and with Tab, Enter and Space',
    run: async (page) => {
      const hudPage = await page.context().browser().newPage({ viewport: { width: 1280, height: 720 } });
      watchPage(hudPage);
      await configureAuxiliaryPage(hudPage);
      await hudPage.goto(new URL('/?seed=1&nosave=1', page.url()).href);
      await hudPage.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
      const button = hudPage.getByRole('button', { name: 'Inventory', exact: true });
      let phase = 'initial HUD click';
      const waitState = async (open) => {
        try {
          await hudPage.waitForFunction((open) => window.__game.state().inventoryOpen === open, open, { timeout: 5_000 });
        } catch (error) {
          const snapshot = await hudPage.evaluate(() => ({
            open: window.__game.state().inventoryOpen,
            focused: document.activeElement?.outerHTML,
            hasFocus: document.hasFocus(),
            visibility: document.visibilityState,
            buttonDisabled: document.querySelector('.hud-inventory')?.disabled,
          }));
          throw new Error(`HUD inventory ${phase}: expected open=${open}; ${JSON.stringify(snapshot)}; ${error}`);
        }
      };
      const waitOpen = () => waitState(true);
      const waitClosed = () => waitState(false);
      if (await hudPage.evaluate(() => document.pointerLockElement !== null)) throw new Error('test requires a free pointer');
      await button.click(); // A real hit-test: must work above the start-menu overlay.
      await waitOpen();
      if (await hudPage.locator('.menu-overlay').isVisible()) throw new Error('inventory must hide the start menu');
      await hudPage.waitForFunction(() => document.querySelector('.hud-inventory')?.disabled, null, { timeout: 5_000 });
      phase = 'E returns to the start menu';
      await hudPage.keyboard.press('KeyE');
      await waitClosed();
      if ((await hudPage.locator('.menu-title').innerText()) !== 'Voxel Game') throw new Error('E must return to the originating start menu');

      await button.focus();
      await hudPage.keyboard.press('Tab');
      await hudPage.keyboard.press('Shift+Tab');
      if (!(await button.evaluate((el) => el === document.activeElement && el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none')))
        throw new Error('HUD Inventory button must be keyboard reachable with a visible focus ring');
      await hudPage.screenshot({ path: 'screenshots/hud-inventory.png' });
      phase = 'Enter activation after the focus screenshot';
      await hudPage.keyboard.press('Enter');
      await waitOpen();
      phase = 'Escape closes keyboard inventory';
      await hudPage.keyboard.press('Escape');
      await waitClosed();
      await button.focus();
      phase = 'Space activation';
      await hudPage.keyboard.press('Space');
      await waitOpen();
      phase = 'Close button returns to the start menu';
      await hudPage.getByRole('button', { name: 'Close (E)', exact: true }).click();
      await waitClosed();
      if ((await hudPage.locator('.menu-title').innerText()) !== 'Voxel Game') throw new Error('Close must restore the start menu');
      if (await hudPage.evaluate(() => document.pointerLockElement !== null || window.__game.state().playing))
        throw new Error('inventory access from a menu must not capture the pointer or start play');
      await hudPage.close();
      await page.bringToFront();
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
/** The name of the check (or phase) currently running, so a failure says where it happened (task T-A2a). */
let running = 'startup (goto and ready)';
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  watchPage(page);

  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}${URL_PATH}`);
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
  console.log(`ready ${Date.now() - t0} ms after opening the page`);
  await page.waitForTimeout(1000);
  console.log('state:', JSON.stringify(await page.evaluate(() => window.__game.state())));
  await page.screenshot({ path: 'screenshots/smoke.png' });
  console.log('saved screenshots/smoke.png');

  // SMOKE_ONLY=text runs only the checks whose name contains the text (for debugging one check).
  const only = process.env.SMOKE_ONLY;
  for (const check of CHECKS.filter((c) => !only || c.name.includes(only))) {
    running = check.name;
    await check.run(page);
    console.log(`check passed: ${check.name}`);
  }

  // Measurement only (not a check): time until nothing is left to load or mesh, then the steady frame rate.
  running = 'final measurement';
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
  errors.push(`smoke failure during "${running}": ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}

if (errors.length > 0) {
  console.error(`SMOKE TEST FAILED\n${errors.join('\n')}`);
  // GitHub Actions annotations (task T-A2a): raw CI logs are not always retrievable, so failures are also published
  // as run annotations, readable from the check-runs API and the run page. Escaping per the workflow-commands spec.
  if (process.env.GITHUB_ACTIONS) {
    const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    for (const e of errors) console.log(`::error title=smoke::${esc(e)}`);
  }
  process.exit(1);
}
console.log('SMOKE TEST PASSED');
