import { describe, expect, it } from 'vitest';
import { musicPlace, THEMES } from '../audio/ambience';

describe('music', () => {
  it('plays each place its own theme: boss fights first, then the Depths, caves, towns, day and night', () => {
    const at = (o: Partial<Parameters<typeof musicPlace>[0]>) => musicPlace({ boss: false, depthM: 10, depthsTopM: -220, underground: false, town: false, day: true, ...o });
    expect(at({})).toBe('day');
    expect(at({ day: false })).toBe('night');
    expect(at({ town: true })).toBe('town');
    expect(at({ underground: true, depthM: -40 })).toBe('cave');
    expect(at({ underground: true, depthM: -240 })).toBe('depths');
    expect(at({ boss: true, underground: true, depthM: -240 })).toBe('boss');
    // Every place sounds different, and boss music comes back quickly.
    expect(new Set(Object.values(THEMES).map((t) => `${t.root}/${t.scale.join()}/${t.beat}`)).size).toBe(6);
    expect(THEMES.boss.gap[1]).toBeLessThan(10);
  });
});
