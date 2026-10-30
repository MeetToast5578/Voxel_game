import { AXE_DAMAGE, HAND_DAMAGE, REACH_M, REPEAT_S, TOOL_DAMAGE, toCells } from '../config';
import { meatOf, type Creatures } from '../creatures/creatures';
import { AIR, BLOCKS, SOLID } from '../engine/blocks';
import type { World } from '../engine/world';
import { COLLISION } from './collision';
import { consumeIngredients, craftResult } from './crafting';
import { newFurnace, tickFurnace, type FurnaceState } from './furnace';
import type { Input } from './input';
import { Inventory, type ItemStack } from './inventory';
import { breakSeconds, dropsOf, wearTool } from './mining';
import { overlapsSolid } from './physics';
import type { Player } from './player';
import { raycast, TARGET, type RayHit } from './raycast';
import { Survival } from './survival';

export type Mode = 'creative' | 'survival';

const S = (key: string, v = 0) => BLOCKS.state(key, v);
const DOOR = BLOCKS.byName('door'), BED = BLOCKS.byName('bed'), FURNACE = BLOCKS.byName('furnace'), LIT = BLOCKS.byName('lit_furnace');
const TABLE = S('crafting_table'), TORCH = S('torch'), GRASS = S('grass'), DIRT = S('dirt');
/** Cells a door is tall: 2.1 m at 0.6 m cells rounds up to 4. */
export const DOOR_CELLS = 4;
const FACING_OFFSET = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Everything one player can do with the world: break, place, use blocks, carry and craft. Ported from the old game. */
export class Play {
  mode: Mode;
  readonly inventory = new Inventory();
  readonly survival = new Survival();
  /** The crafting grid shown in the inventory screen: 2×2, or 3×3 at a table. */
  readonly craft: (ItemStack | null)[] = new Array(9).fill(null);
  craftSize = 2;
  /** Furnaces by cell key "x,y,z". */
  readonly furnaces = new Map<string, FurnaceState>();
  /** The furnace the screen shows, or null. */
  openFurnace: string | null = null;
  /** Which screen is open: none, the inventory (with crafting) or a furnace. */
  screen: 'none' | 'inventory' | 'furnace' = 'none';
  /** The item on the mouse in a screen. */
  cursor: ItemStack | null = null;
  spawn: [number, number, number] | null = null;
  target: RayHit | null = null;
  /** 0..1 progress breaking the target, or 0. */
  breaking = 0;
  private breakingCell = '';
  private repeat = 0;
  /** Bumped whenever anything the UI shows changes. */
  version = 0;
  /** Creatures the player can hit, if any live in this world. */
  creatures: Creatures | null = null;

  constructor(private readonly world: World, private readonly setBlock: (x: number, y: number, z: number, s: number) => void,
    private readonly events: { sound(name: 'break' | 'place'): void; sleep(): boolean }, mode: Mode = 'creative') {
    this.mode = mode;
  }

  get held(): ItemStack | null {
    return this.inventory.held;
  }

  /** Starting kit in creative: one of each common block in the hotbar. */
  creativeHotbar(): void {
    ['stone', 'dirt', 'grass', 'planks', 'glass', 'torch', 'cobblestone', 'log', 'water'].forEach((k, i) => {
      if (!this.inventory.slots[i]) this.inventory.slots[i] = { state: S(k), count: 64 };
    });
  }

  update(dt: number, input: Input, player: Player, roll = Math.random()): void {
    if (input.slot >= 0) this.select(input.slot);
    input.slot = -1;
    if (input.consume('slotNext')) this.select((this.inventory.selected + 1) % 9);
    if (input.consume('slotPrev')) this.select((this.inventory.selected + 8) % 9);
    const [dx, dy, dz] = player.direction();
    const b = player.body;
    this.target = raycast(b.x, player.eyeY, b.z, dx, dy, dz, toCells(REACH_M), (x, y, z) => TARGET[this.world.get(x, y, z)]!);
    this.repeat -= dt;
    if (input.consume('pick') && this.target && this.mode === 'creative') this.pick(this.target);
    const placeNow = input.consume('place') || (input.placing && this.repeat <= 0);
    if (placeNow) {
      this.repeat = REPEAT_S;
      this.use(player);
    }
    const clicked = input.consume('break');
    if (clicked && this.creatures && this.attack(b.x, player.eyeY, b.z, dx, dy, dz)) return;
    if (input.breaking && this.target) this.dig(dt, clicked, roll);
    else {
      this.breaking = 0;
      this.breakingCell = '';
    }
  }

