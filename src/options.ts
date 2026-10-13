export interface GameOptions {
  /** Seed from ?seed=123, or null when absent/invalid. */
  seed: number | null;
  /** ?autostart=1 — start playing without the click-to-play menu (used by automated tests). */
  autostart: boolean;
  /** ?nosave=1 — never read or write the world save (settings are still kept). */
  nosave: boolean;
  /** ?workers=0 — generate and mesh on the main thread instead of in Web Workers. */
  workers: boolean;
}

export function readOptions(search: string): GameOptions {
  const params = new URLSearchParams(search);
  const seedText = params.get('seed');
  const seed = seedText !== null && /^-?\d{1,9}$/.test(seedText) ? Number(seedText) : null;
  return {
    seed,
    autostart: params.get('autostart') === '1',
    nosave: params.get('nosave') === '1',
    workers: params.get('workers') !== '0',
  };
}
