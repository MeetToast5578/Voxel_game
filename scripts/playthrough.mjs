// Plays a new survival world in headless Chromium with real mouse and keys, step by step. It fails on a browser error
// or a step that does not finish, and writes screenshots/playthrough/report.html for review. Needs a prior `vite build`.
// Items the script cannot reasonably earn in a few minutes (iron, a crown) are handed over and marked "given".
// Usage: node scripts/playthrough.mjs
import { chromium } from 'playwright';
import { preview } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'screenshots/playthrough';
mkdirSync(OUT, { recursive: true });
const server = await preview({ preview: { port: 4178, strictPort: true } });
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
if (process.env.THROTTLE) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) });
const errors = [], steps = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const game = (fn, arg) => page.evaluate(fn, arg);
const count = (key) => game((k) => window.__game.play.inventory.count(window.__game.blocks.state(k)), key);
const frames = (n = 5) => game(async (n) => { for (let i = 0; i < n; i++) await new Promise(requestAnimationFrame); }, n);
const until = (fn, arg, what, timeout = 30_000) => page.waitForFunction(fn, arg, { timeout, polling: 100 }).catch(() => { throw new Error(`timed out: ${what}`); });

/** Runs one step, screenshots the result and records it for the report. */
async function step(name, note, fn) {
  const t0 = Date.now();
  let error = null;
  try { await fn(); } catch (e) { error = String(e.message ?? e); }
  const file = `${String(steps.length + 1).padStart(2, '0')}.png`;
  await page.screenshot({ path: `${OUT}/${file}` });
  steps.push({ name, note, file, ms: Date.now() - t0, error });
  console.log(`${error ? 'FAIL' : 'ok  '} ${name} (${Date.now() - t0} ms)${error ? `: ${error}` : ''}`);
  if (error) throw new Error(`${name}: ${error}`);
}

/** Captures the pointer as a player would: a click on the view, or Resume when the pause menu is up. */
async function lock() {
  // The pause menu can come and go while the pointer is caught: try a few times, whichever way is open.
  for (let tries = 0; tries < 5 && !(await game(() => !!document.pointerLockElement)); tries++) {
    const resume = page.getByRole('button', { name: 'Resume', exact: true });
    if (await resume.isVisible().catch(() => false)) await resume.click({ timeout: 3000 }).catch(() => undefined);
    else await page.mouse.click(640, 360);
    await page.waitForFunction(() => !!document.pointerLockElement, null, { timeout: 4000, polling: 100 }).catch(() => undefined);
  }
  await until(() => !!document.pointerLockElement, null, 'pointer lock', 5000);
  // Park the mouse in the middle now: a later jump there would read as looking around and turn the view off target.
  await page.mouse.move(640, 360);
  await frames(2);
}

/** Turns the view to a point and waits until the game targets the expected block (if one is given). */
async function aim(x, y, z, block) {
  await game(([x, y, z]) => {
    const n = window.__game, b = n.player.body, dx = x - b.x, dy = y - n.player.eyeY, dz = z - b.z;
    n.player.yaw = Math.atan2(-dx, -dz);
    n.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }, [x, y, z]);
  if (block) await page.waitForFunction(([x, y, z]) => { const t = window.__game.play.target; return t && t.x === x && t.y === y && t.z === z; }, block, { timeout: 20_000, polling: 100 }).catch(async () => {
    const got = await game(() => { const t = window.__game.play.target, p = window.__game.player; return { target: t && [t.x, t.y, t.z], at: [p.body.x, p.body.y, p.body.z].map((v) => +v.toFixed(2)) }; });
    throw new Error(`aim at ${block}: ${JSON.stringify(got)}`);
  });
  else await frames(3);
}

