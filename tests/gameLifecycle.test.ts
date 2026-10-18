import { describe, expect, it, vi } from 'vitest';
import { DAY_LENGTH_S, DAYS_PER_SEASON, FIXED_DT, GAME_MODE_CREATIVE, WORLD_LATITUDE_DEG } from '../src/config';
import { Game } from '../src/game';
import { Calendar } from '../src/world/calendar';

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
    spawnBrokenBlocks: vi.fn(), collectItems: vi.fn(), updateFootsteps: vi.fn(),
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
    hide: vi.fn(() => { screen.isOpen = false; return null as { state: number; count: number } | null; }),
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
    screen.hide.mockImplementationOnce(() => { screen.isOpen = false; return { state: 1, count: 3 }; });
    call(game, 'toggleInventory');
    expect(dropStack).toHaveBeenCalledExactlyOnceWith({ state: 1, count: 3 });
  });
});
