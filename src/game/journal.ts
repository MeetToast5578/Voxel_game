import type { LootTable } from './loot';

/** Running totals for the journal and the death screen. */
export interface Stats {
  days: number;
  walkedM: number;
  deaths: number;
  killed: number;
  mined: number;
}

/** What milestones look at. */
export interface JournalFacts {
  has(key: string): boolean;
  stats: Stats;
  /** Deepest the player has been, in meters (negative below sea level). */
  deepestM: number;
  biomes: number;
  found: ReadonlySet<LootTable>;
  armour: boolean;
  beacon: boolean;
}

const anyOf = (f: JournalFacts, ...keys: string[]) => keys.some((k) => f.has(k));

/** The milestones of a world, in rough order of play. */
export const MILESTONES: readonly { id: string; name: string; done(f: JournalFacts): boolean }[] = [
  { id: 'wood', name: 'Got wood', done: (f) => anyOf(f, 'log', 'planks') },
  { id: 'table', name: 'Built a crafting table', done: (f) => f.has('crafting_table') },
  { id: 'stone', name: 'Made stone tools', done: (f) => anyOf(f, 'stone_pickaxe', 'stone_axe', 'stone_sword') },
  { id: 'night', name: 'Survived a night', done: (f) => f.stats.days >= 1 },
  { id: 'cooked', name: 'Cooked a meal', done: (f) => anyOf(f, 'cooked_meat', 'baked_potato') },
  { id: 'iron', name: 'Made iron tools', done: (f) => anyOf(f, 'iron_pickaxe', 'iron_axe', 'iron_sword') },
  { id: 'armour', name: 'Put on armour', done: (f) => f.armour },
  { id: 'bow', name: 'Made a bow', done: (f) => f.has('bow') },
  { id: 'deep50', name: 'Went 50 m below sea level', done: (f) => f.deepestM <= -50 },
  { id: 'deep150', name: 'Went 150 m below sea level', done: (f) => f.deepestM <= -150 },
  { id: 'biomes', name: 'Visited five biomes', done: (f) => f.biomes >= 5 },
  { id: 'surface', name: 'Found a ruin or a camp', done: (f) => f.found.has('surface') },
  { id: 'mine', name: 'Found an old mine', done: (f) => f.found.has('mine') },
  { id: 'vault', name: 'Found a deep vault', done: (f) => f.found.has('vault') },
  { id: 'diamond', name: 'Found a diamond', done: (f) => f.has('diamond') },
  { id: 'shrine', name: 'Found an ember shrine', done: (f) => f.found.has('shrine') },
  { id: 'ember', name: 'Mined an ember crystal', done: (f) => f.has('ember_crystal') },
  { id: 'hunter', name: 'Defeated 25 creatures', done: (f) => f.stats.killed >= 25 },
  { id: 'week', name: 'Survived seven nights', done: (f) => f.stats.days >= 7 },
  { id: 'beacon', name: 'Lit the beacon', done: (f) => f.beacon },
];

/** Which milestones are reached (saved per world). `update` returns the names of the ones reached just now. */
export class Journal {
  readonly done = new Set<string>();

  update(f: JournalFacts): string[] {
    const fresh: string[] = [];
    for (const m of MILESTONES) {
      if (this.done.has(m.id) || !m.done(f)) continue;
      this.done.add(m.id);
      fresh.push(m.name);
    }
    return fresh;
  }

  save(): string[] {
    return [...this.done];
  }

  load(saved: unknown): void {
    if (Array.isArray(saved)) for (const id of saved) if (MILESTONES.some((m) => m.id === id)) this.done.add(id);
  }
}