  /** Hits the creature under the crosshair, if one is nearer than the targeted block. Returns whether one was hit. */
  private attack(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
    const hit = this.creatures!.raycast(ox, oy, oz, dx, dy, dz, toCells(REACH_M));
    if (!hit || (this.target && this.target.distance < hit.distance)) return false;
    const held = this.held, tool = held ? BLOCKS.type(held.state).tool : undefined;
    const damage = tool ? (tool.kind === 'axe' ? AXE_DAMAGE : TOOL_DAMAGE) + tool.tier : HAND_DAMAGE;
    const c = hit.creature;
    if (this.creatures!.damage(c, damage, ox, oz) && this.mode === 'survival') {
      const meat = meatOf(c);
      if (meat) this.inventory.add(meat);
    }
    if (held && tool && this.mode === 'survival' && !wearTool(held)) this.inventory.slots[this.inventory.selected] = null;
    this.events.sound('break');
    this.version++;
    return true;
  }

  private select(slot: number): void {
    this.inventory.selected = Math.max(0, Math.min(8, slot));
    this.version++;
  }

  /** Creative middle click: put the targeted block in the hand. */
  private pick(t: RayHit): void {
    const s = BLOCKS.type(this.world.get(t.x, t.y, t.z)).id;
    this.inventory.slots[this.inventory.selected] = { state: s, count: 64 };
    this.version++;
  }

  /** Breaking: at once in creative, over time in survival (faster with the right tool), dropping into the inventory. */
  private dig(dt: number, clicked: boolean, roll: number): void {
    const t = this.target!;
    const state = this.world.get(t.x, t.y, t.z);
    if (BLOCKS.type(state).hardness === Infinity && this.mode === 'survival') return;
    const cell = `${t.x},${t.y},${t.z}`;
    if (this.mode === 'creative') {
      if (clicked || this.repeat <= 0) {
        this.repeat = REPEAT_S;
        this.breakCell(t.x, t.y, t.z, state, false, roll);
      }
      return;
    }
    if (cell !== this.breakingCell) {
      this.breakingCell = cell;
      this.breaking = 0;
    }
    const seconds = breakSeconds(state, this.held);
    this.breaking = seconds <= 0 ? 1 : this.breaking + dt / seconds;
    if (this.breaking >= 1) {
      this.breaking = 0;
      this.breakingCell = '';
      this.breakCell(t.x, t.y, t.z, state, true, roll);
    }
  }

  private breakCell(x: number, y: number, z: number, state: number, survival: boolean, roll: number): void {
    const type = BLOCKS.type(state);
    if (survival) {
      for (const d of dropsOf(state, this.held, roll)) this.inventory.add(d);
      const tool = this.held;
      if (tool && BLOCKS.type(tool.state).tool && !wearTool(tool)) this.inventory.slots[this.inventory.selected] = null;
    }
    // Doors and beds go as a whole.
    if (type === DOOR) for (const [cx, cy, cz] of this.doorCells(x, y, z)) this.setBlock(cx, cy, cz, AIR);
    else if (type === BED) {
      const v = BLOCKS.variant(state), [ox, oz] = FACING_OFFSET[v % 4]!, dir = v >= 4 ? -1 : 1;
      if (this.world.get(x + ox * dir, y, z + oz * dir) !== AIR && BLOCKS.type(this.world.get(x + ox * dir, y, z + oz * dir)) === BED) {
        this.setBlock(x + ox * dir, y, z + oz * dir, AIR);
      }
    }
    if (type === FURNACE || type === LIT) this.dropFurnace(x, y, z, survival);
    this.setBlock(x, y, z, AIR);
    this.events.sound('break');
    this.version++;
  }

  private dropFurnace(x: number, y: number, z: number, survival: boolean): void {
    const key = `${x},${y},${z}`, f = this.furnaces.get(key);
    if (f && survival) for (const s of [f.input, f.fuel, f.output]) if (s) this.inventory.add(s);
    this.furnaces.delete(key);
  }

  /** The cells of the door that `(x, y, z)` belongs to. */
  private doorCells(x: number, y: number, z: number): [number, number, number][] {
    let bottom = y;
    while (BLOCKS.type(this.world.get(x, bottom - 1, z)) === DOOR && y - bottom < DOOR_CELLS) bottom--;
    const cells: [number, number, number][] = [];
    for (let cy = bottom; BLOCKS.type(this.world.get(x, cy, z)) === DOOR && cy - bottom < DOOR_CELLS; cy++) cells.push([x, cy, z]);
    return cells;
  }

