import { ARROW_DAMAGE, ARROW_SPEED_M_S, BOLT_SPEED_M_S, BOW_DRAW_S, AXE_DAMAGE, BUILD_CELLS_PER_TICK, CAMPFIRE_COOK_S, CAMPFIRE_SLOTS, DIFFICULTY, PLAYER_ATTACK_COOLDOWN_S, SWORD_DAMAGE, type Difficulty, BUILD_MAX_M, DROP_PICKUP_DELAY_S, DROP_THROW_M_S, HAND_DAMAGE, REACH_M, REPEAT_S, TOOL_DAMAGE, UNDO_STEPS, cells, toCells } from '../config';
import { lootOf, type Creatures } from '../creatures/creatures';
import { AIR, BLOCKS, SOLID } from '../engine/blocks';
import type { World } from '../engine/world';
import { COLLISION } from './collision';
import { consumeIngredients, craftResult, takeIngredients, type Recipe } from './crafting';
import { Drops } from './drops';
import { Hints } from './hints';
import { newFurnace, tickFurnace, type FurnaceState } from './furnace';
import type { Input } from './input';
import { clickSlot, Inventory, type ItemStack } from './inventory';
import { breakSeconds, dropsOf, wearTool } from './mining';
import { overlapsSolid } from './physics';
import type { Player } from './player';
import { raycast, TARGET, type RayHit } from './raycast';
import { Survival } from './survival';
import { aimAt, Projectiles } from './projectiles';
import type { BoxAt } from './collision';

export type Mode = 'creative' | 'survival';

const S = (key: string, v = 0) => BLOCKS.state(key, v);
const DOOR = BLOCKS.byName('door'), BED = BLOCKS.byName('bed'), FURNACE = BLOCKS.byName('furnace'), LIT = BLOCKS.byName('lit_furnace');
const CHEST = BLOCKS.byName('chest');
export const CHEST_SLOTS = 27;
const TABLE = S('crafting_table'), TORCH = S('torch'), GRASS = S('grass'), DIRT = S('dirt'), CAMPFIRE = S('campfire');
const LADDER = BLOCKS.byName('ladder');
/** Fluid sources a bucket picks up, and the full bucket each gives. */
const BUCKET_FILLS = new Map([[S('water'), S('water_bucket')], [S('lava'), S('lava_bucket')]]);
const BUCKET = S('bucket'), BOW = S('bow'), ARROW = S('arrow'), BONE_MEAL = S('bone_meal');
/** Cells a door is tall: 2.1 m at 0.6 m cells rounds up to 4. */
export const DOOR_CELLS = 4;
const FACING_OFFSET = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** Everything one player can do with the world: break, place, use blocks, carry and craft. Ported from the old game. */
export class Play {
  mode: Mode;
  private _difficulty: Difficulty = 'normal';
  readonly inventory = new Inventory();
  readonly survival = new Survival();
  /** First-steps hints in survival, and which are done. */
  readonly hints = new Hints();
  /** The crafting grid shown in the inventory screen: 2×2, or 3×3 at a table. */
  readonly craft: (ItemStack | null)[] = new Array(9).fill(null);
  craftSize = 2;
  /** Furnaces by cell key "x,y,z". */
  readonly furnaces = new Map<string, FurnaceState>();
  /** The furnace the screen shows, or null. */
  openFurnace: string | null = null;
  /** Chests' contents by cell key, and the one the screen shows. */
  readonly chests = new Map<string, (ItemStack | null)[]>();
  openChest: string | null = null;
  /** Which screen is open: none, the inventory (with crafting), a furnace or a chest. */
  screen: 'none' | 'inventory' | 'furnace' | 'chest' = 'none';
  /** The item on the mouse in a screen. */
  cursor: ItemStack | null = null;
  spawn: [number, number, number] | null = null;
  /** Items lying in the world, and where the player's feet were last update (for items that do not fit). */
  readonly drops = new Drops();
  private feet: [number, number, number] = [0, 0, 0];
  target: RayHit | null = null;
  /** 0..1 progress breaking the target, or 0. */
  breaking = 0;
  private breakingCell = '';
  private repeat = 0;
  /** Bumped whenever anything the UI shows changes. */
  version = 0;
  /** Creatures the player can hit, if any live in this world. */
  creatures: Creatures | null = null;
  /** Creative building: the first corner of a box, edits waiting to be applied, and undo/redo history. */
  corner: [number, number, number] | null = null;
  private queue: [number, number, number, number][] = [];
  private readonly undoStack: [number, number, number, number, number][][] = [];
  private readonly redoStack: [number, number, number, number, number][][] = [];
  private group: [number, number, number, number, number][] | null = null;
  private readonly setBlock: (x: number, y: number, z: number, s: number) => void;
  /** Arrows and bolts in flight. */
  readonly projectiles = new Projectiles();
  /** Seconds the bow has been drawn, while right click is held with it. */
  drawS = 0;
  /** Worn armour: head, chest, legs, feet. */
  readonly armour: (ItemStack | null)[] = [null, null, null, null];
  /** Seconds since the player last hit a creature. */
  private sinceAttack = PLAYER_ATTACK_COOLDOWN_S;
  /** Food cooking on campfires by cell key: the raw item's state and seconds left for each. */
  readonly campfires = new Map<string, [number, number][]>();

