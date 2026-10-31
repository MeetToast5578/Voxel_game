import { describe, expect, it } from 'vitest';
import { BLOCKS } from '../engine/blocks';
import { Chunk } from '../engine/chunk';
import { World } from '../engine/world';
import { mulberry32 } from '../core/random';
import { Environment } from '../sim/environment';
import type { WeatherSample } from '../sim/weather';
import { Play } from '../game/play';
import { Player } from '../game/player';

const S = (key: string) => BLOCKS.state(key);

describe('thunderstorms', () => {
  it('strike only in storms, and thunder follows each strike', () => {
    let strikes = 0, thunders = 0;
    const env = new Environment(1, 0.5, 0, () => thunders++, () => strikes++, mulberry32(4));
    const world = new World();
    const weather = (storm: boolean): WeatherSample =>
      ({ precipitation: 'rain', cloudCover: 1, humidity: 1, storm, windSpeed: 5, seasonC: 0 });
    env.sample = weather(false);
    for (let i = 0; i < 2000; i++) env.frame(0.1, 0, 0, 0, world);
    expect(strikes).toBe(0);
    env.sample = weather(true);
    for (let i = 0; i < 2000; i++) env.frame(0.1, 0, 0, 0, world);
    expect(strikes).toBeGreaterThan(5);
    expect(thunders).toBeGreaterThan(strikes - 3);
  });

  it('scorches the ground it hits and hurts a player in the open, not under a roof', () => {
    const world = new World();
    for (let cx = -1; cx <= 0; cx++) for (let cz = -1; cz <= 0; cz++) for (let cy = -1; cy <= 0; cy++) {
      world.add(new Chunk(cx, cy, cz, cy < 0 ? S('stone') : 0, 0)).skyTop.fill(-1);
    }
    for (let x = -16; x < 16; x++) for (let z = -16; z < 16; z++) world.set(x, -1, z, S('grass'));
    const play = new Play(world, (x, y, z, s) => world.set(x, y, z, s), { sound: () => undefined, sleep: () => true }, 'survival');
    const player = new Player(0.5, 0, 0.5), health = play.survival.health;
    play.strike(1.5, 0.5, player);
    expect(world.get(1, -1, 0)).toBe(S('dirt'));
    expect(play.survival.health).toBeLessThan(health);
    // Under a roof (the column's sky top above the head) the same strike next door does no harm.
    const hurt = play.survival.health;
    world.column(0, 0)!.skyTop[0] = 10;
    play.strike(1.5, 0.5, player);
    expect(play.survival.health).toBe(hurt);
    // Far off it only scorches.
    play.strike(-10.5, -10.5, new Player(0.5, 0, 0.5));
    expect(world.get(-11, -1, -11)).toBe(S('dirt'));
  });
});
