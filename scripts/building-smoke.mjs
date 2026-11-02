import {preview} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const server = await preview({preview: {port: 4178, strictPort: true}});
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
try {
  const p = await browser.newPage({viewport: {width: 1280, height: 900}});
  p.setDefaultTimeout(30000);
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto('http://localhost:4178/?seed=1&view=4&mode=creative&world=building-smoke&new=1');
  await p.waitForFunction(() => window.__game?.idle, null, {timeout: 180000});
  const origin = await p.evaluate(() => {
    const n = window.__game, b = n.player.body, x = Math.floor(b.x), y = Math.floor(b.y), z = Math.floor(b.z);
    n.creatures.list.length = 0;
    for (let dx = -1; dx <= 6; dx++) for (let dz = -1; dz <= 1; dz++) {
      n.setBlock(x + dx, y - 1, z + dz, n.blocks.state('stone'));
      for (let dy = 0; dy <= 6; dy++) n.setBlock(x + dx, y + dy, z + dz, 0);
    }
    n.setView(x + .5, y, z + .5, -Math.PI / 2, 0);
    n.player.flying = true;
    n.setBlock(x + 4, y + 2, z, n.blocks.state('planks', 2));
    n.play.inventory.clear(); n.play.version++;
    return {x, y, z};
  });
  const resume = async () => {
    await p.getByRole('button', {name: 'Resume', exact: true}).click();
    await p.waitForFunction(() => !!document.pointerLockElement);
  };
  const click = async button => { await p.mouse.down({button}); await p.mouse.up({button}); };
  const aim = () => p.evaluate(({x, y, z}) => window.__game.setView(x + .5, y, z + .5, -Math.PI / 2, 0), origin);
  await resume(); await aim();
  await click('middle');
  await p.waitForFunction(() => window.__game.play.held?.state === window.__game.blocks.state('planks', 2));
  console.log('Creative picking preserves wood species.');
  await p.evaluate(() => {
    const n = window.__game, P = n.play;
    P.mode = 'survival'; P.difficulty = 'peaceful'; P.inventory.clear();
    P.inventory.slots[0] = {state: n.blocks.state('iron_pickaxe'), count: 1, wear: 39, upgrade: 2};
    P.inventory.slots[9] = {state: n.blocks.state('planks', 2), count: 22}; P.version++;
  });
  await click('middle');
  await p.waitForFunction(() => window.__game.play.held?.count === 22).catch(async e => {
    console.log('Survival pick diagnostic', await p.evaluate(() => {const n=window.__game;return {locked:!!document.pointerLockElement,position:n.player.body,target:n.play.target,held:n.play.held,screen:n.play.screen,message:n.play.message,health:n.play.survival.health};}));
    throw e;
  });
  assert.deepEqual(await p.evaluate(() => {const s = window.__game.play.inventory.slots[9]; return [s.wear, s.upgrade];}), [39, 2]);
  console.log('Survival picking swaps owned materials and preserves upgraded equipment.');
  await p.evaluate(({x, y, z}) => {
    const n = window.__game, P = n.play;
    n.setBlock(x + 4, y + 2, z, n.blocks.state('chest'));
    P.chests.set(`${x + 4},${y + 2},${z}`, new Array(27).fill(null));
    P.inventory.clear(); P.inventory.slots[0] = {state: n.blocks.state('glass'), count: 1};
    P.inventory.slots[9] = {state: n.blocks.state('glass'), count: 12}; P.version++;
  }, origin);
  await p.locator('#interaction-hint').filter({hasText: 'Shift+Right click: Place'}).waitFor();
  await click('right');
  await p.waitForFunction(() => window.__game.play.screen === 'chest');
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => window.__game.play.screen === 'none');
  if (!await p.evaluate(() => !!document.pointerLockElement)) await resume();
  await aim();
  await p.keyboard.down('Shift');
  await p.locator('#interaction-hint').filter({hasText: 'Right click: Place held block'}).waitFor();
  await p.mouse.down({button: 'right'});
  await p.waitForFunction(() => window.__game.play.held?.count === 10);
  await p.mouse.up({button: 'right'}); await p.keyboard.up('Shift');
  assert.equal(await p.evaluate(() => window.__game.play.screen), 'none');
  assert.equal(await p.evaluate(() => window.__game.play.inventory.slots[9]), null);
  assert.equal(await p.evaluate(({x, y, z}) => {
    const n = window.__game;
    return [1, 2, 3].filter(dx => n.world.get(x + dx, y + 2, z) === n.blocks.state('glass')).length;
  }, origin), 3);
  console.log('Normal chest use, crouch placement, held repeat, automatic refill and body collision pass.');
  // A blur while moving and placing must clear both held controls and queued actions.
  await p.evaluate(({x, y, z}) => {
    const n = window.__game;
    for (let dx = 1; dx <= 3; dx++) n.setBlock(x + dx, y + 2, z, 0);
    n.setBlock(x + 4, y + 2, z, n.blocks.state('stone'));
    n.setView(x + .5, y, z + .5, -Math.PI / 2, 0);
  }, origin);
  await p.keyboard.down('w'); await p.mouse.down({button: 'right'});
  await p.evaluate(() => window.dispatchEvent(new Event('blur')));
  await p.waitForFunction(() => Math.abs(window.__game.player.body.vx) < .001);
  const before = await p.evaluate(() => ({x: window.__game.player.body.x, count: window.__game.play.held.count, swings: window.__game.play.swings}));
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({x: window.__game.player.body.x, count: window.__game.play.held.count, swings: window.__game.play.swings}));
  assert.ok(Math.abs(before.x - after.x) < .01); assert.equal(before.count, after.count); assert.equal(before.swings, after.swings);
  await p.keyboard.up('w'); await p.mouse.up({button: 'right'});
  assert.deepEqual(errors, []);
  console.log('PASS: building controls, material conservation, equipment metadata, prompts and focus-loss recovery; no browser errors.');
} finally { await browser.close(); server.httpServer.close(); }
