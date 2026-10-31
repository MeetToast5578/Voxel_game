import { describe, expect, it } from 'vitest';
import { nearestInDirection, type Box } from '../ui/padMenu';

const box = (x: number, y: number): Box => ({ x, y, w: 40, h: 40 });

describe('gamepad menu navigation', () => {
  // A 3×3 grid of slots 50 px apart, and a wide button below it.
  const grid = [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => box(c * 50, r * 50)));
  const boxes = [...grid, { x: 0, y: 160, w: 140, h: 30 }];

  it('moves to the neighbour in line in each direction', () => {
    const centre = grid[4]!;
    expect(nearestInDirection(centre, boxes, 'right')).toBe(5);
    expect(nearestInDirection(centre, boxes, 'left')).toBe(3);
    expect(nearestInDirection(centre, boxes, 'up')).toBe(1);
    expect(nearestInDirection(centre, boxes, 'down')).toBe(7);
  });

  it('reaches the button below the grid, and finds nothing past the edge', () => {
    expect(nearestInDirection(grid[7]!, boxes, 'down')).toBe(9);
    expect(nearestInDirection(grid[2]!, boxes, 'right')).toBe(-1);
    expect(nearestInDirection(grid[0]!, boxes, 'up')).toBe(-1);
  });
});
