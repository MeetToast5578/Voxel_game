import { describe, expect, it, vi } from 'vitest';
import { FIRE_DURATION_S, FIXED_DT, GAME_MODE_CREATIVE, GAME_MODE_SURVIVAL, HEALTH_MAX, PLAYER_HEIGHT } from '../src/config';
import { FireExposure, fluidContact, landingDamage, landingWaterDepth } from '../src/player/fluidHazards';
import { Player, PLAYER_SHAPE, NO_CONTROLS } from '../src/player/player';
import { BlockId, flowingWaterState, flowingLavaState } from '../src/world/blocks';
import { Game } from '../src/game';
import { Inventory } from '../src/player/inventory';

const ground = (_x: number, y: number) => y < 0;
function landing(depth: number, lava = false) {
  const p = new Player(); p.setPosition(0.5, 25, 0.5);
  const liquid = (_x: number, y: number) => y >= 0 && y < depth;
  let impact = 0;
  for (let i = 0; i < 600; i++) {
    p.update(FIXED_DT, NO_CONTROLS, ground, lava ? () => false : liquid, lava ? liquid : () => false);
    if (p.onGround) { impact = p.impactSpeedM_S; break; }
  }
  return { p, impact, blockAt: (_x: number, y: number) => liquid(0, y) ? (lava ? BlockId.LAVA : BlockId.WATER) : BlockId.AIR };
}

function survivalGame(blockAt: (x: number, y: number, z: number) => number) {
  const g = Object.create(Game.prototype) as Game;
  const p = new Player(); p.setPosition(0.5, 0, 0.5);
  Object.assign(g, { player: p, health: HEALTH_MAX, hunger: 20, air: 15, gameMode: GAME_MODE_SURVIVAL,
    fire: new FireExposure(), world: { getBlock: blockAt, topAt: () => 0 },
    menu: { setGameMode: vi.fn() }, inventory: new Inventory(), inventoryScreen: { setCreative: vi.fn() }, startedFromSave: true, items: { spawn: vi.fn() },
    spawn: { x: 8, z: 8 }, spawnFeetY: 1,
  });
  return g;
}
function survival(g: Game, dt: number) { Reflect.apply(Reflect.get(Game.prototype, 'updateSurvival'), g, [dt]); }

describe('water cushions falls (T-G13)', () => {
  it('uses the real collision speed and shallow/deep water reduce damage by depth', () => {
    const dry = landing(0), shallow = landing(1), deep = landing(8);
    expect(dry.impact).toBeGreaterThan(6);
    expect(shallow.impact).toBeGreaterThan(0);
    const dryDamage = landingDamage(dry.impact, 0);
    const shallowDamage = landingDamage(shallow.impact, landingWaterDepth(shallow.p.position, shallow.blockAt));
    expect(shallowDamage).toBeLessThan(dryDamage);
    expect(shallowDamage).toBeGreaterThan(0);
    // A deep pool may keep the player floating instead of ever reaching the bottom.
    expect(deep.p.onGround ? landingDamage(deep.impact, landingWaterDepth(deep.p.position, deep.blockAt)) : 0).toBe(0);
  });
  it('counts actual partial-height water and stops at gaps', () => {
    const p = { x: 0.5, y: 0, z: 0.5 };
    expect(landingWaterDepth(p, (_x, y) => y === 0 ? flowingWaterState(2, false) : BlockId.AIR)).toBeCloseTo(0.075);
    expect(landingWaterDepth(p, (_x, y) => y === 0 || y === 2 ? BlockId.WATER : BlockId.AIR)).toBeCloseTo(0.3);
  });
  it('resets impact after teleport, on non-landings and during flight', () => {
    const { p } = landing(0); expect(p.impactSpeedM_S).toBeGreaterThan(0);
    p.setPosition(0.5, 10, 0.5); expect(p.impactSpeedM_S).toBe(0);
    p.update(FIXED_DT, NO_CONTROLS, ground); expect(p.impactSpeedM_S).toBe(0);
    p.setPosition(0.5, 0.01, 0.5); p.flying = true; p.velocity.y = -30;
    p.update(FIXED_DT, NO_CONTROLS, ground); expect(p.impactSpeedM_S).toBe(0);
  });
  it('the actual survival method applies cushioned rather than height-derived damage', () => {
    const dry = survivalGame(() => BlockId.AIR), wet = survivalGame((_x, y) => y >= 0 && y < 8 ? BlockId.WATER : BlockId.AIR);
    dry.player.impactSpeedM_S = wet.player.impactSpeedM_S = 10; // nonfatal dry impact: inspect damage before respawn
    survival(dry, FIXED_DT); survival(wet, FIXED_DT);
    expect(dry.health).toBeLessThan(HEALTH_MAX); expect(wet.health).toBe(HEALTH_MAX);
  });
});

