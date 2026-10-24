import { describe, expect, it, vi } from 'vitest';
import { DAY_LENGTH_S, DAYS_PER_SEASON, FIXED_DT, FOOD_HUNGER, GAME_MODE_CREATIVE, GAME_MODE_SURVIVAL, THUNDER_DELAY_MIN_S, WORLD_LATITUDE_DEG } from '../src/config';
import { Game } from '../src/game';
import { BlockBreaking } from '../src/player/breaking';
import { Inventory, startingSlots } from '../src/player/inventory';
import { Calendar } from '../src/world/calendar';
import { BlockId } from '../src/world/blocks';

/** Exercise the real game methods without constructing WebGL, workers or browser UI in Node. */
function call(game: Game, method: string, ...args: unknown[]) {
  return Reflect.apply(Reflect.get(Game.prototype, method), game, args);
}

function tickingGame() {
  const game = Object.create(Game.prototype) as Game;
  const calendar = new Calendar(DAYS_PER_SEASON, WORLD_LATITUDE_DEG);
  const player = { update: vi.fn(), splashSpeed: 0 };
  Object.assign(game, {
    ready: true, playing: false, timeOfDay: 0.2, calendar, player,
    tickTimer: 0, saveTimer: 0, gameMode: GAME_MODE_CREATIVE,
    items: { step: vi.fn() }, chunks: { tick: vi.fn() }, bodies: { step: () => [] },
    edits: { step: vi.fn() }, isSolidAt: () => false, isWaterAt: () => false,
    spawnBrokenBlocks: vi.fn(), collectItems: vi.fn(), updateFurnaces: vi.fn(), updateFootsteps: vi.fn(),
  });
  return { game, calendar, player };
}

describe('game calendar wiring (T-F9)', () => {
  it('advances both clocks from the same fixed simulation delta', () => {
    const { game, calendar } = tickingGame();
    for (let i = 0; i < 60; i++) call(game, 'fixedUpdate', FIXED_DT);
    expect(game.timeOfDay).toBeCloseTo(0.2 + 60 * FIXED_DT / DAY_LENGTH_S, 12);
    expect(calendar.timeOfYear).toBeCloseTo(60 * FIXED_DT / (DAY_LENGTH_S * 4 * DAYS_PER_SEASON), 12);
  });

  it('does not advance either clock before spawn is ready', () => {
    const { game, calendar, player } = tickingGame();
    game.ready = false;
    call(game, 'fixedUpdate', FIXED_DT);
    expect(game.timeOfDay).toBe(0.2);
    expect(calendar.timeOfYear).toBe(0);
    expect(player.update).not.toHaveBeenCalled();
  });

  it('continues a loaded year clock through a season boundary and the year wrap', () => {
    const { game, calendar } = tickingGame();
    const fraction = FIXED_DT / (DAY_LENGTH_S * 4 * DAYS_PER_SEASON);
    calendar.timeOfYear = 0.25 - fraction / 2;
    call(game, 'fixedUpdate', FIXED_DT);
    expect(calendar.season).toBe('summer');
    expect(calendar.day).toBe(1);
    calendar.timeOfYear = 1 - fraction / 2;
    call(game, 'fixedUpdate', FIXED_DT);
    expect(calendar.season).toBe('spring');
    expect(calendar.timeOfYear).toBeCloseTo(fraction / 2, 12);
  });

  it('keeps advancing the calendar with the day clock when input is not captured', () => {
    const { game, calendar } = tickingGame();
    game.playing = false; // the existing day clock/simulation also continues in menus
    call(game, 'fixedUpdate', FIXED_DT);
    expect(calendar.timeOfYear).toBeGreaterThan(0);
  });
});

function inventoryGame(playing: boolean, mode: 'start' | 'paused') {
  const game = Object.create(Game.prototype) as Game;
  const screen = {
    isOpen: false,
    show: vi.fn(() => { screen.isOpen = true; }),
    hide: vi.fn(() => { screen.isOpen = false; return [] as { state: number; count: number }[]; }),
  };
  const menu = { currentMode: mode, hide: vi.fn(), show: vi.fn() };
  const input = {
    releasePointerLock: vi.fn(() => {
      // The screen must already be open before the pointer-lock change event can reopen a menu.
      expect(screen.isOpen).toBe(true);
      game.playing = false;
    }),
    requestPointerLock: vi.fn(),
  };
  const dropStack = vi.fn();
  Object.assign(game, { playing, inventoryScreen: screen, menu, input, inventoryReturnMenu: null, dropStack });
  return { game, screen, menu, input, dropStack };
}

