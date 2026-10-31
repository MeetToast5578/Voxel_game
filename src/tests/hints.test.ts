import { describe, expect, it } from 'vitest';
import { Hints, type HintFacts } from '../game/hints';

const key = (b: string) => b.toUpperCase();
const facts = (over: Partial<HintFacts> & { items?: string[] } = {}): HintFacts => ({
  walkedM: 0, screen: 'none', craftSize: 2, night: false, hunger: 20, has: (k) => (over.items ?? []).includes(k), ...over,
});

describe('hints', () => {
  it('walks through the first steps in order, each until it is done', () => {
    const h = new Hints();
    h.update(0.25, facts(), key);
    expect(h.current?.id).toBe('move');
    expect(h.text).toContain('FORWARD');
    h.update(0.25, facts({ walkedM: 10 }), key);
    expect(h.current?.id).toBe('log');
    h.update(0.25, facts({ walkedM: 10, items: ['log'] }), key);
    expect(h.current?.id).toBe('inventory');
  });

  it('passes over steps the player already got past', () => {
    const h = new Hints();
    h.update(0.25, facts({ walkedM: 10, items: ['stone_pickaxe'] }), key);
    expect(h.current).toBeNull();
    expect([...h.done]).toEqual(expect.arrayContaining(['move', 'log', 'planks', 'pickaxe', 'stone']));
  });

  it('shows the night warning when night comes, for a while, and only once', () => {
    const h = new Hints();
    h.update(0.25, facts({ walkedM: 10, night: true }), key);
    expect(h.current?.id).toBe('night');
    for (let t = 0; t < 30; t += 0.25) h.update(0.25, facts({ walkedM: 10, night: true }), key);
    expect(h.current?.id).not.toBe('night');
    expect(h.done.has('night')).toBe(true);
  });

  it('can be dismissed, and remembers what is done across a save', () => {
    const h = new Hints();
    h.update(0.25, facts(), key);
    h.dismiss();
    expect(h.text).toBe('');
    const back = new Hints();
    back.load(JSON.parse(JSON.stringify(h.save())).concat(['nonsense', 3]));
    expect([...back.done]).toEqual(['move']);
  });
});
