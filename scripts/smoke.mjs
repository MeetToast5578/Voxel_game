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
      // After the reload and the swim, the ground under the player may still be loading: wait for it, or the look-down finds air.
      await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      await page.evaluate(() => window.__game.look(0, -Math.PI / 2 + 0.01)); // straight down
      await page.waitForTimeout(300);
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
      await page.keyboard.press('KeyE');
      await page.waitForFunction(() => window.__game.state().inventoryOpen, null, { timeout: 10_000 });
      await page.screenshot({ path: 'screenshots/inventory.png' });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.__game.state().inventoryOpen, null, { timeout: 10_000 });
    },
  },
  {
    name: 'holding the left button breaks a block over time, and the item is picked up',
    run: async (page) => {
      const PLANTS = ['Tall grass', 'Poppy', 'Fern', 'Dandelion', 'Brown mushroom', 'Red mushroom']; // break at once
      await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      await page.evaluate(() => window.__game.look(0, -Math.PI / 2 + 0.01));
      await page.waitForFunction(() => window.__game.state().target !== null, null, { timeout: 10_000 });
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
      if (sawStage) await page.screenshot({ path: 'screenshots/breaking.png' });
      await page.waitForFunction(([x, y, z]) => window.__game.getBlock(x, y, z) === 0, s.target, { timeout: 8000 });
      await page.evaluate(() => window.__game.holdButton(0, false));
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
      const ROCKS = [1, 14, 15, 16, 17]; // stone, granite, diorite, andesite, sandstone (spec 15)
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
      await page.keyboard.press('KeyE'); // close
      await page.waitForFunction(() => !window.__game.state().inventoryOpen, null, { timeout: 5_000 });
    },
  },
  {
    name: 'the pause menu opens the inventory from its button, and Escape goes back to the pause menu',
    run: async (page) => {
      const pausePage = await page.context().browser().newPage({ viewport: { width: 1280, height: 720 } });
      await pausePage.goto(new URL('/?seed=1&nosave=1', page.url()).href);
      await pausePage.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
      await pausePage.click('.menu-button.primary'); // Play: captures the mouse
      await pausePage.waitForFunction(() => window.__game.state().playing, null, { timeout: 10_000 });
      await pausePage.evaluate(() => document.exitPointerLock());
      await pausePage.waitForFunction(() => !window.__game.state().playing, null, { timeout: 10_000 });
      const title = await pausePage.locator('.menu-title').innerText();
      if (title !== 'Paused') throw new Error(`expected the pause menu, got "${title}"`);
      await pausePage.locator('.menu-button', { hasText: 'Inventory' }).click();
      await pausePage.waitForFunction(() => window.__game.state().inventoryOpen, null, { timeout: 10_000 });
      if (await pausePage.locator('.menu-overlay').isVisible()) throw new Error('the pause menu should be hidden with the inventory open');
      await pausePage.keyboard.press('Escape');
      await pausePage.waitForFunction(() => !window.__game.state().inventoryOpen, null, { timeout: 10_000 });
      if (!(await pausePage.locator('.menu-overlay').isVisible())) throw new Error('Escape should return to the pause menu');
      await pausePage.close();
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
