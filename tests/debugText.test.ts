import { describe, expect, it } from 'vitest';
import { compassDirection, formatDebugLines, type DebugInfo } from '../src/ui/debugText';

describe('debugText', () => {
  it('compassDirection follows the yaw convention', () => {
    expect(compassDirection(0)).toBe('north');
    expect(compassDirection(Math.PI / 2)).toBe('west');
    expect(compassDirection(Math.PI)).toBe('south');
    expect(compassDirection(-Math.PI)).toBe('south');
    expect(compassDirection(-Math.PI / 2)).toBe('east');
    expect(compassDirection(0.3)).toBe('north');
  });
  it('formats the overlay lines', () => {
    const info: DebugInfo = {
      fps: 60, seed: 1, position: [12.345, 65, -3.2], yaw: 0, pitch: -0.1, onGround: true, flying: false,
      target: [12, 64, -4], targetName: 'Stone', selectedBlock: 'Dirt',
      loaded: 197, meshed: 113, pendingGen: 0, pendingMesh: 2, renderDistance: 6,
    };
    const lines = formatDebugLines(info);
    expect(lines[0]).toBe('FPS 60');
    expect(lines[1]).toBe('XYZ 12.35 / 65.00 / -3.20');
    expect(lines[2]).toBe('Block 12 65 -4   Chunk 0 -1');
    expect(lines).toContain('Target Stone @ 12 64 -4');
    expect(formatDebugLines({ ...info, target: null, targetName: null })).toContain('Target none');
  });
});
