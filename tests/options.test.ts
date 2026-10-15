import { describe, expect, it } from 'vitest';
import { readOptions } from '../src/options';

describe('readOptions', () => {
  it('parses URL parameters', () => {
    expect(readOptions('?seed=42&autostart=1')).toEqual({ seed: 42, autostart: true, nosave: false, workers: true, map: false });
    expect(readOptions('?seed=-7&nosave=1')).toEqual({ seed: -7, autostart: false, nosave: true, workers: true, map: false });
    expect(readOptions('?seed=abc')).toEqual({ seed: null, autostart: false, nosave: false, workers: true, map: false });
    expect(readOptions('')).toEqual({ seed: null, autostart: false, nosave: false, workers: true, map: false });
    expect(readOptions('?workers=0').workers).toBe(false);
    expect(readOptions('?map=1').map).toBe(true);
    expect(readOptions('').map).toBe(false);
  });
});