describe('inventory open/close lifecycle (T-K3)', () => {
  it.each(['start', 'paused'] as const)('returns to the %s menu without requesting pointer capture', (mode) => {
    const { game, screen, menu, input } = inventoryGame(false, mode);
    call(game, 'toggleInventory');
    expect(menu.hide).toHaveBeenCalledOnce();
    expect(screen.isOpen).toBe(true);
    expect(input.releasePointerLock).toHaveBeenCalledOnce();
    call(game, 'toggleInventory');
    expect(screen.isOpen).toBe(false);
    expect(menu.show).toHaveBeenCalledWith(mode);
    expect(input.requestPointerLock).not.toHaveBeenCalled();
  });

  it('requests capture only when returning from inventory to play', () => {
    const { game, menu, input } = inventoryGame(true, 'paused');
    call(game, 'toggleInventory');
    call(game, 'toggleInventory');
    expect(input.requestPointerLock).toHaveBeenCalledOnce();
    expect(menu.show).not.toHaveBeenCalled();
  });

  it('clears the originating menu so the next inventory opened from play returns to play', () => {
    const { game, menu, input } = inventoryGame(false, 'start');
    call(game, 'toggleInventory');
    call(game, 'toggleInventory');
    menu.show.mockClear();
    game.playing = true;
    call(game, 'toggleInventory');
    call(game, 'toggleInventory');
    expect(input.requestPointerLock).toHaveBeenCalledOnce();
    expect(menu.show).not.toHaveBeenCalled();
  });

  it('drops only the cursor remainder that did not fit when the screen closes', () => {
    const { game, screen, dropStack } = inventoryGame(false, 'paused');
    call(game, 'toggleInventory');
    screen.hide.mockImplementationOnce(() => { screen.isOpen = false; return [{ state: 1, count: 3 }]; });
    call(game, 'toggleInventory');
    expect(dropStack).toHaveBeenCalledExactlyOnceWith({ state: 1, count: 3 });
  });
});

describe('smoke-test debug hooks', () => {
  it('records the first crack stage shown, and resetBreakStage clears it', () => {
    const game = Object.create(Game.prototype) as Game;
    const breaking = new BlockBreaking();
    const input = { consumeClick: () => false, isMouseDown: () => true, consumeWheel: () => 0 };
    Object.assign(game, {
      breakStageSeen: false,
      breaking,
      input,
      target: { x: 0, y: 4, z: 0 },
      tool: { mode: 'single' },
      actionCooldown: 0,
      held: { swing: vi.fn() },
      breakHardness: () => 0.5, // grass: 10 crack stages over half a second
      breakCell: vi.fn(),
      placeTarget: vi.fn(),
      eatSelected: () => false,
      useBed: () => false,
      useCraftingTable: () => false, useFurnace: () => false,
      placeTargetCheck: vi.fn(),
      setBlock: vi.fn(),
    });
    call(game, 'handleBlockActions', 0.01, { x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 });
    expect(breaking.stage).toBe(0);
    expect(game.breakStageSeen).toBe(true);
    game.resetBreakStage();
    expect(game.breakStageSeen).toBe(false);
    // A stage that the smoke test never polls is still recorded, because the render loop sets the flag every frame.
    call(game, 'handleBlockActions', 0.4, { x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: 0 });
    expect(breaking.stage).toBe(8);
    expect(game.breakStageSeen).toBe(true);
  });

  it('idle skips simulation and rendering, and resuming keeps the game usable', () => {
    const { game, player } = tickingGame();
    game.setIdle(true);
    expect(game['idle']).toBe(true);
    call(game, 'fixedUpdate', FIXED_DT);
    expect(player.update).not.toHaveBeenCalled();
    expect(game.timeOfDay).toBe(0.2);
    game.setIdle(false);
    call(game, 'fixedUpdate', FIXED_DT);
    expect(player.update).toHaveBeenCalledOnce();
    expect(game.timeOfDay).toBeGreaterThan(0.2);
  });

  it('idle is idempotent and does not reset state when applied twice', () => {
    const { game } = tickingGame();
    game.timeOfDay = 0.42;
    game.setIdle(true);
    game.setIdle(true);
    game.setIdle(false);
    game.setIdle(false);
    expect(game.timeOfDay).toBe(0.42);
  });
});

