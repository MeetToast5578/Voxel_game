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


/**
 * Runs an auxiliary page against the primary game's URL while the primary game is idle. Software WebGL and chunk
 * streaming on the primary page compete with the new page for the CPU, which has timed out a plain `page.goto`
 * on a loaded CI runner. Idling pauses only simulation and rendering -- the primary game keeps its state and
 * resumes in the finally block, and the auxiliary page must still reach `ready` on its own.
 */
async function withAuxiliaryPage(page, run) {
  await page.evaluate(() => window.__game.setIdle(true));
  let auxiliary = null;
  try {
    auxiliary = await page.context().browser().newPage({ viewport: { width: 1280, height: 720 } });
    watchPage(auxiliary);
    await configureAuxiliaryPage(auxiliary);
    // DOMContentLoaded is enough: module scripts have run by then, and the ready wait below is the real gate.
    await auxiliary.goto(new URL('/?seed=1&nosave=1', page.url()).href, { waitUntil: 'domcontentloaded' });
    await auxiliary.waitForFunction(() => window.__game?.ready === true, null, { timeout: 60_000 });
    return await run(auxiliary);
  } finally {
    if (auxiliary) await auxiliary.close().catch(() => {});
    await page.evaluate(() => window.__game.setIdle(false)).catch(() => {});
    await page.bringToFront(); // Closing a separate browser context does not reliably reactivate the game page.
  }
}

/**
 * Runs a self-contained check (one that opens its own pages) with the primary game idled, for the same reason as
 * withAuxiliaryPage: two software-rendered worlds on one runner starve each other. The primary keeps its state.
 */
async function withPrimaryIdle(page, run) {
  await page.evaluate(() => window.__game.setIdle(true));
  try {
    return await run();
  } finally {
    await page.evaluate(() => window.__game.setIdle(false)).catch(() => {});
    await page.bringToFront();
  }
}

