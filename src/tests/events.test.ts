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
