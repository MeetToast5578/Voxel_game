import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { Creatures } from '../creatures/creatures';
import { SPECIES_BY_KEY } from '../creatures/species';
import type { Input } from '../game/input';
import { Play } from '../game/play';
import { Player } from '../game/player';

const S = (k: string) => BLOCKS.state(k);
function setup() {
  const world = new World();
  for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -1; cz <= 1; cz++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
  const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
  const cs = new Creatures(world, () => 0.5, { bite: () => undefined, sound: () => undefined });
  play.creatures = cs;
  return { world, play, cs };
}
const player = () => { const p = new Player(0.5, 0, 0.5); p.yaw = -Math.PI / 2; p.pitch = 0; return p; };
const input = (actions: Set<string>) => ({ slot: -1, breaking: false, placing: false, moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false, consume: (a: string) => actions.delete(a) }) as unknown as Input;

describe('world events', () => {
  it('red nights and slime rain come on some days, never before day 2 or on peaceful, and end at the turn of day', () => {
    const { play } = setup();
    const seen = new Set<string | null>();
    for (let day = 0; day < 80; day++) {
      play.stats.days = day;
      play.turnOfDay(day % 2 === 0);
      if (day < 2) expect(play.event).toBeNull();
      seen.add(play.event);
    }
    expect(seen).toEqual(new Set([null, 'red_night', 'slime_rain']));
    play.difficulty = 'peaceful';
    for (let day = 2; day < 80; day++) { play.stats.days = day; play.turnOfDay(true); expect(play.event).toBeNull(); }
  });

  it('a raid marches on the player\'s town, and beating every raider earns the townsfolk\'s gift', () => {
    const { world, play, cs } = setup();
    for (let cx = -5; cx <= 3; cx++) for (let cz = -2; cz <= 2; cz++) for (let cy = -1; cy <= 0; cy++)
      if (!world.isLoaded(cx * 16, cy * 16, cz * 16)) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
    expect(play.startRaid()).toBe(false); // no town yet
    for (const [x, z] of [[4, 4], [8, 4]]) play.homes.set(`${x},0,${z}`, { x, y: 0, z, yaw: 0, who: 'farmer' });
    expect(play.town).toEqual([6, 0, 4]);
    expect(play.startRaid(() => 0.5)).toBe(true);
    const raiders = cs.list.filter((c) => c.raid);
    expect(raiders).toHaveLength(8);
    for (const c of raiders) expect(c.raid).toEqual([6, 4]);
    // Far from the player, they march on the town.
    const far = (c: (typeof raiders)[number]) => Math.hypot(c.body.x - 6, c.body.z - 4);
    const before = raiders.map(far);
    const ctx = { player: { x: 40, y: 0, z: 4, vx: 0, vy: 0, vz: 0, halfWidth: 0.47, height: 2.9, onGround: true }, survival: true, day: false, hostiles: 1,
      boxAt: () => 0, waterAt: () => false } as const;
    for (let i = 0; i < 60 * 3; i++) cs.update(1 / 60, { ...ctx, boxAt: (_x: number, y: number) => (y < 0 ? 1 : 0) });
    expect(raiders.filter((c, i) => far(c) < before[i]!).length).toBeGreaterThan(4);
    // Beating every raider: coins and a life crystal.
    const p = player(), actions = new Set<string>();
    play.inventory.slots[0] = { state: S('jade_sword'), count: 1 };
    for (const c of raiders) {
      cs.list.splice(cs.list.indexOf(c), 1);
      cs.add(c.species, 2.5, 0, 0.5, 1).raid = c.raid;
      actions.add('break');
      play.update(1, input(actions), p);
    }
    expect(play.raidLeft).toBe(0);
    expect(play.drops.list.map((d) => BLOCKS.type(d.stack.state).key)).toEqual(expect.arrayContaining(['trade_coin', 'life_crystal']));
  });

  it('beating enough slimes in slime rain brings the Slime King', () => {
    const { play, cs } = setup();
    play.event = 'slime_rain';
    const p = player(), actions = new Set<string>();
    play.inventory.slots[0] = { state: S('jade_sword'), count: 1 };
    for (let i = 0; i < 25; i++) {
      cs.add(SPECIES_BY_KEY.get('slime')!, 2.5, 0, 0.5, 1);
      actions.add('break');
      play.update(1, input(actions), p);
    }
    expect(play.event).toBeNull();
    expect(cs.list.some((c) => c.species.key === 'king_slime')).toBe(true);
  });

  it('a boss leaves a treasure bag that opens into its loot', () => {
    const { play, cs } = setup();
    const p = player(), actions = new Set(['break']);
    cs.add(SPECIES_BY_KEY.get('king_slime')!, 2.5, 0, 0.5, 1);
    play.inventory.slots[0] = { state: S('jade_sword'), count: 1 };
    play.update(1, input(actions), p);
    expect(play.drops.list.map((d) => BLOCKS.type(d.stack.state).key)).toEqual(['king_slime_bag']);
    play.inventory.slots[1] = { state: S('king_slime_bag'), count: 1 };
    play.inventory.selected = 1;
    p.pitch = 1.2;
    actions.add('place');
    play.update(0, input(actions), p);
    expect(play.inventory.count(S('gel'))).toBe(30);
    expect(play.inventory.count(S('trade_coin'))).toBe(25);
  });
});

