import { describe, expect, it } from 'vitest';
import { NO_CONTROLS, Player } from '../src/player/player';

const DT = 1 / 60;
const ground = (_x: number, _y: number, _z: number) => _y < 10; // flat ground, surface at y = 10
function run(p: Player, steps: number, controls = NO_CONTROLS, solid = ground): void {
  for (let i = 0; i < steps; i++) p.update(DT, controls, solid);
}
function standing(): Player {
  const p = new Player();
  p.setPosition(0.5, 10, 0.5);
  run(p, 5);
  return p;
}

describe('Player', () => {
  it('falls and lands', () => {
    const p = new Player();
    p.setPosition(0.5, 12, 0.5);
    run(p, 120);
    expect(p.onGround).toBe(true);
    expect(p.position.y).toBeCloseTo(10, 2);
  });
  it('walks toward -Z at yaw 0 and toward -X at yaw PI/2', () => {
    const p = standing();
    run(p, 60, { ...NO_CONTROLS, forward: true });
    expect(p.position.z).toBeLessThan(0.5 - 3.5);
    expect(p.position.x).toBeCloseTo(0.5, 6);
    const q = standing();
    q.yaw = Math.PI / 2;
    run(q, 60, { ...NO_CONTROLS, forward: true });
    expect(q.position.x).toBeLessThan(0.5 - 3.5);
    expect(q.position.z).toBeCloseTo(0.5, 6);
  });
  it('strafes right toward +X at yaw 0', () => {
    const p = standing();
    run(p, 30, { ...NO_CONTROLS, right: true });
    expect(p.position.x).toBeGreaterThan(1.5);
  });
  it('sprints faster than it walks', () => {
    const a = standing();
    const b = standing();
    run(a, 60, { ...NO_CONTROLS, forward: true });
    run(b, 60, { ...NO_CONTROLS, forward: true, sprint: true });
    expect(b.position.z).toBeLessThan(a.position.z - 1);
  });
  it('jumps between 1.15 and 1.4 blocks high', () => {
    const p = standing();
    p.update(DT, { ...NO_CONTROLS, jump: true }, ground);
    let maxY = p.position.y;
    for (let i = 0; i < 60; i++) {
      p.update(DT, NO_CONTROLS, ground);
      maxY = Math.max(maxY, p.position.y);
    }
    expect(maxY - 10).toBeGreaterThan(1.15);
    expect(maxY - 10).toBeLessThan(1.4);
    expect(p.onGround).toBe(true);
  });
  it('is stopped by a wall', () => {
    const wall = (x: number, y: number) => y < 10 || x >= 5;
    const p = standing();
    p.yaw = -Math.PI / 2; // facing +X
    run(p, 120, { ...NO_CONTROLS, forward: true }, wall);
    expect(p.position.x).toBeLessThanOrEqual(5 - 0.3 + 1e-3);
    expect(p.position.x).toBeGreaterThan(4.6);
  });
  it('flies up, hovers without input, and stops flying on landing', () => {
    const p = standing();
    p.toggleFlying();
    run(p, 60, { ...NO_CONTROLS, jump: true });
    expect(p.position.y).toBeGreaterThan(18);
    const y = p.position.y;
    run(p, 60);
    expect(p.position.y).toBeLessThan(y + 1.5);
    expect(p.flying).toBe(true);
    run(p, 240, { ...NO_CONTROLS, descend: true });
    expect(p.flying).toBe(false);
    expect(p.position.y).toBeCloseTo(10, 2);
  });
  it('lookDirection follows yaw/pitch conventions', () => {
    const p = new Player();
    const d = p.lookDirection();
    expect([d.x + 0, d.y + 0, d.z]).toEqual([0, 0, -1]);
    p.yaw = Math.PI / 2;
    expect(p.lookDirection().x).toBeCloseTo(-1);
    p.yaw = 0;
    p.pitch = Math.PI / 2 - 0.001;
    expect(p.lookDirection().y).toBeCloseTo(1, 3);
  });
  it('addLook clamps pitch and keeps yaw in [-PI, PI)', () => {
    const p = new Player();
    p.addLook(0, -100000, 0.01);
    expect(p.pitch).toBeLessThan(Math.PI / 2);
    expect(p.pitch).toBeGreaterThan(1.5);
    p.addLook(100000, 0, 0.01);
    expect(p.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(p.yaw).toBeLessThan(Math.PI);
    const q = new Player();
    q.addLook(10, 0, 0.01); // mouse right => turn right => yaw decreases
    expect(q.yaw).toBeCloseTo(-0.1);
  });
  it('eyePosition interpolates between the previous and current position', () => {
    const p = new Player();
    p.setPosition(0, 10, 0);
    p.position.x = 1;
    expect(p.eyePosition(0.5).x).toBeCloseTo(0.5);
    expect(p.eyePosition(1).y).toBeCloseTo(10 + 1.62);
  });
});