describe('thunder after lightning (T-F14)', () => {
  it('plays one clap per strike once its delay has passed', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0); // the shortest delay
    try {
      const game = Object.create(Game.prototype) as Game;
      const sounds = { play: vi.fn() };
      Object.assign(game, { sounds, weatherRenderer: { strikes: 2 }, seenStrikes: 0, thunderDelays: [] });
      call(game, 'updateThunder', THUNDER_DELAY_MIN_S / 2);
      expect(sounds.play).not.toHaveBeenCalled();
      call(game, 'updateThunder', THUNDER_DELAY_MIN_S / 2);
      expect(sounds.play).toHaveBeenCalledTimes(2);
      expect(sounds.play).toHaveBeenCalledWith('thunder');
      call(game, 'updateThunder', 10); // nothing new struck: no more claps
      expect(sounds.play).toHaveBeenCalledTimes(2);
    } finally {
      random.mockRestore();
    }
  });
});

function modeGame(startedFromSave: boolean) {
  const game = Object.create(Game.prototype) as Game;
  const inventory = new Inventory();
  const screen = { setCreative: vi.fn() };
  Object.assign(game, {
    gameMode: GAME_MODE_CREATIVE, startedFromSave, inventory, inventoryScreen: screen,
    fire: { reset: vi.fn() }, menu: { setGameMode: vi.fn() },
  });
  return { game, inventory, screen };
}

describe('survival acquisition rules (T-I11)', () => {
  it('a world that has not been played yet starts survival with an empty inventory', () => {
    const { game, inventory, screen } = modeGame(false);
    game.setGameMode(GAME_MODE_SURVIVAL);
    expect(inventory.slots.every((s) => s === null)).toBe(true);
    expect(screen.setCreative).toHaveBeenLastCalledWith(false);
    game.setGameMode(GAME_MODE_CREATIVE); // switching back never refills
    expect(inventory.slots.every((s) => s === null)).toBe(true);
    expect(screen.setCreative).toHaveBeenLastCalledWith(true);
  });

  it('keeps the inventory of a saved world, or one the player has already changed', () => {
    const saved = modeGame(true);
    saved.game.setGameMode(GAME_MODE_SURVIVAL);
    expect(saved.inventory.slots).toEqual(startingSlots());

    const changed = modeGame(false);
    changed.inventory.consume(changed.inventory.slots[0]!.state, 1);
    const before = JSON.stringify(changed.inventory.slots);
    changed.game.setGameMode(GAME_MODE_SURVIVAL);
    expect(JSON.stringify(changed.inventory.slots)).toBe(before);
  });
});

function survivor(aimed: number | null) {
  const game = Object.create(Game.prototype) as Game;
  const inventory = new Inventory(new Array(startingSlots().length).fill(null));
  inventory.setSlot(0, BlockId.POTATOES, 2);
  const items = { spawn: vi.fn() };
  const player = { position: { x: 1, y: 2, z: 3 }, setPosition: vi.fn() };
  Object.assign(game, {
    gameMode: GAME_MODE_SURVIVAL, inventory, items, player, hunger: 10, health: 0,
    target: aimed === null ? null : { x: 0, y: 0, z: 0 }, world: { getBlock: () => aimed, topAt: () => 5 },
    sounds: { play: vi.fn() }, fire: { reset: vi.fn() }, spawn: { x: 0, z: 0 }, spawnFeetY: 9,
  });
  return { game, inventory, items, player };
}

describe('eating crops (T-I8)', () => {
  it('eats food in hand unless hunger is full or the aim is on grass or dirt', () => {
    const { game, inventory } = survivor(BlockId.STONE);
    expect(game.eatSelected()).toBe(true);
    expect(game.hunger).toBe(10 + FOOD_HUNGER.potatoes);
    expect(inventory.slots[0]?.count).toBe(1);
    game.hunger = 20;
    expect(game.eatSelected()).toBe(false);
    expect(survivor(BlockId.GRASS).game.eatSelected()).toBe(false); // planted instead
    expect(survivor(null).game.eatSelected()).toBe(true); // aiming at the sky
  });
});

describe('death in survival', () => {
  it('drops everything where the player died and respawns empty-handed', () => {
    const { game, inventory, items, player } = survivor(null);
    call(game, 'die');
    expect(items.spawn).toHaveBeenCalledWith(BlockId.POTATOES, 2, 1, 3, 3, Math.random);
    expect(inventory.slots.every((s) => s === null)).toBe(true);
    expect(player.setPosition).toHaveBeenCalledWith(0, 9, 0);
    expect(game.health).toBe(20);
  });
});

