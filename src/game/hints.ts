import type { Binding } from '../storage/settings';

/** What the hints look at, gathered each update. */
export interface HintFacts {
  /** Meters walked in this world so far. */
  walkedM: number;
  /** Whether the inventory holds an item of this type key. */
  has(key: string): boolean;
  screen: string;
  craftSize: number;
  /** Evening or night. */
  night: boolean;
  hunger: number;
}

interface Hint {
  id: string;
  text(key: (b: Binding) => string): string;
  /** Shown only while this holds (default: always). */
  when?(f: HintFacts): boolean;
  /** Done once this holds while it is the current hint. */
  done?(f: HintFacts): boolean;
  /** Done after being shown this many seconds. */
  showS?: number;
}

const anyOf = (f: HintFacts, ...keys: string[]) => keys.some((k) => f.has(k));
const PICKAXES = ['wooden_pickaxe', 'stone_pickaxe', 'iron_pickaxe'];

/**
 * Situational hints first (they can come at any time), then the first steps in order: the first that is neither done
 * nor waiting for its moment is shown. A step the player has already got past is passed over at once.
 */
export const HINTS: readonly Hint[] = [
  { id: 'night', when: (f) => f.night, showS: 25,
    text: () => 'Night is coming and monsters with it. Build a shelter, light it with torches (coal over a stick), or sleep in a bed.' },
  { id: 'hungry', when: (f) => f.hunger < 12, showS: 30,
    text: () => 'You are getting hungry. Hunt animals and cook the meat in a furnace, or farm, then hold food and right-click to eat.' },
  { id: 'move', done: (f) => f.walkedM > 8, text: (k) => `Walk with ${k('forward')} ${k('left')} ${k('back')} ${k('right')}, jump with ${k('jump')}, and look around with the mouse.` },
  { id: 'log', done: (f) => anyOf(f, 'log', 'planks', 'crafting_table', ...PICKAXES), text: () => 'Hold the left mouse button on a tree trunk to break it and collect a log.' },
  { id: 'inventory', done: (f) => f.screen === 'inventory' || anyOf(f, 'planks', 'crafting_table', ...PICKAXES), text: (k) => `Press ${k('inventory')} to open your inventory.` },
  { id: 'planks', done: (f) => anyOf(f, 'planks', 'crafting_table', ...PICKAXES), text: () => 'Put a log in the crafting grid and take the planks it makes from the right. The recipe list below the grid can fill it for you.' },
  { id: 'table', done: (f) => f.craftSize === 3 || anyOf(f, ...PICKAXES),
    text: () => 'Craft a crafting table from four planks. Place it with right click, then right-click it for a bigger grid.' },
  { id: 'pickaxe', done: (f) => anyOf(f, ...PICKAXES), text: () => 'At the table make sticks (two planks), then a wooden pickaxe: three planks over two sticks.' },
  { id: 'stone', done: (f) => anyOf(f, 'stone_pickaxe', 'iron_pickaxe'), text: () => 'Mine stone with your pickaxe for cobblestone, and make stone tools: they are faster and last longer.' },
];

/** Which hint to show, which are done (saved per world), and how long the current one has been up. */
export class Hints {
  readonly done = new Set<string>();
  current: Hint | null = null;
  /** The current hint's text, with the player's keys, or ''. */
  text = '';
  private shownS = 0;

  /** Moves on to the hint to show now. Returns whether what is shown changed. */
  update(dt: number, f: HintFacts, key: (b: Binding) => string): boolean {
    const before = this.text;
    if (this.current && this.current === this.pick(f)) {
      this.shownS += dt;
      if ((this.current.showS !== undefined && this.shownS >= this.current.showS) || this.current.done?.(f)) this.finish();
    }
    const next = this.pick(f);
    if (next !== this.current) {
      this.current = next;
      this.shownS = 0;
    }
    this.text = this.current ? this.current.text(key) : '';
    return this.text !== before;
  }

  /** Hides the current hint for good. */
  dismiss(): void {
    if (this.current) this.finish();
    this.text = '';
  }

  private finish(): void {
    this.done.add(this.current!.id);
    this.current = null;
  }

  private pick(f: HintFacts): Hint | null {
    for (const h of HINTS) {
      if (this.done.has(h.id) || (h.when && !h.when(f))) continue;
      // A first step already got past (but not the situational ones, which wait for their time on screen).
      if (!h.when && h.done?.(f)) {
        this.done.add(h.id);
        continue;
      }
      return h;
    }
    return null;
  }

  save(): string[] {
    return [...this.done];
  }

  load(saved: unknown): void {
    if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string' && HINTS.some((h) => h.id === id)) this.done.add(id);
  }
}