/** Waits for a page condition and names the step in the error, so a timeout in a long check is identifiable. */
async function waitForCondition(page, label, fn, timeout = 60_000) {
  try {
    await page.waitForFunction(fn, null, { timeout });
  } catch {
    throw new Error(`${label}: condition not met within ${timeout} ms`);
  }
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
      // Wait for the landing, not a fixed time: on a loaded runner long frames are clamped (MAX_FRAME_DT), so game time lags wall time.
      await page
        .waitForFunction((y) => {
          const s = window.__game.state();
          return s.onGround && Math.abs(s.position[1] - y) <= 0.05;
        }, before.position[1], { timeout: 20_000, polling: 100 })
        .catch(async () => { throw new Error(`did not land: ${JSON.stringify(await page.evaluate(() => window.__game.state()))}`); });
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
      const s = await page.evaluate(() => window.__game.state());
      if (s.selectedBlock !== 'Brick') throw new Error(`expected Brick selected, got ${s.selectedBlock}`);
      // Which cell a downward look finds depends on the vegetation growing at this seed's spawn, and the
      // frame rate decides how fresh the target is. Try a few nearby aim points before calling it a failure.
      let before = null;
      let placed = false;
      for (const [yaw, pitch] of [[0, -0.6], [0, -0.9], [0, -1.2], [0.25, -0.7], [-0.25, -0.7], [0, -0.3]]) {
        await page.evaluate(([y, p]) => window.__game.look(y, p), [yaw, pitch]);
        await page.waitForTimeout(300);
        const now = await page.evaluate(() => window.__game.state());
        if (!now.target) continue;
        before = now.inventory[8]?.[1] ?? null;
        if (await page.evaluate(() => window.__game.placeTarget())) { placed = true; break; }
      }
      if (!placed) {
        const now = await page.evaluate(() => window.__game.state());
        throw new Error(`placeTarget returned false everywhere: ${JSON.stringify(now)}`);
      }
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
      await withAuxiliaryPage(page, async (menuPage) => {
        if (!(await menuPage.locator('.menu-overlay').isVisible())) throw new Error('menu not visible');
        const title = await menuPage.locator('.menu-title').innerText();
        if (title !== 'Voxel Game') throw new Error(`menu title: ${title}`);
        const inventoryButtons = await menuPage.locator('.menu-button', { hasText: 'Inventory' }).count();
        if (inventoryButtons !== 0) throw new Error('the start menu should not have an inventory button');
        const sections = await menuPage.locator('.controls-title').allInnerTexts();
        if (!sections.includes('Volume tools')) throw new Error(`controls sections: ${sections}`);
        await menuPage.screenshot({ path: 'screenshots/menu.png' });
      });
    },
  },
  {
    name: 'saves the world and restores it after a reload',
    run: async (page) => {
      // A fresh browser context has no world save. No ?seed / ?nosave, so saving is on.
      return withPrimaryIdle(page, async () => {
        const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 720 } });
        const p = await context.newPage();
        watchPage(p);
        await configureAuxiliaryPage(p);
        const url = new URL('/?autostart=1', page.url()).href;
        await p.goto(url);
        await waitForCondition(p, 'saved world ready', () => window.__game?.ready === true);
        const before = await p.evaluate(() => window.__game.state());
        const [x, y, z] = before.position.map(Math.floor);
        await p.evaluate(([x, y, z]) => window.__game.setBlock(x + 2, y + 3, z, 12), [x, y, z]); // a floating brick
        // Bricks 40 blocks below and above the player: teleport there first so their chunks are loaded.
        const waitMeshed = (label) => waitForCondition(p, label, () => window.__game.state().areaMeshed, 90_000);
        for (const dy of [-40, 40]) {
          await p.evaluate(([x, y, z]) => {
            window.__game.setFlying(true);
            window.__game.teleport(x + 0.5, y, z + 0.5);
          }, [x, y + dy, z]);
          await waitMeshed(`area meshed at y ${y + dy}`);
          const placed = await p.evaluate(([x, y, z]) => window.__game.setBlock(x + 2, y, z, 12), [x, y + dy, z]);
          if (!placed) throw new Error(`could not place a brick at y ${y + dy}`);
        }
        await p.evaluate(([px, py, pz, flying]) => {
          window.__game.teleport(px, py, pz);
          window.__game.setFlying(flying);
        }, [...before.position, before.flying]);
        await waitMeshed('area meshed at the original position');
        await p.evaluate(([x,y,z])=>window.__game.setBlock(x+3,y+3,z,window.__game.blockState('stone_slab#1')),[x,y,z]);
        const saved = await p.evaluate(() => {
          window.__game.selectSlot(4);
          window.__game.setHotbarSlot(0, 13); // glowstone
          window.__game.setTimeOfDay(0.6);
          return window.__game.save();
        });
        if (!saved) throw new Error('save() resolved to false');
        await p.reload();
        await waitForCondition(p, 'world ready after reload', () => window.__game?.ready === true);
        const after = await p.evaluate(() => window.__game.state());
        const savedSlab = await p.evaluate(([x,y,z])=>window.__game.getBlock(x+3,y+3,z)===window.__game.blockState('stone_slab#1'),[x,y,z]);
        if(!savedSlab)throw Error('top slab did not survive IndexedDB reload');
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
      });
    },
  },
  {
    name: 'pending falling-block ticks survive a saved-world reload',
    run: async page => withPrimaryIdle(page, async () => {
      const context=await page.context().browser().newContext({viewport:{width:1280,height:720}});
      try {
        const p=await context.newPage(); watchPage(p); await configureAuxiliaryPage(p);
        await p.goto(new URL('/?autostart=1',page.url()).href);
        await waitForCondition(p,'tick persistence world ready',()=>window.__game?.ready===true);
        await p.evaluate(()=>{window.__game.setFlying(true);window.__game.teleport(8.5,8394,8.5);});
        await waitForCondition(p,'tick persistence fixture meshed',()=>window.__game.state().areaMeshed,90000);
        await p.evaluate(async()=>{
          const g=window.__game;g.setIdle(true);
          for(let x=4;x<=12;x++)for(let z=4;z<=12;z++)g.setBlock(x,8390,z,10);
          if(!g.setBlock(10,8396,10,4))throw Error('sand fixture was not loaded');
          if(!await g.save())throw Error('pending tick save failed');
        });
        const pending=await p.evaluate(()=>new Promise((resolve,reject)=>{
          const open=indexedDB.open('voxel-game');open.onerror=()=>reject(Error('cannot read saved ticks'));
          open.onsuccess=()=>{const db=open.result,tx=db.transaction('meta','readonly'),read=tx.objectStore('meta').get('meta');
            read.onsuccess=()=>resolve(read.result.scheduledTicks);tx.oncomplete=()=>db.close();};
        }));
        if(!pending.some(t=>t.x===10&&t.y===8396&&t.z===10&&t.reason==='fall'&&t.delay===2))
          throw Error('save omitted the sand tick or its remaining two-tick delay');
        await p.reload();await waitForCondition(p,'tick persistence reloaded',()=>window.__game?.ready===true);
        await waitForCondition(p,'restored sand lands',()=>window.__game.getBlock(10,8391,10)===4,30000);
        if(await p.evaluate(()=>window.__game.getBlock(10,8396,10))!==0)throw Error('restored sand duplicated');
      } finally {await context.close();await page.bringToFront();}
    }),
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
      const waitMeshed = () => page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      // Mine a freshly placed grass block on the clean platform instead of whatever the earlier checks left at spawn:
      // the block under the player there can already be air or a different material, which made this check depend on
      // history. The mechanics it tests (stages over 0.5 s, then the drop) are unchanged.
      const spawn = await page.evaluate(() => window.__game.state());
      const [px, pz] = [Math.floor(spawn.position[0]), Math.floor(spawn.position[2])];
      const py = 8390; // the same clean platform the physics checks use
      await page.evaluate(([x, z, y]) => {
        window.__game.setFlying(true);
        window.__game.teleport(x + 0.5, y + 10, z + 0.5);
      }, [px, pz, py]);
      await waitMeshed();
      await page.evaluate(([x, z, y]) => {
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = 0; k <= 4; k++) window.__game.setBlock(x + i, y + k, z + j, 0);
        // An isolated stone support collapses as soon as the grass is mined. Bedrock anchors this
        // fixture, and a wide floor catches the dropped item and supports the player's full body.
        for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) window.__game.setBlock(x + i, y, z + j, 10);
        window.__game.setBlock(x, y + 1, z, 3); // the grass block to mine
        window.__game.setFlying(false);
        window.__game.teleport(x + 0.5, y + 2, z + 0.5);
      }, [px, pz, py]);
      await waitMeshed();
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
      // The render loop records whether any crack stage was shown, so a stage shorter than one poll cannot be missed
      // (at software-rendering frame rates a 0.5 s block goes from stage 0 to broken between two round trips).
      await page.evaluate(() => window.__game.resetBreakStage());
      await page.evaluate(() => window.__game.holdButton(0, true));
      let sawStage = false;
      for (let i = 0; i < 20 && !sawStage; i++) {
        await page.waitForTimeout(50);
        sawStage = await page.evaluate(() => {
          const s = window.__game.state();
          return s.breakStageSeen || s.breakStage >= 0;
        });
      }
      // Do not leave mining held while screenshot readback runs: on slow software rendering it can mine several
      // more blocks, drop the item into a deeper shaft and turn an exact-one-item assertion into a timing race.
      try {
        await page.waitForFunction(([x, y, z]) => {
          if (window.__game.getBlock(x, y, z) !== 0) return false;
          window.__game.holdButton(0, false); // release in the same browser task that observes the break
          return true;
        }, s.target, { timeout: 8000, polling: 50 });
      } catch (error) {
        const now = await page.evaluate(([x, y, z]) => {
          const state = window.__game.state();
          return {
            block: window.__game.getBlock(x, y, z),
            breakStage: state.breakStage,
            breakStageSeen: state.breakStageSeen,
            target: state.target,
            targetName: state.targetName,
            playing: state.playing,
            inventoryOpen: state.inventoryOpen,
            fps: state.fps,
            pendingGen: state.pendingGen,
            pendingMesh: state.pendingMesh,
          };
        }, s.target);
        throw new Error(`the held block did not break in 8 s: ${JSON.stringify(now)}; ${error}`);
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
      await page.evaluate(([x, y, z, flying]) => {
        window.__game.setFlying(flying);
        window.__game.teleport(x, y, z);
      }, [...spawn.position, spawn.flying]);
      await waitMeshed();
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
      // Negative-y caves may now contain air or groundwater (spec 46). Check a neighbourhood,
      // retaining the rock assertion without requiring one arbitrary cell to miss every cave.
      const below = await page.evaluate(([x, z]) => {
        const ids = [];
        for (let dy = -5; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
          ids.push(window.__game.getBlock(x + dx, -200 + dy, z + dz));
        return ids;
      }, [bx, bz]);
      const ROCKS = [1, 14, 15, 16, 17, 22, 23, 24, 28, 29, 30, 31, 32, 33, 34];
      if (!below.some(id => ROCKS.includes(id)) || below.some(id => !ROCKS.includes(id) && id !== 0 && id !== 5))
        throw new Error(`expected deep rock with optional cave air/water, found states ${[...new Set(below)]}`);

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
    name: 'underground aquifers contain both dry caves and groundwater',
    run: async (page) => {
      const start = await page.evaluate(() => window.__game.state());
      // Seed-1 generated cave fixtures, independently checked by the pure generator tests.
      // These exercise the actual worker pipeline and public block reads; no terrain is edited.
      try {
        for (const [x, y, z, expected] of [[-16, -80, -16, 0], [8, -144, 15, 5]]) {
          await page.evaluate(([x, y, z]) => {
            window.__game.setFlying(true);
            window.__game.teleport(x + 0.5, y, z + 0.5);
          }, [x, y, z]);
          await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
          const actual = await page.evaluate(([x, y, z]) => window.__game.getBlock(x, y, z), [x, y, z]);
          if (actual !== expected) throw new Error(`aquifer at ${x},${y},${z}: expected ${expected}, got ${actual}`);
        }
      } finally {
        await page.evaluate(([x, y, z, flying]) => {
          window.__game.teleport(x, y, z);
          window.__game.setFlying(flying);
        }, [...start.position, start.flying]);
        await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      }
    },
  },
  {
    name: 'underground lakes and lava pools have fluid surfaces and solid floors',
    run: async (page) => {
      const start = await page.evaluate(() => window.__game.state());
      try {
        // Real seed-1 jittered basins, also validated through TerrainGenerator in Node.
        for (const [x, y, z, liquid, shell] of [[316, -107, 218, 5, 1], [156, -507, 129, 54, 24]]) {
          await page.evaluate(([x, y, z]) => {
            window.__game.setFlying(true);
            window.__game.teleport(x + 0.5, y + 2, z + 0.5);
            window.__game.look(0, -0.8);
          }, [x, y, z]);
          await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
          const cells = await page.evaluate(([x, y, z]) => [
            window.__game.getBlock(x, y, z), window.__game.getBlock(x, y + 1, z), window.__game.getBlock(x, y - 10, z),
          ], [x, y, z]);
          if (cells[0] !== liquid || cells[1] !== 0 || cells[2] !== shell)
            throw new Error(`pool at ${x},${y},${z}: expected ${liquid},0,${shell}, got ${cells}`);
          if (liquid === 54) await page.screenshot({ path: 'screenshots/lava-pool.png' });
        }
      } finally {
        await page.evaluate(([x, y, z, flying, yaw, pitch]) => {
          window.__game.teleport(x, y, z); window.__game.setFlying(flying); window.__game.look(yaw, pitch);
        }, [...start.position, start.flying, start.yaw, start.pitch]);
        await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      }
    },
  },
  {
    name: 'slabs place, merge and support the player at half height',
    run: async page => {
      const start = await page.evaluate(() => window.__game.state());
      const [x,z] = [Math.floor(start.position[0]),Math.floor(start.position[2])], y=8350;
      try {
        await page.evaluate(([x,y,z])=>{const g=window.__game;g.setFlying(true);g.teleport(x+.5,y+8,z+.5);g.look(0,-Math.PI/2+.001);},[x,y,z]);
        await page.waitForFunction(()=>window.__game.state().areaMeshed,null,{timeout:90000});
        await page.evaluate(([x,y,z])=>{
          const g=window.__game;for(let dx=-8;dx<=8;dx++)for(let dz=-8;dz<=8;dz++){
            g.setBlock(x+dx,y,z+dz,10);for(let k=1;k<=14;k++)g.setBlock(x+dx,y+k,z+dz,0);
          }
          g.setHotbarSlot(0,g.blockState('stone_slab'));g.selectSlot(0);g.setTool({mode:'single'});
        },[x,y,z]);
        await page.waitForFunction(y=>window.__game.state().target?.[1]===y,y,{timeout:10000});
        if(!await page.evaluate(()=>window.__game.placeTarget()))throw Error('bottom slab placement refused');
        const bottom=await page.evaluate(()=>window.__game.blockState('stone_slab'));
        if(await page.evaluate(([x,y,z])=>window.__game.getBlock(x,y+1,z),[x,y,z])!==bottom)throw Error('bottom slab missing');
        await page.evaluate(([x,y,z])=>{const g=window.__game;g.teleport(x+.5,y+6,z+.5);g.setFlying(false);},[x,y,z]);
        await page.waitForFunction(y=>{const s=window.__game.state();return s.onGround&&Math.abs(s.position[1]-(y+1.5))<.01;},y,{timeout:15000});
        await page.evaluate(([x,y,z])=>{const g=window.__game;g.setFlying(true);g.teleport(x+.5,y+8,z+.5);},[x,y,z]);
        await page.waitForFunction(y=>window.__game.state().target?.[1]===y+1,y,{timeout:10000});
        if(!await page.evaluate(()=>window.__game.placeTarget()))throw Error('matching slab merge refused');
        if(await page.evaluate(([x,y,z])=>window.__game.getBlock(x,y+1,z),[x,y,z])!==1)throw Error('halves did not merge to stone');
        await page.evaluate(([x,y,z])=>{
          const g=window.__game;g.setBlock(x+4,y+12,z,10);g.teleport(x+4.5,y+3,z+.5);g.look(0,Math.PI/2-.001);
        },[x,y,z]);
        await page.waitForFunction(y=>window.__game.state().target?.[1]===y+12,y,{timeout:10000});
        if(!await page.evaluate(()=>window.__game.placeTarget()))throw Error('ceiling slab placement refused');
        const upper=await page.evaluate(()=>window.__game.blockState('stone_slab#1'));
        if(await page.evaluate(([x,y,z])=>window.__game.getBlock(x+4,y+11,z),[x,y,z])!==upper)throw Error('ceiling placement was not a top slab');
        await page.screenshot({path:'screenshots/building-slabs.png'});
      } finally {
        await page.evaluate(([x,y,z,start])=>{
          const g=window.__game;for(let dx=-8;dx<=8;dx++)for(let dz=-8;dz<=8;dz++)for(let k=0;k<=14;k++)g.setBlock(x+dx,y+k,z+dz,0);
          g.setHotbarSlot(0,start.hotbar[0]);g.selectSlot(start.selectedSlot);g.teleport(...start.position);g.setFlying(start.flying);g.look(start.yaw,start.pitch);
        },[x,y,z,start]);
        await page.waitForFunction(()=>window.__game.state().areaMeshed,null,{timeout:90000});
      }
    },
  },
  {
    name: 'copy and paste preserves slab states, existing blocks and undo',
    run: async page => {
      const start=await page.evaluate(()=>window.__game.state());
      const x=Math.floor(start.position[0]),z=Math.floor(start.position[2]),y=8310;
      const aim=async dx=>{
        await page.evaluate(([x,y,z,dx])=>{const g=window.__game;g.setFlying(true);g.teleport(x+dx+.5,y+8,z+.5);g.look(0,-Math.PI/2+.001);},[x,y,z,dx]);
      };
      try {
        await aim(0);await page.waitForFunction(()=>window.__game.state().areaMeshed,null,{timeout:90000});
        await page.evaluate(([x,y,z])=>{const g=window.__game;
          for(let dx=-8;dx<=8;dx++)for(let dz=-8;dz<=8;dz++){g.setBlock(x+dx,y,z+dz,10);for(let k=1;k<=4;k++)g.setBlock(x+dx,y+k,z+dz,0);}
          g.setBlock(x,y+1,z,1);g.setBlock(x+1,y+1,z,g.blockState('stone_slab#1'));g.setBlock(x+2,y+1,z,12);g.setBlock(x+6,y+1,z,2);
        },[x,y,z]);
        await page.waitForFunction(([x,y])=>{const t=window.__game.state().target;return t?.[0]===x&&t?.[1]===y+1;},[x,y]);
        await page.keyboard.press('Control+c');await page.getByText(/First corner set;/).waitFor();
        await aim(2);await page.waitForFunction(([x,y])=>{const t=window.__game.state().target;return t?.[0]===x+2&&t?.[1]===y+1;},[x,y]);
        await page.keyboard.press('Control+c');await page.getByText(/3 blocks copied/).waitFor();
        await page.evaluate(([x,y,z])=>window.__game.setBlock(x+1,y+1,z,0),[x,y,z]);
        await aim(4);await page.waitForFunction(([x,y])=>{const t=window.__game.state().target;return t?.[0]===x+4&&t?.[1]===y;},[x,y]);
        await page.keyboard.press('Control+v');
        await page.waitForFunction(([x,y,z])=>window.__game.getBlock(x+5,y+1,z)===window.__game.blockState('stone_slab#1'),[x,y,z]);
        const blocks=await page.evaluate(([x,y,z])=>[4,6].map(dx=>window.__game.getBlock(x+dx,y+1,z)),[x,y,z]);
        if(blocks[0]!==1||blocks[1]!==2)throw Error(`paste overwrote existing structure or lost snapshot: ${blocks}`);
        await page.screenshot({path:'screenshots/building-copy-paste.png'});
        if(!await page.evaluate(()=>window.__game.undoEdit()))throw Error('paste undo refused');
        await page.waitForFunction(()=>!window.__game.editsBusy);
        if(await page.evaluate(([x,y,z])=>window.__game.getBlock(x+5,y+1,z),[x,y,z])!==0)throw Error('undo left a pasted slab');
      } finally {
        await page.evaluate(([x,y,z,start])=>{const g=window.__game;
          for(let dx=-8;dx<=8;dx++)for(let dz=-8;dz<=8;dz++)for(let k=0;k<=4;k++)g.setBlock(x+dx,y+k,z+dz,0);
          g.teleport(...start.position);g.setFlying(start.flying);g.look(start.yaw,start.pitch);
        },[x,y,z,start]);
        await page.waitForFunction(()=>window.__game.state().areaMeshed,null,{timeout:90000});
      }
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
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
          for (let k = 1; k <= 6; k++) window.__game.setBlock(x + i, y + k, z + j, 0);
          window.__game.setBlock(x + i, y, z + j, 10); // anchored floor
        }
        window.__game.setHotbarSlot(8, 12); // explicit brick stack; pick-block may have replaced it
        window.__game.selectSlot(8);
        window.__game.setTool({ mode: 'add', kind: 'box', size: 3, thickness: 0 });
        window.__game.look(0, -Math.PI / 2 + 0.01); // straight down at the floor
      }, [x, z, floorY]);
      await page.waitForFunction(([x, y, z]) => {
        const target = window.__game.state().target;
        return target && target[0] === x && target[1] === y && target[2] === z;
      }, [x, floorY, z], { timeout: 10_000 });
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

      await page.keyboard.press('Control+y');
      await page.waitForFunction(([x,z,y])=>window.__game.getBlock(x,y+1,z)===12,[x,z,floorY],{timeout:10000});
      await page.waitForFunction(() => !window.__game.editsBusy, null, { timeout: 10000 });
      if (await countBrick() !== 27) throw Error('redo did not restore all 27 bricks');
      if (!(await page.evaluate(() => window.__game.undoEdit()))) throw Error('second undo returned false');
      await page.waitForFunction(() => !window.__game.editsBusy, null, { timeout: 10000 });
      if (await countBrick() !== 0) throw Error('second undo did not clear the redone box');

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
      // An anchored floor wider than the full fluid spread, with sand, water and a breakable stack.
      await page.evaluate(([x, z, y]) => {
        for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) window.__game.setBlock(x + i, y, z + j, 10);
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
        // Wider than the water's 7-cell spread from its source, so nothing is left flowing when the next check starts.
        for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) for (let k = 0; k <= 12; k++) window.__game.setBlock(x + i, y + k, z + j, 0);
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
        // The previous check also used this platform. Clear the air above the floor first: a faster frame rate lets
        // its water spread beyond that check's cleanup radius, and flowing water left there would re-flood these cells.
        for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) for (let k = 1; k <= 8; k++) window.__game.setBlock(x + i, y + k, z + j, 0);
        for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) window.__game.setBlock(x + i, y, z + j, 10);
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
        for (let i = -10; i <= 10; i++) for (let j = -10; j <= 10; j++) for (let k = 0; k <= 12; k++) window.__game.setBlock(x + i, y + k, z + j, 0);
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
      await withAuxiliaryPage(page, async (pausePage) => {
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
      // Keys are read once per rendered frame, and one software-rendered frame can take over 10 s on a loaded runner.
      await pausePage.waitForFunction(() => !window.__game.state().inventoryOpen, null, { timeout: 30_000, polling: 100 })
        .catch(() => { throw new Error('Escape did not close pause-menu inventory'); });
      if (!(await pausePage.locator('.menu-overlay').isVisible())) throw new Error('Escape should return to the pause menu');
      // Only the HUD button, not the whole HUD, must sit above the pause overlay.
      await pausePage.locator('.hud-inventory').click();
      // Interval polling like the waits above: under software rendering an animation frame can take seconds.
      await pausePage.waitForFunction(() => window.__game.state().inventoryOpen, null, { timeout: 10_000, polling: 100 })
        .catch(() => { throw new Error('HUD Inventory button did not open inventory over the pause menu'); });
      await pausePage.keyboard.press('Escape');
      await pausePage.waitForFunction(() => !window.__game.state().inventoryOpen, null, { timeout: 30_000, polling: 100 })
        .catch(() => { throw new Error('Escape did not close the HUD-opened inventory'); });
      if ((await pausePage.locator('.menu-title').innerText()) !== 'Paused') throw new Error('HUD inventory must return to the pause menu');
      if (await pausePage.evaluate(() => document.pointerLockElement !== null)) throw new Error('HUD inventory should leave the pause-menu pointer free');
      });
    },
  },
  {
    name: 'HUD Inventory button works without pointer capture and with Tab, Enter and Space',
    run: async (page) => {
      await withAuxiliaryPage(page, async (hudPage) => {
      const button = hudPage.getByRole('button', { name: 'Inventory', exact: true });
      let phase = 'initial HUD click';
      const waitState = async (open) => {
        try {
          // Keys and HUD state are handled once per rendered frame, which can take many seconds under software rendering.
          await hudPage.waitForFunction((open) => window.__game.state().inventoryOpen === open, open, { timeout: 30_000, polling: 100 });
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
      await hudPage.waitForFunction(() => document.querySelector('.hud-inventory')?.disabled, null, { timeout: 30_000, polling: 100 });
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
      });
    },
  },
  {
    name: 'lava flows, cools against water, ignites survival players and water extinguishes them',
    run: async (page) => {
      const start = await page.evaluate(() => window.__game.state());
      const [x, z] = [Math.floor(start.position[0]), Math.floor(start.position[2])];
      const y = 8390;
      try {
        await page.evaluate(([x, y, z]) => {
          window.__game.setFlying(true); window.__game.teleport(x + 0.5, y + 5, z + 0.5);
        }, [x, y, z]);
        await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
        await page.evaluate(([x, y, z]) => {
          const g = window.__game;
          for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
            for (let dy = 1; dy <= 7; dy++) g.setBlock(x + dx, y + dy, z + dz, 0);
            g.setBlock(x + dx, y, z + dz, 10);
          }
          g.setBlock(x - 3, y + 1, z, 54);
        }, [x, y, z]);
        await page.waitForFunction(([x, y, z]) => {
          const s = window.__game.getBlock(x - 2, y + 1, z); return s >= 55 && s <= 70;
        }, [x, y, z], { timeout: 20_000 });
        await page.evaluate(([x, y, z]) => window.__game.setBlock(x - 4, y + 1, z, 5), [x, y, z]);
        await page.waitForFunction(([x, y, z]) => window.__game.getBlock(x - 3, y + 1, z) === 71, [x, y, z], { timeout: 20_000 });
        await page.evaluate(([x, y, z]) => {
          const g = window.__game;
          g.setBlock(x + 3, y + 1, z, 54); g.teleport(x + 3.5, y + 1, z + 0.5);
          g.setFlying(true); g.setGameMode('survival');
        }, [x, y, z]);
        await page.waitForFunction(() => window.__game.state().burning && window.__game.state().health < 20, null, { timeout: 10_000 });
        await page.locator('.hazard-warning').waitFor({ state: 'visible', timeout: 5000 });
        await page.evaluate(([x, y, z]) => window.__game.setBlock(x + 3, y + 1, z, 5), [x, y, z]);
        await page.waitForFunction(() => !window.__game.state().burning, null, { timeout: 10_000 });
        // Give the adjacent lava/water interfaces time to cool, then verify residual fire has stopped.
        await page.waitForTimeout(750);
        const health = await page.evaluate(() => window.__game.state().health);
        if (health <= 0 || health >= 20) throw new Error(`expected survival damage without respawn, got health ${health}`);
        await page.waitForTimeout(500);
        const after = await page.evaluate(() => window.__game.state());
        if (after.burning || after.health !== health) throw new Error(`water did not stop fire damage: ${health} -> ${after.health}`);
      } finally {
        await page.evaluate(([x, y, z, px, py, pz, flying, mode, health]) => {
          const g = window.__game;
          for(let dx=-12;dx<=12;dx++)for(let dz=-12;dz<=12;dz++)for(let dy=7;dy>=0;dy--)g.setBlock(x+dx,y+dy,z+dz,0);
          g.setGameMode(mode); g.setHealth(health);
          g.teleport(px, py, pz); g.setFlying(flying);
        }, [x,y,z,...start.position, start.flying, start.gameMode, start.health]);
        await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      }
    },
  },
  {
    name: 'distant terrain builds kilometres of geometry and recenters after movement',
    run: async (page) => {
      const start = await page.evaluate(() => window.__game.state());
      const [x, y, z] = start.position;
      try {
        await page.evaluate(([x, y, z]) => {
          window.__game.setFlying(true); window.__game.teleport(x + 128, Math.max(245, y + 50), z);
          window.__game.look(-0.8, -0.35);
        }, [x, y, z]);
        await page.waitForFunction(() => {
          const s = window.__game.state();
          return s.areaMeshed && s.horizon.ready && s.horizon.visible && s.horizon.vertices > 0 &&
            s.horizon.centerX === Math.floor(s.position[0] / 64) * 64;
        }, null, { timeout: 90_000 }).catch(async error => {
          const s=await page.evaluate(()=>window.__game.state());
          throw Error(`initial horizon readiness: ${JSON.stringify({position:s.position,horizon:s.horizon,pendingGen:s.pendingGen,pendingMesh:s.pendingMesh,jobs:s.jobsInFlight})}; ${error.message}`);
        });
        const h = await page.evaluate(() => window.__game.state().horizon);
        if (h.radiusM < 2000) throw new Error(`horizon ends too near: ${JSON.stringify(h)}`);
        await page.screenshot({ path: 'screenshots/horizon.png' });
        // Reproduce the elevated view that exposed missing ground and the mismatching proxy.
        await page.evaluate(() => {window.__game.setFlying(true);window.__game.teleport(101.5,245,-26.5);window.__game.look(-0.8,-0.35);});
        await page.waitForFunction(() => {
          const s=window.__game.state();
          return s.areaMeshed && s.pendingGen===0 && s.pendingMesh===0 && s.jobsInFlight===0 && s.horizon.ready && s.horizon.centerX===64 && s.horizon.centerZ===-64;
        },null,{timeout:90000}).catch(async error => {
          const s=await page.evaluate(()=>window.__game.state());
          throw Error(`elevated terrain readiness: ${JSON.stringify({position:s.position,horizon:s.horizon,pendingGen:s.pendingGen,pendingMesh:s.pendingMesh,jobs:s.jobsInFlight})}; ${error.message}`);
        });
        await page.screenshot({path:'screenshots/terrain-regression.png'});
      } finally {
        await page.evaluate(([x, y, z, flying, yaw, pitch]) => {
          window.__game.teleport(x, y, z); window.__game.setFlying(flying); window.__game.look(yaw, pitch);
        }, [...start.position, start.flying, start.yaw, start.pitch]);
        await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      }
    },
  },
  {
    name: 'shoreline reeds are generated beside surface water',
    run: async (page) => {
      const start = await page.evaluate(() => window.__game.state());
      try {
        await page.evaluate(() => {
          window.__game.setFlying(true); window.__game.teleport(-396.5, 5, 6.5); window.__game.look(0.6, -0.4);
        });
        await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
        const reed = await page.evaluate(() => window.__game.getBlock(-398, 1, 4));
        if (reed !== 72) throw new Error(`expected seed-1 bank reed, got ${reed}`);
        await page.screenshot({ path: 'screenshots/shoreline-reeds.png' });
      } finally {
        await page.evaluate(([x, y, z, flying, yaw, pitch]) => {
          window.__game.teleport(x, y, z); window.__game.setFlying(flying); window.__game.look(yaw, pitch);
        }, [...start.position, start.flying, start.yaw, start.pitch]);
        await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      }
    },
  },
  {
    name: 'supported boulders, fallen logs, moss and lake pads reach worker meshes',
    run: async (page) => {
      const start = await page.evaluate(() => window.__game.state());
      try {
        for (const [name, x, y, z, state] of [
          ['boulder', 3813, 202, -1759, 14], ['moss', 3518, 273, -2162, 76],
          ['fallen-log', 3478, 268, -2228, 73], ['lily-pad', 4254, 223, -3024, 75],
        ]) {
          await page.evaluate(([x, y, z]) => {
            window.__game.setFlying(true); window.__game.teleport(x + 3.5, y + 4, z + 5.5); window.__game.look(0.55, -0.55);
          }, [x, y, z]);
          await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
          const actual = await page.evaluate(([x, y, z]) => window.__game.getBlock(x, y, z), [x, y, z]);
          if (actual !== state) throw Error(`${name}: expected generated state ${state}, got ${actual}`);
          if (name === 'lily-pad') {
            const below = await page.evaluate(([x, y, z]) => window.__game.getBlock(x, y - 1, z), [x, y, z]);
            if (below !== 5) throw Error(`lily pad lacks source water: ${below}`);
          }
          await page.screenshot({ path: `screenshots/surface-${name}.png` });
        }
      } finally {
        await page.evaluate(([x, y, z, flying, yaw, pitch]) => {
          window.__game.teleport(x, y, z); window.__game.setFlying(flying); window.__game.look(yaw, pitch);
        }, [...start.position, start.flying, start.yaw, start.pitch]);
        await page.waitForFunction(() => window.__game.state().areaMeshed, null, { timeout: 60_000 });
      }
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
    // The suite opens auxiliary pages; without these flags Chromium throttles requestAnimationFrame on the page
    // that is no longer "visible", which starves the main game's render loop (~1 frame/s) between checks.
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // SwiftShader can take longer than Playwright's 30 s default to produce a frame while chunk meshes stream in;
  // a timed-out screenshot says nothing about the game. Every assertion has its own explicit timeout.
  page.setDefaultTimeout(90_000);
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