describe('lava ignition and extinguishing (T-G14)', () => {
  it('detects edge overlaps and excludes thin fluid below the feet', () => {
    const p = { x: 0.5, y: 0.5, z: 0.5 };
    const touching = fluidContact(p, PLAYER_SHAPE, (x, y) => x === 1 && y === 0 ? BlockId.LAVA : BlockId.AIR);
    expect(touching.lava).toBe(true);
    expect(fluidContact(p, PLAYER_SHAPE, (_x, y) => y === 0 ? flowingLavaState(2, false) : BlockId.AIR).lava).toBe(false);
    expect(PLAYER_HEIGHT).toBeGreaterThan(1);
  });
  it('lava burns immediately, continues on dry land, expires exactly, and water extinguishes', () => {
    const f = new FireExposure();
    expect(f.step(0.5, { lava: true, water: false })).toBeGreaterThan(0);
    expect(f.remaining).toBe(FIRE_DURATION_S);
    expect(f.step(0.25, { lava: false, water: false })).toBeGreaterThan(0);
    expect(f.remaining).toBe(FIRE_DURATION_S - 0.25);
    expect(f.step(20, { lava: false, water: false })).toBeCloseTo((FIRE_DURATION_S - 0.25) * 2);
    expect(f.step(1, { lava: false, water: false })).toBe(0);
    f.step(1, { lava: true, water: false });
    expect(f.step(1, { lava: false, water: true })).toBe(0); expect(f.remaining).toBe(0);
    expect(f.step(1, { lava: true, water: true })).toBeGreaterThan(0); expect(f.remaining).toBe(0);
  });
  it('real game wiring damages on contact, stops burning in water and resets on mode changes', () => {
    let liquid: number = BlockId.LAVA;
    const g = survivalGame((_x, y) => y === 0 ? liquid : BlockId.AIR);
    survival(g, 0.25); expect(g.health).toBeLessThan(HEALTH_MAX); expect(g.fire.remaining).toBeGreaterThan(0);
    liquid = BlockId.AIR; const before = g.health; survival(g, 0.25); expect(g.health).toBeLessThan(before);
    liquid = BlockId.WATER; const wet = g.health; survival(g, 0.25); expect(g.health).toBe(wet); expect(g.fire.remaining).toBe(0);
    g.fire.remaining = 4; g.setGameMode(GAME_MODE_CREATIVE); expect(g.fire.remaining).toBe(0);
    const immune = g.health; g.damage(10); expect(g.health).toBe(immune);
    g.setGameMode(GAME_MODE_SURVIVAL); expect(g.health).toBe(HEALTH_MAX);
  });
  it('death clears fire and collision state at respawn', () => {
    const g = survivalGame(() => BlockId.AIR); g.fire.remaining = 4; g.health = 0;
    survival(g, FIXED_DT);
    expect(g.health).toBe(HEALTH_MAX); expect(g.fire.remaining).toBe(0);
    expect(g.player.position).toEqual({ x: 8, y: 1, z: 8 }); expect(g.player.impactSpeedM_S).toBe(0);
  });
});