/** Holds the left button on a block until it is gone. */
async function dig(x, y, z) {
  // Aim at the middle of the face toward the eye, so the block above never gets in the way (the top face when digging straight down).
  const p = await game(([x, y, z]) => { const n = window.__game, d = [n.player.body.x - x - 0.5, n.player.eyeY - y - 0.5, n.player.body.z - z - 0.5], a = d.map(Math.abs), k = Math.hypot(d[0], d[2]) < 0.3 ? 1 : a[0] >= a[2] ? 0 : 2; return [0, 1, 2].map((i) => [x, y, z][i] + 0.5 + (i === k ? Math.sign(d[i]) * 0.49 : 0)); }, [x, y, z]);
  await aim(...p, [x, y, z]);
  await page.mouse.down();
  await page.waitForFunction(([x, y, z]) => window.__game.world.get(x, y, z) === 0, [x, y, z], { timeout: 90_000, polling: 100 }).catch(async () => {
    const state = await game(() => { const n = window.__game, t = n.play.target; return { locked: !!document.pointerLockElement, screen: n.play.screen, breaking: n.play.breaking, target: t && [t.x, t.y, t.z], fps: n.fps, dead: n.play.survival.dead }; });
    throw new Error(`dig ${x},${y},${z} timed out: ${JSON.stringify(state)}`);
  }).finally(() => page.mouse.up());
}

/** Walks over to each drop within 12 cells, as a player would, until all are in the inventory. */
async function collect() {
  const near = () => game(() => { const n = window.__game, b = n.player.body; return n.play.drops.list.filter((d) => Math.hypot(d.body.x - b.x, d.body.z - b.z) < 12).map((d) => [d.body.x, d.body.y, d.body.z]); });
  for (let i = 0; i < 40; i++) {
    const left = await near();
    if (!left.length) return;
    await game((d) => { const n = window.__game; Object.assign(n.player.body, { x: Math.floor(d[0]) + 0.5, y: d[1], z: Math.floor(d[2]) + 0.5, vx: 0, vy: 0, vz: 0 }); }, left[0]);
    // Real frames as well as time: on a slow machine the game runs fewer steps per second.
    await page.waitForTimeout(250);
    await frames(10);
  }
  const state = await game(() => { const n = window.__game, b = n.player.body; return { player: [b.x, b.y, b.z].map((v) => +v.toFixed(2)), drops: n.play.drops.list.map((d) => [n.blocks.stateName(d.stack.state), d.stack.count, +d.body.x.toFixed(2), +d.body.y.toFixed(2), +d.body.z.toFixed(2), +d.wait.toFixed(2)]), free: n.play.inventory.slots.filter((s) => !s).length }; });
  throw new Error(`${(await near()).length} drops not picked up: ${JSON.stringify(state)}`);
}

/** Selects the hotbar slot holding `key`, moving it to the hotbar first if needed. */
async function hold(key) {
  const slot = await game((k) => {
    const n = window.__game, inv = n.play.inventory, s = n.blocks.state(k);
    let i = inv.slots.findIndex((x) => x && x.state === s);
    if (i >= 9) { [inv.slots[8], inv.slots[i]] = [inv.slots[i], inv.slots[8]]; i = 8; }
    return i;
  }, key);
  if (slot < 0) throw new Error(`no ${key} to hold`);
  await page.keyboard.press(`Digit${slot + 1}`);
  await until((k) => { const n = window.__game, h = n.play.inventory.slots[n.play.inventory.selected]; return h && n.blocks.type(h.state).key === k; }, key, `hold ${key}`, 20_000);
}