describe('places to find', () => {
  type Inner = { mimicAt(key: string, x: number, y: number, z: number, state: number): boolean; chestSlots(key: string, state: number): unknown };
  it('some vault chests are mimics, the same ones every time; a player chest never is', async () => {
    const { hash2 } = await import('../core/random');
    const { play, cs } = setup();
    const y = -120, z = 0, chest = S('chest');
    const x = Array.from({ length: 200 }, (_, i) => i).find((x) => hash2(play.seed + 600, x + y * 7, z) < 0.15)!;
    const inner = play as unknown as Inner;
    expect(inner.mimicAt(`${x},${y},${z}`, x, y, z, chest)).toBe(true);
    expect(cs.list.map((c) => c.species.key)).toEqual(['mimic']);
    const safe = Array.from({ length: 200 }, (_, i) => i).find((x) => hash2(play.seed + 600, x + y * 7, z) >= 0.15)!;
    expect(inner.mimicAt(`${safe},${y},${z}`, safe, y, z, chest)).toBe(false);
    // A chest already opened (or placed by the player, which starts empty) is never a mimic.
    play.chests.set(`${x},${y},${z}`, []);
    expect(inner.mimicAt(`${x},${y},${z}`, x, y, z, chest)).toBe(false);
  });

  it('a chest on a sky island rolls the sky table, with its featherfall charm', async () => {
    const { Generator } = await import('../worldgen/generator');
    const { sitesNear, structureCells } = await import('../worldgen/structures');
    const { play } = setup();
    play.seed = 1;
    const gen = new Generator(1), island = sitesNear(1, -900, -900, 900, 900).find((s) => s.kind === 'sky_island' && gen.structureBase(s.kind, s.x, s.z) !== null)!;
    const [dx, y, dz] = structureCells(1, 'sky_island', island.x, island.z, gen.structureBase('sky_island', island.x, island.z)!).find(([, , , st]) => BLOCKS.type(st).key === 'chest')!;
    const slots = (play as unknown as Inner).chestSlots(`${island.x + dx},${y},${island.z + dz}`, S('chest')) as ({ state: number } | null)[];
    expect(slots.some((s) => s && BLOCKS.type(s.state).key === 'feather_charm')).toBe(true);
    expect(play.found.has('sky')).toBe(true);
  });
});

describe('meteors', () => {
  it('a meteor digs a crater with meteorite in its floor and marks it for the compass', () => {
    const world = new World();
    for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) for (let cy = -1; cy <= 0; cy++) {
      const col = world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
      col.surface.fill(-1);
    }
    const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
    let seq = 0;
    expect(play.meteor(() => [0, 0][seq++] ?? 0.5)).toBe(true);
    let meteorite = 0;
    for (let x = 30; x < 50; x++) for (let z = -10; z < 10; z++) for (let y = -6; y < 2; y++) if (BLOCKS.type(world.get(x, y, z)).key === 'meteorite') meteorite++;
    expect(meteorite).toBeGreaterThan(5);
    expect(play.markers.at(-1)?.name).toBe('Fallen meteor');
  });
});