  /** Right click: use the targeted block (door, table, furnace, bed), eat, or place the held block. */
  private use(player: Player): void {
    const t = this.target;
    if (t) {
      const state = this.world.get(t.x, t.y, t.z), type = BLOCKS.type(state);
      if (type === DOOR) {
        const v = BLOCKS.variant(state), next = DOOR.id + (v < 4 ? v + 4 : v - 4);
        for (const [x, y, z] of this.doorCells(t.x, t.y, t.z)) this.setBlock(x, y, z, next);
        return;
      }
      if (state === TABLE) {
        this.openScreen('inventory', 3);
        return;
      }
      if (type === FURNACE || type === LIT) {
        const key = `${t.x},${t.y},${t.z}`;
        if (!this.furnaces.has(key)) this.furnaces.set(key, newFurnace());
        this.openFurnace = key;
        this.openScreen('furnace', 2);
        return;
      }
      if (type === BED) {
        this.spawn = [t.x + 0.5, t.y + 1, t.z + 0.5];
        this.events.sleep();
        this.version++;
        return;
      }
    }
    const held = this.held;
    if (!held) return;
    const heldType = BLOCKS.type(held.state);
    // Food is eaten when hungry, unless it is a crop being planted on grass or dirt.
    if (heldType.food && this.mode === 'survival') {
      const ground = t ? this.world.get(t.x, t.y, t.z) : AIR;
      const planting = heldType.variantTiles !== undefined && t !== null && t.ny === 1 && (ground === GRASS || ground === DIRT);
      if (!planting && this.survival.eat(heldType.food)) {
        this.consumeHeld();
        return;
      }
    }
    if (!t || heldType.item) return;
    this.place(t, held, player);
  }

