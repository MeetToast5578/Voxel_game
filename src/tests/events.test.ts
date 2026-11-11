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
