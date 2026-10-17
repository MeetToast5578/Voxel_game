import { describe, expect, it } from 'vitest';
import { BLOCK_SIZE_M, SEA_LEVEL } from '../src/config';
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
      loaded: 197, meshed: 113, pendingGen: 0, pendingMesh: 2, columns: 81, jobsInFlight: 5, tickRan: 0, tickPending: 0, randomTickRan: 0, randomTickMs: 0, season: 'spring', dayOfSeason: 1, dayLengthMin: 720, renderDistance: 6,
    };
    const lines = formatDebugLines(info);
    expect(lines[0]).toBe('FPS 60');
    expect(lines[1]).toBe('XYZ 12.35 / 65.00 / -3.20');
    expect(lines[2]).toBe('Block 12 65 -4   Chunk 0, 4, -1');
    // elevation is (y - SEA_LEVEL) * BLOCK_SIZE_M, so it depends on the sea level in config
    expect(lines[3]).toBe(`Meters ${(12.345 * BLOCK_SIZE_M).toFixed(1)} / ${(65 * BLOCK_SIZE_M).toFixed(1)} / ${(-3.2 * BLOCK_SIZE_M).toFixed(1)}   Elevation ${((65 - SEA_LEVEL) * BLOCK_SIZE_M).toFixed(1)} m`);
    const atSea = formatDebugLines({ ...info, position: [0, SEA_LEVEL, 0] });
    expect(atSea[3]).toBe(`Meters 0.0 / ${(SEA_LEVEL * BLOCK_SIZE_M).toFixed(1)} / 0.0   Elevation 0.0 m`);
    expect(formatDebugLines({ ...info, position: [0, 30, 0] })[3]).toContain(
      `Elevation ${((30 - SEA_LEVEL) * BLOCK_SIZE_M).toFixed(1)} m`,
    );
    expect(lines).toContain('Target Stone @ 12 64 -4');
    expect(lines).toContain('Columns 81   Jobs in flight 5');
    expect(formatDebugLines({ ...info, target: null, targetName: null })).toContain('Target none');
  });
});