describe('beds (T-I9)', () => {
  function sleeper(timeOfDay: number, aimed: number) {
    const game = Object.create(Game.prototype) as Game;
    const calendar = new Calendar(DAYS_PER_SEASON, WORLD_LATITUDE_DEG);
    Object.assign(game, { timeOfDay, calendar, bed: null, target: { x: 4, y: 7, z: -2 }, world: { getBlock: () => aimed } });
    return { game, calendar };
  }

  it('at night a bed sleeps through to sunrise and sets the respawn point', () => {
    const { game, calendar } = sleeper(0.75, BlockId.BED);
    expect(game.useBed()).toBe(true);
    expect(game.timeOfDay).toBe(0);
    expect(calendar.timeOfYear).toBeCloseTo(0.25 * DAY_LENGTH_S / (DAY_LENGTH_S * 4 * DAYS_PER_SEASON), 12);
    expect(game.bed).toEqual({ x: 4, y: 7, z: -2 });
  });

  it('by day it only sets the respawn point; anything but a bed is ignored', () => {
    const { game } = sleeper(0.3, BlockId.BED);
    expect(game.useBed()).toBe(true);
    expect(game.timeOfDay).toBe(0.3);
    expect(game.bed).toEqual({ x: 4, y: 7, z: -2 });
    expect(sleeper(0.75, BlockId.STONE).game.useBed()).toBe(false);
  });

  it('death respawns on a standing bed, and forgets a broken one', () => {
    const standing = survivor(null);
    Object.assign(standing.game, { bed: { x: 4, y: 7, z: -2 }, ready: true });
    Object.assign(standing.game.world, { isLoadedAt: () => true, getBlock: () => BlockId.BED });
    call(standing.game, 'die');
    expect(standing.game.ready).toBe(false); // trySpawn places the player on the bed once it is meshed
    expect(Reflect.get(standing.game, 'savedPlayer')).toMatchObject({ x: 4.5, z: -1.5 });

    const broken = survivor(null);
    Object.assign(broken.game, { bed: { x: 4, y: 7, z: -2 } });
    Object.assign(broken.game.world, { isLoadedAt: () => true, getBlock: () => BlockId.AIR });
    call(broken.game, 'die');
    expect(broken.game.bed).toBeNull();
    expect(broken.player.setPosition).toHaveBeenCalledWith(0, 9, 0);
  });
});

describe('furnaces in the game (T-I7)', () => {
  function furnaceGame(block: number) {
    const game = Object.create(Game.prototype) as Game;
    const cells = new Map<string, number>([['4,7,-2', block]]);
    const world = { isLoadedAt: () => true, getBlock: (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? BlockId.AIR };
    const setBlock = vi.fn((x: number, y: number, z: number, id: number) => { cells.set(`${x},${y},${z}`, id); return true; });
    const items = { spawn: vi.fn() };
    Object.assign(game, { world, setBlock, items, furnaces: new Map(), openFurnace: null, furnaceRefreshS: 0, target: { x: 4, y: 7, z: -2 },
      menu: { hide: vi.fn(), currentMode: 'paused' }, inventoryScreen: { show: vi.fn(), refresh: vi.fn() }, input: { releasePointerLock: vi.fn() }, playing: true });
    return { game, cells, items };
  }

  it('right click opens a furnace; burning fuel lights the block, which goes out when done', () => {
    const { game, cells } = furnaceGame(BlockId.FURNACE + 1);
    expect(game.useFurnace()).toBe(true);
    const f = Reflect.get(game, 'openFurnace');
    f.slots[0] = { state: BlockId.POTATOES, count: 1 };
    f.slots[1] = { state: BlockId.STICK, count: 2 };
    call(game, 'updateFurnaces', 1);
    expect(cells.get('4,7,-2')).toBe(BlockId.LIT_FURNACE + 1); // keeps its facing
    call(game, 'updateFurnaces', 30);
    expect(cells.get('4,7,-2')).toBe(BlockId.FURNACE + 1);
    expect(f.slots[2]).toEqual({ state: BlockId.BAKED_POTATO, count: 1 });
    expect(furnaceGame(BlockId.STONE).game.useFurnace()).toBe(false);
  });

  it('a furnace whose block is gone spills its contents and is forgotten', () => {
    const { game, cells, items } = furnaceGame(BlockId.FURNACE);
    game.useFurnace();
    Reflect.get(game, 'openFurnace').slots[2] = { state: BlockId.IRON_INGOT, count: 3 };
    cells.set('4,7,-2', BlockId.AIR);
    call(game, 'updateFurnaces', 0.05);
    expect(items.spawn).toHaveBeenCalledWith(BlockId.IRON_INGOT, 3, 4.5, expect.any(Number), -1.5, Math.random);
    expect(Reflect.get(game, 'furnaces').size).toBe(0);
  });
});