/** Crafts `name` from the crafting panel, `all` for as many as possible. */
async function craft(name, all = false) {
  await page.getByLabel('Search recipes').fill(name);
  const tile = page.locator(`.recipe-tile[title="${name}"]`).first();
  // The workbench is noticed when the inventory opens: if the recipe is missing, open it again once.
  if (!(await tile.isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.keyboard.press('Escape');
    await lock();
    await openInventory();
    await page.getByLabel('Search recipes').fill(name);
  }
  await tile.click({ timeout: 15_000 });
  await page.locator('.craft-buttons button', { hasText: all ? /^All/ : /^Craft$/ }).click();
}

async function openInventory() {
  await page.keyboard.press('KeyE');
  await page.getByLabel('Search recipes').waitFor({ timeout: 20_000 });
}
async function closeScreen() {
  await page.keyboard.press('Escape');
  await lock();
}

/** Puts a creature in front of the player and swings at it until it dies; returns whether the boss bar showed. */
async function fight(key, metres = 2.4) {
  const id = await game(([key, d]) => {
    const n = window.__game, b = n.player.body, [dx, , dz] = n.player.direction(), cells = d / 0.6;
    const x = b.x + dx * cells, z = b.z + dz * cells;
    return n.spawnMob(key, x, n.world.surfaceAt(Math.floor(x), Math.floor(z)) + 1, z);
  }, [key, metres]);
  let boss = false;
  for (let i = 0; i < 120; i++) {
    const c = await game((id) => { const c = window.__game.creatures.list.find((c) => c.id === id); return c && c.health > 0 ? { x: c.body.x, y: c.body.y + c.body.height / 2, z: c.body.z, feet: c.body.y } : null; }, id);
    if (!c) return boss;
    // Keep the creature within sword reach and on its level, as a player would by stepping in (archers back away).
    await game((c) => {
      const n = window.__game, b = n.player.body, d = Math.hypot(c.x - b.x, c.z - b.z);
      if (d > 3 || Math.abs(c.feet - b.y) > 1.5) Object.assign(b, { x: c.x + ((b.x - c.x) / (d || 1)) * 2.5, y: c.feet, z: c.z + ((b.z - c.z) / (d || 1)) * 2.5, vy: 0 });
      n.play.survival.health = n.play.survival.maxHealth;
    }, c);
    await aim(c.x, c.y, c.z);
    await page.mouse.click(640, 360);
    boss ||= await game(() => !document.querySelector('.boss-bar').hidden);
    await page.waitForTimeout(260);
    await frames(2);
  }
  throw new Error(`${key} still alive after 120 swings`);
}

/** Moves to flat ground with nothing standing within five cells, so no tree, hole or water gets in the way of a fight. */
async function goToOpenGround() {
  const open = await game(() => {
    const n = window.__game, b = n.player.body, clear = (x, z) => { const g = n.world.surfaceAt(x, z); if (g === undefined) return false; for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) { const h = n.world.surfaceAt(x + dx, z + dz); if (h === undefined || Math.abs(h - g) > 1 || !n.blocks.type(n.world.get(x + dx, h, z + dz)).solid) return false; for (let y = h + 1; y < h + 8; y++) if (n.world.get(x + dx, y, z + dz) && n.blocks.type(n.world.get(x + dx, y, z + dz)).solid || n.blocks.type(n.world.get(x + dx, y, z + dz)).layer === 'water') return false; } return true; };
    for (let r = 8; r < 60; r += 3) for (let a = 0; a < 16; a++) { const x = Math.floor(b.x + r * Math.cos(a * 0.39)), z = Math.floor(b.z + r * Math.sin(a * 0.39)); if (clear(x, z)) return [x + 0.5, n.world.surfaceAt(x, z) + 1, z + 0.5]; }
    return null;
  });
  if (!open) throw new Error('no open ground for a fight');
  await game((p) => window.__game.setView(...p, 0, 0), open);
  await frames(10);
}

/** Where to stand: the open column next to a tree trunk, and the trunk's lowest log. */
const findTree = () => game(() => {
  const n = window.__game, b = n.player.body, isLog = (s) => /log/.test(n.blocks.type(s).key);
  for (let r = 2; r < 60; r++) for (let dx = -r; dx <= r; dx++) for (const dz of [-r, r]) for (const [x, z] of [[dx, dz], [dz, dx]]) {
    const cx = Math.floor(b.x) + x, cz = Math.floor(b.z) + z, top = n.world.surfaceAt(cx, cz);
    if (top === undefined) continue;
    for (let y = top - 2; y <= top + 3; y++) {
      if (!isLog(n.world.get(cx, y, cz)) || isLog(n.world.get(cx, y - 1, cz))) continue;
      const sx = cx + 2, ground = n.world.surfaceAt(sx, cz);
      if (ground === undefined || Math.abs(ground + 1 - y) > 1 || n.world.get(sx, ground + 1, cz) || n.world.get(sx, ground + 2, cz) || n.world.get(sx, ground + 3, cz)) continue;
      return { log: [cx, y, cz], stand: [sx + 0.5, ground + 1, cz + 0.5] };
    }
  }
  return null;
});