  constructor(private readonly world: World, setBlock: (x: number, y: number, z: number, s: number) => void,
    private readonly events: { sound(name: 'break' | 'place'): void; sleep(): boolean; fertilise?(x: number, y: number, z: number): boolean }, mode: Mode = 'creative') {
    this.mode = mode;
    // Every change the player makes is recorded for undo while a group is open.
    this.setBlock = (x, y, z, s) => {
      const before = world.get(x, y, z);
      if (before === s) return;
      setBlock(x, y, z, s);
      this.group?.push([x, y, z, before, s]);
    };
  }

  /** Runs `fn` as one undoable step. */
  private record(fn: () => void): void {
    this.group = [];
    try {
      fn();
    } finally {
      if (this.group.length) {
        this.undoStack.push(this.group);
        if (this.undoStack.length > UNDO_STEPS) this.undoStack.shift();
        this.redoStack.length = 0;
      }
      this.group = null;
    }
  }

  /** Creative building keys: undo, redo, and filling or clearing the box between two marked corners. */
  private build(input: Input): void {
    if (input.consume('undo')) this.replay(this.undoStack, this.redoStack, true);
    if (input.consume('redo')) this.replay(this.redoStack, this.undoStack, false);
    const fill = input.consume('fill'), clear = input.consume('clear');
    if ((!fill && !clear) || !this.target) return;
    const t = this.target, at: [number, number, number] = fill ? [t.x + t.nx, t.y + t.ny, t.z + t.nz] : [t.x, t.y, t.z];
    if (!this.corner) {
      this.corner = at;
      this.version++;
      return;
    }
    const [a, b] = [this.corner, at];
    this.corner = null;
    const max = cells(BUILD_MAX_M);
    if ([0, 1, 2].some((k) => Math.abs(a[k]! - b[k]!) + 1 > max)) return;
    const held = this.held, state = clear ? AIR : held && !BLOCKS.type(held.state).item ? held.state : -1;
    if (state < 0) return;
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) {
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) {
        for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) this.queue.push([x, y, z, state]);
      }
    }
    this.undoStack.push([]);
    this.redoStack.length = 0;
    this.version++;
  }

  /** Applies queued box edits, a share per tick, into the latest undo step. */
  private drainQueue(): void {
    if (this.queue.length === 0) return;
    const step = this.undoStack[this.undoStack.length - 1]!;
    this.group = step;
    for (const [x, y, z, s] of this.queue.splice(0, BUILD_CELLS_PER_TICK)) if (this.world.isLoaded(x, y, z)) this.setBlock(x, y, z, s);
    this.group = null;
  }

  private replay(from: [number, number, number, number, number][][], to: [number, number, number, number, number][][], undo: boolean): void {
    const step = from.pop();
    if (!step) return;
    this.queue.length = 0;
    for (const [x, y, z, before, after] of undo ? [...step].reverse() : step) this.setBlock(x, y, z, undo ? before : after);
    to.push(step);
    this.version++;
  }

  /** Peaceful, normal or hard: scales hostile spawns, their damage and hunger. */
  get difficulty(): Difficulty {
    return this._difficulty;
  }

  set difficulty(d: Difficulty) {
    this._difficulty = d;
    this.survival.hungerRate = DIFFICULTY[d].hunger;
    this.version++;
  }

  /** Whether the inventory holds anything of the type `key` (any variant or wear). */
  hasItem(key: string): boolean {
    return this.inventory.slots.some((s) => s !== null && BLOCKS.type(s.state).key === key);
  }

  get held(): ItemStack | null {
    return this.inventory.held;
  }

  /** Pops items out into the world at (x, y, z) (broken blocks, opened containers, hunted creatures). */
  private drop(stack: ItemStack, x: number, y: number, z: number): void {
    this.drops.spawn(stack, x, y, z, (Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3);
  }

  /** Puts items in the inventory; what does not fit drops at (x, y, z). */
  private give(stack: ItemStack, x: number, y: number, z: number): void {
    const left = this.inventory.add(stack);
    if (left > 0) this.drops.spawn({ ...stack, count: left }, x, y, z, 0, 3, 0);
  }

  /** Throws one of the held item (Q) where the player looks. */
  private throwHeld(player: Player): void {
    const held = this.held;
    if (!held) return;
    const [dx, dy, dz] = player.direction(), v = toCells(DROP_THROW_M_S);
    this.drops.spawn({ ...held, count: 1 }, player.body.x + dx * 0.5, player.eyeY - 0.3, player.body.z + dz * 0.5, dx * v, dy * v + 2, dz * v, DROP_PICKUP_DELAY_S);
    if (--held.count <= 0) this.inventory.slots[this.inventory.selected] = null;
    this.version++;
  }

  /** Scatters the whole inventory where the player died. */
  dropAll(): void {
    const [x, y, z] = this.feet;
    for (const s of [...this.inventory.slots, ...this.armour]) if (s) this.drops.spawn(s, x, y + 0.5, z, (Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6, DROP_PICKUP_DELAY_S);
    this.inventory.clear();
    this.armour.fill(null);
    this.version++;
  }

  /** Starting kit in creative: one of each common block in the hotbar. */
  creativeHotbar(): void {
    ['stone', 'dirt', 'grass', 'planks', 'glass', 'torch', 'cobblestone', 'log', 'water'].forEach((k, i) => {
      if (!this.inventory.slots[i]) this.inventory.slots[i] = { state: S(k), count: 64 };
    });
  }

  update(dt: number, input: Input, player: Player, roll = Math.random()): void {
    if (this.mode === 'creative') {
      this.build(input);
      this.drainQueue();
    }
    if (input.slot >= 0) this.select(input.slot);
    input.slot = -1;
    if (input.consume('slotNext')) this.select((this.inventory.selected + 1) % 9);
    if (input.consume('slotPrev')) this.select((this.inventory.selected + 8) % 9);
    if (input.consume('drop')) this.throwHeld(player);
    const [dx, dy, dz] = player.direction();
    const b = player.body;
    this.feet = [b.x, b.y, b.z];
    this.target = raycast(b.x, player.eyeY, b.z, dx, dy, dz, toCells(REACH_M), (x, y, z) => TARGET[this.world.get(x, y, z)]!);
    this.repeat -= dt;
    this.sinceAttack += dt;
    if (input.consume('pick') && this.target && this.mode === 'creative') this.pick(this.target);
    if (this.held && this.held.state === BOW) {
      // A bow: hold right click to draw, let go to shoot.
      input.consume('place');
      if (input.placing) this.drawS += dt;
      else if (this.drawS > 0) this.shootArrow(player);
    }
    const placeNow = input.consume('place') || (input.placing && this.repeat <= 0);
    if (placeNow) {
      this.repeat = REPEAT_S;
      this.record(() => this.use(player));
    }
    const clicked = input.consume('break');
    if (clicked && this.creatures && this.attack(b.x, player.eyeY, b.z, dx, dy, dz)) return;
    if (input.breaking && this.target) this.record(() => this.dig(dt, clicked, roll));
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
    // Quick swings land weaker blows: the hit's strength recovers over the cooldown.
    const strength = Math.max(0.2, Math.min(1, this.sinceAttack / PLAYER_ATTACK_COOLDOWN_S));
    this.sinceAttack = 0;
    const damage = strength * weaponDamage(held);
    const c = hit.creature;
    if (this.creatures!.damage(c, damage, ox, oz) && this.mode === 'survival') {
      for (const loot of lootOf(c)) this.drop(loot, c.body.x, c.body.y, c.body.z);
    }
    if (held && tool && this.mode === 'survival' && !wearTool(held)) this.inventory.slots[this.inventory.selected] = null;
    this.events.sound('break');
    this.version++;
    return true;
  }

  /** Lets an arrow fly where the player looks, stronger the longer the bow was drawn; uses up an arrow in survival. */
  private shootArrow(player: Player): void {
    const strength = Math.min(1, this.drawS / BOW_DRAW_S);
    this.drawS = 0;
    if (strength < 0.15) return;
    const arrows = this.inventory.slots.findIndex((s) => s?.state === ARROW);
    if (this.mode === 'survival') {
      if (arrows < 0) return;
      if (--this.inventory.slots[arrows]!.count <= 0) this.inventory.slots[arrows] = null;
    }
    const [dx, dy, dz] = player.direction(), b = player.body;
    this.projectiles.shoot(b.x + dx * 0.6, player.eyeY - 0.2, b.z + dz * 0.6, dx, dy, dz, toCells(ARROW_SPEED_M_S) * strength, ARROW_DAMAGE * strength, true);
    this.version++;
  }

  /** A creature shoots a bolt at the player's chest from (x, y, z). */
  shootAtPlayer(x: number, y: number, z: number, player: Player, damage: number): void {
    const b = player.body, speed = toCells(BOLT_SPEED_M_S);
    const [dx, dy, dz] = aimAt(x, y, z, b.x, b.y + b.height * 0.7, b.z, speed);
    this.projectiles.shoot(x, y, z, dx, dy, dz, speed, damage, false);
  }

  /** Flies every arrow and bolt; hits hurt creatures or the player, and the player's arrows that miss can be picked up. */
  tickProjectiles(dt: number, boxAt: BoxAt, player: Player): void {
    const creatures = this.creatures;
    const hits = this.projectiles.update(dt, boxAt, (fromPlayer) => (fromPlayer ? creatures?.list.map((c) => c.body) ?? []
      : this.mode === 'survival' && !this.survival.dead ? [player.body] : []));
    for (const h of hits) {
      const p = h.p;
      if (h.kind === 'ground') {
        if (p.fromPlayer && this.mode === 'survival') this.drops.spawn({ state: ARROW, count: 1 }, p.x, p.y, p.z);
        continue;
      }
      if (!p.fromPlayer) {
        this.survival.hurt(this.protect(p.damage * DIFFICULTY[this.difficulty].damage), 'shot by a skulker');
        this.version++;
        continue;
      }
      const c = creatures?.list.find((k) => k.body === h.body);
      if (c && creatures!.damage(c, p.damage, p.x - p.vx, p.z - p.vz) && this.mode === 'survival') {
        for (const loot of lootOf(c)) this.drop(loot, c.body.x, c.body.y, c.body.z);
      }
    }
  }

  /** Damage left after worn armour (each protection point stops 4%, at most 80%); every hit wears each piece. */
  protect(damage: number): number {
    let points = 0;
    this.armour.forEach((a, i) => {
      if (!a) return;
      const def = BLOCKS.type(a.state).armour!;
      points += def.protection;
      a.wear = (a.wear ?? 0) + 1;
      if (a.wear >= def.durability) this.armour[i] = null;
    });
    this.version++;
    return damage * (1 - Math.min(0.8, points * 0.04));
  }

  /** °C of cold the worn armour keeps off. */
  get warmth(): number {
    return this.armour.reduce((sum, a) => sum + (a ? BLOCKS.type(a.state).armour!.warmth : 0), 0);
  }

  /** Puts the held armour on, swapping with what was worn there. */
  private wear(held: ItemStack): void {
    const slot = BLOCKS.type(held.state).armour!.slot;
    this.inventory.slots[this.inventory.selected] = this.armour[slot] ?? null;
    this.armour[slot] = held;
    this.events.sound('place');
    this.version++;
  }

  /** A click on armour slot `slot` in the inventory screen: only that slot's armour goes in. */
  clickArmour(slot: number, right: boolean): void {
    const c = this.cursor;
    if (c && BLOCKS.type(c.state).armour?.slot !== slot) return;
    const box = [this.armour[slot] ?? null];
    this.cursor = clickSlot(box, 0, c, right);
    this.armour[slot] = box[0]!;
    this.version++;
  }

  /** Puts the held raw food on the campfire at `key`, if it has room. */
  private cookOnFire(key: string, held: ItemStack): boolean {
    const cooking = this.campfires.get(key) ?? [];
    if (cooking.length >= CAMPFIRE_SLOTS) return false;
    cooking.push([BLOCKS.type(held.state).id, CAMPFIRE_COOK_S]);
    this.campfires.set(key, cooking);
    this.consumeHeld();
    return true;
  }

  /** Campfires cook their food; done food pops out on top. Fires broken or unloaded meanwhile give back raw food. */
  tickCampfires(dt: number): void {
    for (const [key, cooking] of this.campfires) {
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      if (!this.world.isLoaded(x, y, z)) continue;
      if (this.world.get(x, y, z) !== CAMPFIRE) {
        for (const [state] of cooking) this.drop({ state, count: 1 }, x + 0.5, y + 0.5, z + 0.5);
        this.campfires.delete(key);
        continue;
      }
      for (let i = cooking.length - 1; i >= 0; i--) {
        const c = cooking[i]!;
        c[1] -= dt;
        if (c[1] > 0) continue;
        this.drop({ state: BLOCKS.state(BLOCKS.type(c[0]).smeltsTo!), count: 1 }, x + 0.5, y + 0.6, z + 0.5);
        cooking.splice(i, 1);
      }
      if (cooking.length === 0) this.campfires.delete(key);
    }
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
      for (const d of dropsOf(state, this.held, roll)) this.drop(d, x + 0.5, y, z + 0.5);
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
    if (type === CHEST) {
      const key = `${x},${y},${z}`;
      if (survival) for (const s of this.chests.get(key) ?? []) if (s) this.drop(s, x + 0.5, y, z + 0.5);
      this.chests.delete(key);
    }
    this.setBlock(x, y, z, AIR);
    this.events.sound('break');
    this.version++;
  }

  private dropFurnace(x: number, y: number, z: number, survival: boolean): void {
    const key = `${x},${y},${z}`, f = this.furnaces.get(key);
    if (f && survival) for (const s of [f.input, f.fuel, f.output]) if (s) this.drop(s, x + 0.5, y, z + 0.5);
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
    if (this.useBucket(player)) return;
    const t = this.target;
    if (t) {
      const state = this.world.get(t.x, t.y, t.z), type = BLOCKS.type(state);
      if (type === DOOR) {
        const v = BLOCKS.variant(state), next = DOOR.id + (v < 4 ? v + 4 : v - 4);
        for (const [x, y, z] of this.doorCells(t.x, t.y, t.z)) this.setBlock(x, y, z, next);
        return;
      }
      if (type === CHEST) {
        const key = `${t.x},${t.y},${t.z}`;
        if (!this.chests.has(key)) this.chests.set(key, new Array(CHEST_SLOTS).fill(null));
        this.openChest = key;
        this.openScreen('chest', 2);
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
      const held = this.held;
      if (state === CAMPFIRE && held && BLOCKS.type(held.state).food !== undefined && BLOCKS.type(held.state).smeltsTo) {
        this.cookOnFire(`${t.x},${t.y},${t.z}`, held);
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
    if (heldType.armour) {
      this.wear(held);
      return;
    }
    if (held.state === BONE_MEAL && t && this.events.fertilise?.(t.x, t.y, t.z)) {
      this.consumeHeld();
      return;
    }
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

  /** A bucket scoops up the water or lava source in view; a full one pours its source out against the targeted face. */
  private useBucket(player: Player): boolean {
    const held = this.held;
    if (!held) return false;
    const type = BLOCKS.type(held.state);
    if (held.state === BUCKET) {
      const [dx, dy, dz] = player.direction(), b = player.body;
      const hit = raycast(b.x, player.eyeY, b.z, dx, dy, dz, toCells(REACH_M), (x, y, z) => {
        const s = this.world.get(x, y, z);
        return BUCKET_FILLS.has(s) ? 16 << 5 : TARGET[s]!;
      });
      const full = hit ? BUCKET_FILLS.get(this.world.get(hit.x, hit.y, hit.z)) : undefined;
      if (!hit || full === undefined) return false;
      this.setBlock(hit.x, hit.y, hit.z, AIR);
      this.swapHeld({ state: full, count: 1 });
      return true;
    }
    if (!type.emptiesTo || !type.key.endsWith('_bucket') || !this.target) return false;
    const t = this.target, x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    if (TARGET[this.world.get(x, y, z)] !== 0 || !this.world.isLoaded(x, y, z)) return false;
    this.setBlock(x, y, z, S(type.key.slice(0, -'_bucket'.length)));
    this.swapHeld({ state: BUCKET, count: 1 });
    return true;
  }

  /** Uses up one held item and hands over `result` instead (a bucket filled or emptied). Creative keeps the item. */
  private swapHeld(result: ItemStack): void {
    if (this.mode === 'creative') return;
    const held = this.held!;
    if (held.count <= 1) this.inventory.slots[this.inventory.selected] = result;
    else {
      held.count--;
      this.give(result, ...this.feet);
    }
    this.events.sound('place');
    this.version++;
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
    // A ladder goes on the side of a wall, hanging on the face that was clicked.
    if (type === LADDER) {
      if (t.ny !== 0) return;
      state = LADDER.id + (t.nx === -1 ? 0 : t.nx === 1 ? 1 : t.nz === -1 ? 2 : 3);
    } else if (type.front) state = type.id + toward;
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

  openScreen(screen: 'inventory' | 'furnace' | 'chest', craftSize = 2): void {
    this.screen = screen;
    this.craftSize = craftSize;
    this.version++;
  }

  /** Closes any screen; the crafting grid and the cursor go back to the inventory. */
  closeScreen(): void {
    for (let i = 0; i < 9; i++) {
      if (this.craft[i]) this.give(this.craft[i]!, ...this.feet);
      this.craft[i] = null;
    }
    if (this.cursor) this.give(this.cursor, ...this.feet);
    this.cursor = null;
    this.screen = 'none';
    this.openFurnace = null;
    this.openChest = null;
    this.version++;
  }

  /** Whether the inventory and the grid together hold what `r` needs, and it fits the open grid. */
  canMake(r: Recipe): boolean {
    return takeIngredients(r, this.craftSize, [...this.inventory.slots, ...this.craft]) !== null;
  }

  /** The recipe list: puts the grid back into the inventory, then lays out `r` from it. Returns whether it could. */
  fillRecipe(r: Recipe): boolean {
    // Work on a copy: the grid goes back into the inventory first, and nothing changes unless all of it fits.
    const slots = this.inventory.slots.map((s) => s && { ...s });
    const back = new Inventory();
    back.slots.splice(0, back.slots.length, ...slots);
    if (this.craft.some((c) => c && back.add({ ...c }) > 0)) return false;
    const grid = takeIngredients(r, this.craftSize, back.slots);
    if (!grid) return false;
    this.inventory.slots.splice(0, this.inventory.slots.length, ...back.slots);
    for (let i = 0; i < 9; i++) this.craft[i] = grid[i] ?? null;
    this.version++;
    return true;
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
      mode: this.mode, difficulty: this.difficulty, hints: this.hints.save(), inventory: this.inventory.save(), selected: this.inventory.selected, drops: this.drops.save(),
      health: this.survival.health, hunger: this.survival.hunger, air: this.survival.air, bodyC: this.survival.temperature.coreC, spawn: this.spawn,
      furnaces: [...this.furnaces].map(([k, f]) => [k, s(f.input), s(f.fuel), s(f.output), f.burn, f.progress]),
      armour: this.armour.map((a) => (a ? [BLOCKS.stateName(a.state), 1, a.wear ?? 0] : null)),
      campfires: [...this.campfires].map(([k, c]) => [k, c.map(([st, left]) => [BLOCKS.stateName(st), left])]),
      chests: [...this.chests].map(([k, slots]) => [k, slots.map((st) => (st ? [BLOCKS.stateName(st.state), st.count, st.wear ?? 0] : null))]),
    };
  }

  /** Restores a save; anything malformed is left at its default. */
  load(saved: unknown): void {
    if (typeof saved !== 'object' || saved === null) return;
    const p = saved as Record<string, unknown>;
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    if (p.mode === 'creative' || p.mode === 'survival') this.mode = p.mode;
    if (typeof p.difficulty === 'string' && p.difficulty in DIFFICULTY) this.difficulty = p.difficulty as Difficulty;
    this.hints.load(p.hints);
    this.inventory.load(p.inventory);
    this.drops.load(p.drops);
    this.inventory.selected = Math.max(0, Math.min(8, Math.floor(num(p.selected, 0))));
    this.survival.health = num(p.health, this.survival.health);
    this.survival.hunger = num(p.hunger, this.survival.hunger);
    this.survival.air = num(p.air, this.survival.air);
    this.survival.temperature.coreC = Math.max(30, Math.min(42, num(p.bodyC, this.survival.temperature.coreC)));
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
    if (Array.isArray(p.armour)) {
      const worn = new Inventory();
      worn.load(p.armour);
      worn.slots.slice(0, 4).forEach((a, i) => (this.armour[i] = a && BLOCKS.type(a.state).armour?.slot === i ? a : null));
    }
    if (Array.isArray(p.campfires)) {
      for (const c of p.campfires) {
        if (!Array.isArray(c) || typeof c[0] !== 'string' || !/^-?\d+,-?\d+,-?\d+$/.test(c[0]) || !Array.isArray(c[1])) continue;
        const cooking: [number, number][] = [];
        for (const e of c[1].slice(0, CAMPFIRE_SLOTS)) {
          const state = Array.isArray(e) && typeof e[0] === 'string' ? BLOCKS.parseStateName(e[0]) : null;
          if (state !== null && BLOCKS.type(state).smeltsTo) cooking.push([state, num(e[1], CAMPFIRE_COOK_S)]);
        }
        if (cooking.length) this.campfires.set(c[0], cooking);
      }
    }
    if (Array.isArray(p.chests)) {
      for (const c of p.chests) {
        if (!Array.isArray(c) || typeof c[0] !== 'string' || !/^-?\d+,-?\d+,-?\d+$/.test(c[0]) || !Array.isArray(c[1])) continue;
        const slots = new Inventory();
        slots.load(c[1]);
        this.chests.set(c[0], slots.slots.slice(0, CHEST_SLOTS));
      }
    }
    this.version++;
  }
}

/** Damage of one full-strength hit with `held` (or a bare hand): swords best, then axes, then other tools; more per tier. */
export function weaponDamage(held: ItemStack | null): number {
  const tool = held ? BLOCKS.type(held.state).tool : undefined;
  if (!tool) return HAND_DAMAGE;
  return (tool.kind === 'sword' ? SWORD_DAMAGE : tool.kind === 'axe' ? AXE_DAMAGE : TOOL_DAMAGE) + tool.tier;
}
