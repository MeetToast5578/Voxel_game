import { describe, expect, it } from 'vitest';
import { TickQueue } from '../src/world/tick';
import { Chunk } from '../src/world/chunk';
import { World } from '../src/world/world';

function tick(x: number, y: number, z: number, due: number, reason: string) {
  return { x, y, z, dueTick: due, reason };
}

describe('TickQueue ordering', () => {
  it('runs ticks in due-tick order regardless of insertion order', () => {
    const q = new TickQueue();
    q.schedule(tick(5, 5, 5, 3, 'c'), 0, 0, 0);
    q.schedule(tick(1, 1, 1, 1, 'a'), 0, 0, 0);
    q.schedule(tick(3, 3, 3, 2, 'b'), 0, 0, 0);
    const order: string[] = [];
    q.run(10, 100, (t: { reason: string }) => {
      order.push(t.reason);
      return 'handled';
    });
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('breaks ties by cell position (x, then y, then z)', () => {
    const q = new TickQueue();
    q.schedule(tick(5, 5, 5, 1, 'z5'), 0, 0, 0);
    q.schedule(tick(1, 5, 5, 1, 'x1'), 0, 0, 0);
    q.schedule(tick(3, 1, 5, 1, 'y1'), 0, 0, 0);
    q.schedule(tick(3, 5, 1, 1, 'z1'), 0, 0, 0);
    const order: string[] = [];
    q.run(10, 100, (t: { reason: string }) => {
      order.push(t.reason);
      return 'handled';
    });
    expect(order).toEqual(['x1', 'y1', 'z1', 'z5']);
  });

  it('skips ticks due in the future', () => {
    const q = new TickQueue();
    q.schedule(tick(1, 1, 1, 5, 'late'), 0, 0, 0);
    q.schedule(tick(2, 2, 2, 1, 'now'), 0, 0, 0);
    const order: string[] = [];
    q.run(1, 100, (t: { reason: string }) => {
      order.push(t.reason);
      return 'handled';
    });
    expect(order).toEqual(['now']);
    expect(q.size).toBe(1);
  });

  it('empty queue costs nothing', () => {
    const q = new TickQueue();
    expect(q.isEmpty).toBe(true);
    expect(q.size).toBe(0);
    const result = q.run(10, 100, () => 'handled');
    expect(result.ran).toBe(0);
    expect(result.handedOff).toEqual([]);
  });

  it('stops when budget is exhausted and keeps the rest', () => {
    const q = new TickQueue();
    for (let i = 0; i < 100; i++) q.schedule(tick(i, 0, 0, 1, `t${i}`), 0, 0, 0);
    let budgetUses = 0;
    q.run(10, 0.001, () => {
      budgetUses++;
      return 'handled';
    });
    expect(budgetUses).toBeLessThan(100);
    expect(q.size).toBeGreaterThan(0);
  });

  it('runs remaining ticks on the next call', () => {
    const q = new TickQueue();
    q.schedule(tick(1, 1, 1, 1, 'first'), 0, 0, 0);
    q.schedule(tick(2, 2, 2, 2, 'second'), 0, 0, 0);
    q.run(1, 100, () => 'handled');
    expect(q.size).toBe(1);
    const order: string[] = [];
    q.run(2, 100, (t: { reason: string }) => {
      order.push(t.reason);
      return 'handled';
    });
    expect(order).toEqual(['second']);
  });
});

describe('TickQueue border handoff', () => {
  it('returns a handoff when a tick is outside this chunk', () => {
    const q = new TickQueue();
    const handoff = q.schedule(tick(100, 5, 5, 1, 'border'), 0, 0, 0);
    expect(handoff).not.toBeNull();
    expect(handoff!.cx).toBe(6);
    expect(handoff!.cy).toBe(0);
    expect(handoff!.cz).toBe(0);
    expect(q.isEmpty).toBe(true);
  });

  it('keeps in-chunk ticks and returns null handoff', () => {
    const q = new TickQueue();
    const handoff = q.schedule(tick(5, 5, 5, 1, 'inside'), 0, 0, 0);
    expect(handoff).toBeNull();
    expect(q.size).toBe(1);
  });
});

describe('World tick integration', () => {
  it('schedules and runs ticks through the world', () => {
    const world = new World(42);
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);

    world.scheduleTick(5, 5, 5, 1, 'first');
    world.scheduleTick(3, 3, 3, 2, 'second');
    world.scheduleTick(7, 7, 7, 1, 'third');

    const stats = world.tickStep(100);
    expect(stats.ran).toBe(2); // dueTick <= 1: first and third
    expect(world.currentTick).toBe(1);
    expect(world.pendingTickCount).toBe(1); // 'second' still pending
  });

  it('pendingTickCount reflects queued ticks', () => {
    const world = new World(42);
    const chunk = new Chunk(0, 0, 0);
    world.addChunk(chunk);
    expect(world.pendingTickCount).toBe(0);
    world.scheduleTick(5, 5, 5, 100, 'far-future');
    expect(world.pendingTickCount).toBe(1);
    world.tickStep(100);
    expect(world.pendingTickCount).toBe(1);
  });

  it('currentTick increments each step', () => {
    const world = new World(42);
    expect(world.currentTick).toBe(0);
    world.tickStep(100);
    expect(world.currentTick).toBe(1);
    world.tickStep(100);
    expect(world.currentTick).toBe(2);
  });
});
