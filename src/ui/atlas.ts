import { BLOCKS } from '../engine/blocks';
import type { World } from '../engine/world';
import { TILE_NAMES, TILE_SIZE, tilePixels } from '../render/tilePixels';

/** Cells per map pixel: 2 cells (1.2 m). */
export const MAP_SCALE = 2;
/** Map pixels per side of a stored region. */
const REGION = 64;

/**
 * The land the player has seen, as one RGB colour per map pixel, kept in regions of 64 × 64 pixels (77 m square).
 * Colour 0, 0, 0 is unknown; known pixels are never fully black.
 */
export class Atlas {
  private readonly regions = new Map<string, Uint8Array>();
  /** Base64 of each region as last saved; dropped when the region changes. */
  private readonly encoded = new Map<string, string>();
  private readonly colours = new Map<number, readonly [number, number, number]>();

  /** Average colour of a block's top tile, cached per type. */
  private colour(state: number): readonly [number, number, number] {
    const t = BLOCKS.type(state);
    const hit = this.colours.get(t.id);
    if (hit) return hit;
    const pixels = tilePixels(), layer = TILE_NAMES.indexOf(t.tiles.top), n = TILE_SIZE * TILE_SIZE;
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < n; i++) {
      const o = (layer * n + i) * 4;
      if (pixels[o + 3]! < 128) continue;
      r += pixels[o]!;
      g += pixels[o + 1]!;
      b += pixels[o + 2]!;
      count++;
    }
    const c = count ? [r / count, g / count, b / count] as const : [0, 0, 0] as const;
    this.colours.set(t.id, c);
    return c;
  }

  private region(rx: number, rz: number, create: boolean): Uint8Array | undefined {
    const key = `${rx},${rz}`;
    let r = this.regions.get(key);
    if (!r && create) this.regions.set(key, (r = new Uint8Array(REGION * REGION * 3)));
    return r;
  }

  /** Colour of map pixel (mx, mz), or null if never seen. */
  at(mx: number, mz: number): [number, number, number] | null {
    const r = this.region(Math.floor(mx / REGION), Math.floor(mz / REGION), false);
    if (!r) return null;
    const o = ((mz - Math.floor(mz / REGION) * REGION) * REGION + (mx - Math.floor(mx / REGION) * REGION)) * 3;
    return r[o] || r[o + 1] || r[o + 2] ? [r[o]!, r[o + 1]!, r[o + 2]!] : null;
  }

  /** Records the loaded land within `radius` map pixels of the cell (px, pz), shaded by slope. */
  record(world: World, px: number, pz: number, radius: number): void {
    const cx = Math.floor(px / MAP_SCALE), cz = Math.floor(pz / MAP_SCALE);
    const height = (x: number, z: number) => world.column(x >> 4, z >> 4)?.skyTop[((z & 15) << 4) | (x & 15)];
    for (let mz = cz - radius; mz < cz + radius; mz++) {
      for (let mx = cx - radius; mx < cx + radius; mx++) {
        const x = mx * MAP_SCALE, z = mz * MAP_SCALE, h = height(x, z);
        if (h === undefined || !world.isLoaded(x, h, z)) continue;
        const c = this.colour(world.get(x, h, z));
        // Lit from the north-west: rising ground brighter, falling ground darker.
        const shade = Math.max(0.6, Math.min(1.35, 1 + (h - (height(x - MAP_SCALE, z - MAP_SCALE) ?? h)) * 0.08));
        const rx = Math.floor(mx / REGION), rz = Math.floor(mz / REGION), r = this.region(rx, rz, true)!;
        const o = ((mz - rz * REGION) * REGION + (mx - rx * REGION)) * 3;
        for (let k = 0; k < 3; k++) r[o + k] = Math.max(1, Math.min(255, Math.round(c[k]! * shade)));
        this.encoded.delete(`${rx},${rz}`);
      }
    }
  }

  /** The regions as [rx, rz, base64 RGB], for the world save. */
  save(): [number, number, string][] {
    return [...this.regions].map(([key, r]) => {
      const [rx, rz] = key.split(',').map(Number) as [number, number];
      let b64 = this.encoded.get(key);
      if (b64 === undefined) {
        let s = '';
        for (let i = 0; i < r.length; i += 0x2000) s += String.fromCharCode(...r.subarray(i, i + 0x2000));
        this.encoded.set(key, (b64 = btoa(s)));
      }
      return [rx, rz, b64];
    });
  }

  /** Restores saved regions; malformed entries are skipped. */
  load(saved: unknown): void {
    this.regions.clear();
    this.encoded.clear();
    if (!Array.isArray(saved)) return;
    for (const e of saved) {
      if (!Array.isArray(e) || !Number.isInteger(e[0]) || !Number.isInteger(e[1]) || typeof e[2] !== 'string') continue;
      let bin: string;
      try {
        bin = atob(e[2]);
      } catch {
        continue;
      }
      if (bin.length !== REGION * REGION * 3) continue;
      const r = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) r[i] = bin.charCodeAt(i);
      this.regions.set(`${e[0]},${e[1]}`, r);
    }
  }
}