  private place(t: RayHit, held: ItemStack, player: Player): void {
    const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    const type = BLOCKS.type(held.state);
    if (TARGET[this.world.get(x, y, z)] !== 0 || !this.world.isLoaded(x, y, z)) return;
    const below = this.world.get(x, y - 1, z);
    // Plants, crops, saplings and torches need solid ground; crops and saplings grow on grass or dirt.
    if (type.needsSupport && (BLOCKS.flags[below]! & SOLID) === 0) return;
    if ((type.variantTiles || type.key === 'sapling') && below !== GRASS && below !== DIRT) return;
    // The way the player looks decides which way a door, bed, stairs or furnace faces.
    const [fx, , fz] = player.direction();
    const facing = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 1) : fz > 0 ? 2 : 3;
    const toward = [1, 0, 3, 2][facing]!;
    let state = held.state;
    if (type === DOOR) {
      for (let k = 0; k < DOOR_CELLS; k++) if (TARGET[this.world.get(x, y + k, z)] !== 0 || !this.free(x, y + k, z, player, true)) return;
      for (let k = 0; k < DOOR_CELLS; k++) this.setBlock(x, y + k, z, DOOR.id + facing);
      this.consumeHeld();
      this.events.sound('place');
      return;
    }
    if (type === BED) {
      const [ox, oz] = FACING_OFFSET[facing]!;
      if (TARGET[this.world.get(x + ox, y, z + oz)] !== 0 || !this.free(x, y, z, player) || !this.free(x + ox, y, z + oz, player)) return;
      this.setBlock(x, y, z, BED.id + facing);
      this.setBlock(x + ox, y, z + oz, BED.id + facing + 4);
      this.consumeHeld();
      this.events.sound('place');
      return;
    }
    if (type.front) state = type.id + toward;
    else if (type.key.endsWith('_stairs')) state = type.id + facing;
    else if (type.slabOf && t.ny === -1) state = type.id + 1;
    if (!this.free(x, y, z, player, false, state)) return;
    this.setBlock(x, y, z, state);
    if (type === FURNACE) this.furnaces.set(`${x},${y},${z}`, newFurnace());
    this.consumeHeld();
    this.events.sound('place');
  }

  /** Whether a block placed at (x, y, z) would leave the player free. */
  private free(x: number, y: number, z: number, player: Player, solidCell = false, state = TORCH): boolean {
    const box = solidCell ? 16 << 5 : COLLISION[state]!;
    return box === 0 || !overlapsSolid(player.body, (cx, cy, cz) => (cx === x && cy === y && cz === z ? box : 0));
  }

  private consumeHeld(): void {
    if (this.mode === 'survival') this.inventory.useHeld();
    this.version++;
  }

  openScreen(screen: 'inventory' | 'furnace', craftSize = 2): void {
    this.screen = screen;
    this.craftSize = craftSize;
    this.version++;
  }

  /** Closes any screen; the crafting grid and the cursor go back to the inventory. */
  closeScreen(): void {
    for (let i = 0; i < 9; i++) {
      if (this.craft[i]) this.inventory.add(this.craft[i]!);
      this.craft[i] = null;
    }
    if (this.cursor) this.inventory.add(this.cursor);
    this.cursor = null;
    this.screen = 'none';
    this.openFurnace = null;
    this.version++;
  }

  /** What the grid crafts now. */
  get craftOutput(): ItemStack | null {
    const cells = this.craft.slice(0, this.craftSize * this.craftSize);
    return craftResult(cells, this.craftSize);
  }

  /** Takes the crafted result onto the cursor (if it fits there) and uses up the ingredients. */
  takeCraft(): void {
    const out = this.craftOutput;
    if (!out) return;
    if (this.cursor && (this.cursor.state !== out.state || this.cursor.count + out.count > (BLOCKS.type(out.state).maxStack ?? 64))) return;
    this.cursor = this.cursor ? { ...this.cursor, count: this.cursor.count + out.count } : out;
    const cells = this.craft.slice(0, this.craftSize * this.craftSize);
    consumeIngredients(cells);
    cells.forEach((c, i) => (this.craft[i] = c));
    this.version++;
  }

  /** Smelting in every furnace, and the lit or unlit block to match. */
  tickFurnaces(dt: number): void {
    for (const [key, f] of this.furnaces) {
      const burning = tickFurnace(f, dt);
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      if (!this.world.isLoaded(x, y, z)) continue;
      const state = this.world.get(x, y, z), type = BLOCKS.type(state);
      if (type !== FURNACE && type !== LIT) {
        this.furnaces.delete(key);
        continue;
      }
      const want = (burning ? LIT : FURNACE).id + BLOCKS.variant(state);
      if (want !== state) this.setBlock(x, y, z, want);
      if (key === this.openFurnace) this.version++;
    }
  }

  /** For saving. */
  save(): unknown {
    const s = (st: ItemStack | null) => (st ? [BLOCKS.stateName(st.state), st.count] : null);
    return {
      mode: this.mode, inventory: this.inventory.save(), selected: this.inventory.selected,
      health: this.survival.health, hunger: this.survival.hunger, air: this.survival.air, spawn: this.spawn,
      furnaces: [...this.furnaces].map(([k, f]) => [k, s(f.input), s(f.fuel), s(f.output), f.burn, f.progress]),
    };
  }

  /** Restores a save; anything malformed is left at its default. */
  load(saved: unknown): void {
    if (typeof saved !== 'object' || saved === null) return;
    const p = saved as Record<string, unknown>;
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    if (p.mode === 'creative' || p.mode === 'survival') this.mode = p.mode;
    this.inventory.load(p.inventory);
    this.inventory.selected = Math.max(0, Math.min(8, Math.floor(num(p.selected, 0))));
    this.survival.health = num(p.health, this.survival.health);
    this.survival.hunger = num(p.hunger, this.survival.hunger);
    this.survival.air = num(p.air, this.survival.air);
    if (Array.isArray(p.spawn) && p.spawn.length === 3 && p.spawn.every((v) => typeof v === 'number')) this.spawn = p.spawn as [number, number, number];
    const stack = (e: unknown): ItemStack | null => {
      if (!Array.isArray(e) || typeof e[0] !== 'string') return null;
      const state = BLOCKS.parseStateName(e[0]);
      return state === null || !(Number(e[1]) > 0) ? null : { state, count: Math.floor(Number(e[1])) };
    };
    if (Array.isArray(p.furnaces)) {
      for (const f of p.furnaces) {
        if (!Array.isArray(f) || typeof f[0] !== 'string' || !/^-?\d+,-?\d+,-?\d+$/.test(f[0])) continue;
        this.furnaces.set(f[0], { input: stack(f[1]), fuel: stack(f[2]), output: stack(f[3]), burn: num(f[4], 0), progress: num(f[5], 0) });
      }
    }
    this.version++;
  }
}