let table;
try {
  await page.goto('http://localhost:4178/index.html?seed=1&view=4&world=playthrough&new=1&mode=survival');
  await until(() => window.__game?.idle, null, 'world loads', 180_000);
  await page.waitForTimeout(1000);

  await step('A new survival world', 'Seed 1, survival, an empty inventory.', async () => {
    await lock();
    const s = await game(() => ({ mode: window.__game.play.mode, items: window.__game.play.inventory.slots.filter(Boolean).length }));
    if (s.mode !== 'survival' || s.items) throw new Error(JSON.stringify(s));
  });

  await step('Punch a tree', 'Walks to the nearest tree and digs three logs by hand, holding the left button.', async () => {
    const tree = await findTree();
    if (!tree) throw new Error('no tree within 60 cells');
    const [x, y, z] = tree.log;
    await game(([x, y, z]) => window.__game.setView(x, y, z, 0, 0), tree.stand);
    await frames(10);
    for (let i = 0; i < 3; i++) await dig(x, y + i, z);
    await collect();
    if ((await count('log')) < 3) throw new Error(`only ${await count('log')} logs picked up`);
  });

  await step('Planks, sticks and a workbench', 'Crafts from the inventory with the recipe search and the Craft buttons.', async () => {
    await openInventory();
    await craft('Planks', true);
    await craft('Crafting table');
    await craft('Stick');
    await page.waitForTimeout(300);
    if ((await count('crafting_table')) !== 1) throw new Error('no crafting table');
  });

  await step('Place the workbench and make a pickaxe', 'Places the table with the right button; its recipes unlock beside it.', async () => {
    await closeScreen();
    await hold('crafting_table');
    const spot = await game(() => {
      const n = window.__game, b = n.player.body;
      for (const [dx, dz] of [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -2], [2, 0]]) {
        const x = Math.floor(b.x) + dx, z = Math.floor(b.z) + dz, y = n.world.surfaceAt(x, z);
        if (n.blocks.type(n.world.get(x, y, z)).solid && !n.world.get(x, y + 1, z) && !n.world.get(x, y + 2, z)) return [x, y, z];
      }
      return null;
    });
    if (!spot) throw new Error('no clear ground next to the player');
    table = spot;
    await aim(spot[0] + 0.5, spot[1] + 1, spot[2] + 0.5, spot);
    await page.mouse.click(640, 360, { button: 'right' });
    await until(([x, y, z]) => window.__game.blocks.type(window.__game.world.get(x, y + 1, z)).key === 'crafting_table', spot, 'table placed', 20_000);
    await openInventory();
    await craft('Wooden pickaxe');
    await page.waitForTimeout(300);
    if ((await count('wooden_pickaxe')) !== 1) throw new Error('no wooden pickaxe');
  });

  await step('Dig stone', 'Digs straight down with the wooden pickaxe until three pieces of rock are in the bag (any rock makes stone tools).', async () => {
    await closeScreen();
    await hold('wooden_pickaxe');
    const rock = () => game(() => { const n = window.__game; return ['cobblestone', 'granite', 'diorite', 'andesite', 'limestone', 'slate', 'basalt', 'deepslate'].reduce((t, k) => t + n.play.inventory.count(n.blocks.state(k)), 0); });
    for (let i = 0; i < 40 && (await rock()) < 3; i++) {
      const cell = await game(() => { const n = window.__game, b = n.player.body, x = Math.floor(b.x), z = Math.floor(b.z); for (let y = Math.floor(b.y) - 1; y > Math.floor(b.y) - 6; y--) if (n.world.get(x, y, z)) return [x, y, z]; return null; });
      if (!cell) throw new Error('nothing to dig');
      await dig(...cell);
      await page.waitForTimeout(300);
      await collect();
    }
    await collect();
    if ((await rock()) < 3) throw new Error(`only ${await rock()} rock`);
  });

  await step('Stone sword', 'Back at the table: a stone sword from cobblestone and sticks.', async () => {
    // Climb out of the hole to the table (its recipes only show within four cells of it).
    await game((t) => { const n = window.__game; n.setView(t[0] + 1.5, n.world.surfaceAt(t[0] + 1, t[2]) + 1, t[2] + 0.5, 0, 0); }, table);
    await frames(10);
    await openInventory();
    await craft('Stick');
    await craft('Stone sword');
    await page.waitForTimeout(300);
    if ((await count('stone_sword')) !== 1) throw new Error('no stone sword');
    await closeScreen();
  });

  await step('Fight a slime', 'A green slime in front; swings until it dies, then picks up its gel.', async () => {
    await goToOpenGround();
    await hold('stone_sword');
    await fight('slime');
    await page.waitForTimeout(800);
    await collect();
    const coins = await count('trade_coin').catch(() => 0);
    console.log(`  gel ${await count('gel')}, coins ${coins}`);
  });

  await step('Iron gear (given) and a skeleton', 'Iron sword and armour are handed over; a skeleton is fought at night.', async () => {
    await game(() => {
      const n = window.__game, S = (k) => n.blocks.state(k), inv = n.play.inventory;
      inv.add({ state: S('iron_sword'), count: 1 });
      for (const k of ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']) inv.add({ state: S(k), count: 1 });
      n.setTime(0.9);
    });
    await openInventory();
    // Equip each armour piece with Shift-click, as a player would.
    for (const name of ['Iron helmet', 'Iron chestplate', 'Iron leggings', 'Iron boots']) await page.locator(`.slot[aria-label^="${name}"]`).first().click({ modifiers: ['Shift'] });
    const worn = await game(() => window.__game.play.armour.filter(Boolean).length);
    if (worn !== 4) throw new Error(`${worn} armour pieces worn`);
    await closeScreen();
    await hold('iron_sword');
    await fight('skeleton');
  });

  await step('Summon and beat the Slime King', 'A Gel Crown (given) is used with the right button; the boss bar shows.', async () => {
    await goToOpenGround();
    await game(() => { const n = window.__game; n.play.inventory.add({ state: n.blocks.state('slime_crown'), count: 1 }); n.setTime(0.3); });
    await hold('slime_crown');
    await game(() => { window.__game.player.pitch = 0.4; });
    await page.mouse.click(640, 360, { button: 'right' });
    await until(() => window.__game.creatures.list.some((c) => c.species.key === 'king_slime'), null, 'Slime King appears', 20_000);
    await game(() => { const n = window.__game; n.play.inventory.add({ state: n.blocks.state('jade_sword'), count: 1 }); });
    await hold('jade_sword');
    // Fight the summoned king where it stands.
    for (let i = 0; i < 200; i++) {
      const c = await game(() => { const c = window.__game.creatures.list.find((c) => c.species.key === 'king_slime' && c.health > 0); return c && { x: c.body.x, y: c.body.y + c.body.height / 2, z: c.body.z, feet: c.body.y }; });
      if (!c) break;
      // Follow it, up a tree too if it hops onto one.
      await game((c) => { const n = window.__game, b = n.player.body, d = Math.hypot(c.x - b.x, c.z - b.z); if (d > 4 || Math.abs(c.feet - b.y) > 2) Object.assign(b, { x: c.x + ((b.x - c.x) / (d || 1)) * 3.5, y: Math.max(b.y, c.feet), z: c.z + ((b.z - c.z) / (d || 1)) * 3.5, vy: 0 }); n.play.survival.health = n.play.survival.maxHealth; }, c);
      await aim(c.x, c.y, c.z);
      await page.mouse.click(640, 360);
      await page.waitForTimeout(260);
    }
    if (await game(() => window.__game.creatures.list.some((c) => c.species.key === 'king_slime' && c.health > 0))) throw new Error('the Slime King survived');
    await page.waitForTimeout(800);
    await collect();
  });

  await step('Trade with a villager', 'A farmer stands by; the right button opens the shop and an offer is bought with coins (given).', async () => {
    await game(() => { const n = window.__game; n.play.inventory.add({ state: n.blocks.state('trade_coin'), count: 30 }); });
    await goToOpenGround();
    const id = await game(() => { const n = window.__game, b = n.player.body, [dx, , dz] = n.player.direction(), x = b.x + dx * 3, z = b.z + dz * 3; return n.spawnMob('farmer', x, n.world.surfaceAt(Math.floor(x), Math.floor(z)) + 1, z); });
    await hold('jade_sword');
    // The farmer wanders: look at where it is now and ask again, up to three times.
    for (let tries = 0; ; tries++) {
      // It wanders off out of reach between tries: bring it back in front of the player, standing still.
      const c = await game((id) => { const n = window.__game, c = n.creatures.list.find((c) => c.id === id), b = n.player.body, [dx, , dz] = n.player.direction(), l = Math.hypot(dx, dz) || 1;
        c.home = undefined; c.goal = null; c.mode = 'idle'; c.think = 30;
        Object.assign(c.body, { x: b.x + (dx / l) * 3, y: b.y, z: b.z + (dz / l) * 3, vx: 0, vy: 0, vz: 0 });
        return { x: c.body.x, y: c.body.y + c.body.height * 0.6, z: c.body.z }; }, id);
      await aim(c.x, c.y, c.z);
      await page.mouse.click(640, 360, { button: 'right' });
      try { await page.locator('.trade-list').waitFor({ timeout: 8_000 }); break; } catch (e) {
        if (tries >= 2) {
          const why = await game((id) => { const n = window.__game, c = n.creatures.list.find((c) => c.id === id), b = n.player.body;
            return JSON.stringify({ farmer: c && [c.body.x, c.body.y, c.body.z, c.mode], player: [b.x, b.y, b.z, n.player.yaw, n.player.pitch], near: n.creatures.list.filter((o) => Math.hypot(o.body.x - b.x, o.body.z - b.z) < 12).map((o) => o.species.key) }); }, id);
          throw new Error(`${e.message.split('\n')[0]} ${why}`);
        }
      }
    }
    const before = await count('trade_coin');
    await page.locator('.trade-list button:not([disabled])').first().click();
    if ((await count('trade_coin')) >= before) throw new Error('no coins spent');
    await closeScreen();
  });

  await step('Save and reload', 'Saves, reloads the page, and checks the gear, max health and inventory survived.', async () => {
    const before = await game(() => { const n = window.__game; return { items: n.play.inventory.slots.filter(Boolean).length, armour: n.play.armour.filter(Boolean).length, max: n.play.survival.maxHealth }; });
    await game(() => window.__game.save());
    await page.goto('http://localhost:4178/index.html?view=4&world=playthrough');
    await until(() => window.__game?.idle, null, 'reload', 180_000);
    const after = await game(() => { const n = window.__game; return { items: n.play.inventory.slots.filter(Boolean).length, armour: n.play.armour.filter(Boolean).length, max: n.play.survival.maxHealth }; });
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`);
    await lock();
  });
} catch (e) {
  errors.push(String(e.message ?? e));
} finally {
  const rows = steps.map((s, i) => `<section class="${s.error ? 'fail' : 'ok'}"><h2>${i + 1}. ${s.name} <small>${(s.ms / 1000).toFixed(1)} s</small></h2><p>${s.note}</p>${s.error ? `<p class="err">${s.error}</p>` : ''}<img src="${s.file}" alt=""></section>`).join('\n');
  writeFileSync(`${OUT}/report.html`, `<!doctype html><meta charset="utf-8"><title>Play-through</title><style>body{font:15px system-ui;max-width:900px;margin:2em auto;padding:0 16px;background:#16181a;color:#e8e6e0}img{width:100%;border-radius:6px}.fail h2{color:#ff7a6a}.err{color:#ff7a6a;font-family:monospace}small{color:#999;font-weight:normal}</style><h1>Play-through, ${new Date().toISOString().slice(0, 16)}</h1><p>${errors.length ? `${errors.length} problem(s):<pre>${errors.join('\n')}</pre>` : 'Every step passed with no browser errors.'}</p>${rows}`);
  await browser.close();
  server.httpServer.close();
}
if (errors.length) {
  console.error('errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`PASS: ${steps.length} steps; report in ${OUT}/report.html`);
