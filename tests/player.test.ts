import { describe, expect, it } from 'vitest';
import { PLAYER_HALF_WIDTH, TERMINAL_VELOCITY, metersToBlocks } from '../src/config';
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
  it('walks into a 2 m tunnel but not a 1.5 m one (T-C2 headless proxy)', () => {
    // Open ground for z > -2, then a tunnel heading -Z whose roof is `height` metres above the floor.
    const tunnel = (height: number) => (x: number, y: number, z: number) =>
      y < 10 || (z <= -2 && y >= 10 + Math.round(metersToBlocks(height)));
    for (const [height, enters] of [[2, true], [1.5, false]] as const) {
      const p = standing();
      run(p, 120, { ...NO_CONTROLS, forward: true }, tunnel(height));
      expect(p.position.z < -3).toBe(enters);
    }
  });

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
  it('jumps about 1.35 m high', () => {
    const p = standing();
    p.update(DT, { ...NO_CONTROLS, jump: true }, ground);
    let maxY = p.position.y;
    for (let i = 0; i < 60; i++) {
      p.update(DT, NO_CONTROLS, ground);
      maxY = Math.max(maxY, p.position.y);
    }
    expect(maxY - 10).toBeGreaterThanOrEqual(metersToBlocks(1.2));
    expect(maxY - 10).toBeLessThan(metersToBlocks(1.5));
    expect(p.onGround).toBe(true);
  });
  it('is stopped by a wall', () => {
    const wall = (x: number, y: number) => y < 10 || x >= 5;
    const p = standing();
    p.yaw = -Math.PI / 2; // facing +X
    run(p, 120, { ...NO_CONTROLS, forward: true }, wall);
    expect(p.position.x).toBeLessThanOrEqual(5 - PLAYER_HALF_WIDTH + 1e-3);
    expect(p.position.x).toBeGreaterThan(5 - PLAYER_HALF_WIDTH - 0.05);
  });
  it('flies up, hovers without input, and stops flying on landing', () => {
    const p = standing();
    p.toggleFlying();
    run(p, 60, { ...NO_CONTROLS, jump: true });
    expect(p.position.y).toBeGreaterThan(10 + metersToBlocks(4.8));
    const y = p.position.y;
    run(p, 60);
    expect(p.position.y).toBeLessThan(y + metersToBlocks(0.9));
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
    expect(p.eyePosition(1).y).toBeCloseTo(10 + metersToBlocks(1.62));
  });

  describe('body size (1 block = 0.3 m, player about 6 blocks tall)', () => {
    it('fits a 2-wide, 6-high corridor', () => {
      const corridor = (x: number, y: number) => y < 10 || y >= 16 || x === -1 || x === 2;
      const p = new Player();
      p.setPosition(1, 10, 0.5);
      run(p, 5, NO_CONTROLS, corridor);
      p.yaw = Math.PI; // facing +Z
      run(p, 60, { ...NO_CONTROLS, forward: true }, corridor);
      expect(p.position.z - 0.5).toBeGreaterThanOrEqual(3);
      expect(p.position.x).toBeCloseTo(1, 9);
      expect(p.position.y).toBeCloseTo(10, 3);
      expect(p.onGround).toBe(true);
    });
    it('does not fit under a ceiling 4 blocks high', () => {
      const lowCeiling = (_x: number, y: number, z: number) => y < 10 || (y === 14 && z >= 3);
      const p = new Player();
      p.setPosition(0.5, 10, 0.5);
      run(p, 5, NO_CONTROLS, lowCeiling);
      p.yaw = Math.PI; // facing +Z
      run(p, 120, { ...NO_CONTROLS, forward: true }, lowCeiling);
      expect(p.position.z).toBeCloseTo(3 - PLAYER_HALF_WIDTH, 3);
    });
    it('does not tunnel through a 1-block floor at terminal velocity', () => {
      const thinFloor = (_x: number, y: number) => y === 0;
      const p = new Player();
      p.setPosition(0.5, 200, 0.5);
      p.velocity.y = -TERMINAL_VELOCITY;
      run(p, 600, NO_CONTROLS, thinFloor);
      expect(p.onGround).toBe(true);
      expect(p.position.y).toBeCloseTo(1, 3);
    });
  });
});
