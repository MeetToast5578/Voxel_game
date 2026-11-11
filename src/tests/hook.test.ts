import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { COLLISION } from '../game/collision';
import type { Input } from '../game/input';
import { Play } from '../game/play';
import { Player } from '../game/player';

const S = (k: string) => BLOCKS.state(k);

describe('grappling hook', () => {
  it('pulls the player up a cliff, holds them there, and lets go on a jump', () => {
    const world = new World();
    for (let cx = -1; cx <= 1; cx++) for (let cy = -1; cy <= 0; cy++) for (let cz = -1; cz <= 1; cz++) world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0));
    // A cliff ten cells high, six cells away along +x.
    for (let y = 0; y < 10; y++) for (let z = -3; z <= 3; z++) world.set(6, y, z, S('stone'));
    const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
    const player = new Player(0.5, 0, 0.5);
    const actions = new Set<string>();
    const input = { slot: -1, breaking: false, placing: false, moveX: 0, moveZ: 0, jump: false, sprint: false, descend: false, consume: (a: string) => actions.delete(a) } as unknown as Input & { jump: boolean };
    const boxAt = (x: number, y: number, z: number) => COLLISION[world.get(x, y, z)]!;
    const step = (s: number) => { for (let t = 0; t < s; t += 1 / 60) player.update(1 / 60, input, boxAt, () => false); };
    step(0.5);
    // Aim at the cliff face near its top and throw the hook.
    const eye = player.eyeY;
    player.yaw = -Math.PI / 2;
    player.pitch = Math.atan2(9 - eye, 6 - 0.5);
    play.inventory.slots[0] = { state: S('grappling_hook'), count: 1 };
    actions.add('place');
    play.update(0, input, player);
    expect(player.hook).not.toBeNull();
    step(2);
    expect(player.body.y).toBeGreaterThan(6);
    const held = player.body.y;
    step(1);
    expect(Math.abs(player.body.y - held)).toBeLessThan(0.3);
    input.jump = true;
    step(1 / 60);
    expect(player.hook).toBeNull();
  });
});
