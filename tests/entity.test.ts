import { describe, expect, it } from 'vitest';
import { EntitySystem } from '../src/world/entity';

function neverSolid(): boolean {
  return false;
}

function floorAt(floorY: number) {
  return (_x: number, y: number, _z: number) => y <= floorY;
}

describe('EntitySystem', () => {
  it('spawns entities with unique IDs', () => {
    const es = new EntitySystem();
    const id1 = es.spawn('test', 0, 10, 0, 0.4, 1.8);
    const id2 = es.spawn('test', 1, 10, 0, 0.4, 1.8);
    expect(id1).not.toBe(id2);
    expect(es.get(id1)?.type).toBe('test');
    expect(es.get(id2)?.type).toBe('test');
    expect(es.count).toBe(2);
  });

  it('despawn removes an entity', () => {
    const es = new EntitySystem();
    const id = es.spawn('test', 0, 10, 0, 0.4, 1.8);
    expect(es.count).toBe(1);
    expect(es.despawn(id)).toBe(true);
    expect(es.count).toBe(0);
    expect(es.get(id)).toBeUndefined();
    expect(es.despawn(id)).toBe(false); // already gone
  });

  it('entity falls under gravity and rests on a floor', () => {
    const es = new EntitySystem();
    const id = es.spawn('test', 0, 50, 0, 0.4, 1.8);
    const isSolid = floorAt(0);
    for (let i = 0; i < 200; i++) es.step(1 / 60, isSolid);
    const e = es.get(id)!;
    expect(e.onGround).toBe(true);
    expect(e.y).toBeGreaterThan(0.5);
    expect(e.y).toBeLessThan(1.5); // resting on floor at y=0, feet at ~1
    expect(e.vy).toBeCloseTo(0, -1); // no longer falling
  });

  it('entity does not fall through the floor', () => {
    const es = new EntitySystem();
    const id = es.spawn('test', 0, 10, 0, 0.4, 1.8);
    const isSolid = floorAt(0);
    for (let i = 0; i < 1000; i++) es.step(1 / 60, isSolid);
    const e = es.get(id)!;
    expect(e.y).toBeGreaterThan(0); // never below floor
  });

  it('entity stops sliding due to friction', () => {
    const es = new EntitySystem();
    const id = es.spawn('test', 0, 1, 0, 0.4, 1.8);
    es.get(id)!.vx = 10; // fast sideways
    const isSolid = floorAt(0);
    // Let it settle on the ground first
    for (let i = 0; i < 10; i++) es.step(1 / 60, isSolid);
    const vxBefore = es.get(id)!.vx;
    for (let i = 0; i < 100; i++) es.step(1 / 60, isSolid);
    const vxAfter = es.get(id)!.vx;
    expect(Math.abs(vxAfter)).toBeLessThan(Math.abs(vxBefore));
  });

  it('entity in empty space keeps falling forever', () => {
    const es = new EntitySystem();
    const id = es.spawn('test', 0, 50, 0, 0.4, 1.8);
    for (let i = 0; i < 100; i++) es.step(1 / 60, neverSolid);
    const e = es.get(id)!;
    expect(e.onGround).toBe(false);
    expect(e.y).toBeLessThan(50); // fell down
  });
});
