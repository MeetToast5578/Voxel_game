import { HOOK_RANGE_M, TIER_DAMAGE, ARMOUR_CAP, ARMOUR_PER_POINT, MAX_HEALTH, ACCESSORY_SLOTS, AXE_ARC_RAD, CRIT_CHANCE, CRIT_FACTOR, KNOCKBACK_FACTOR, SWORD_ARC_RAD, LIGHTNING_DAMAGE, LIGHTNING_REACH_M, FISH_MAX_S, FISH_MIN_S, BLOCK_SIZE_M, ARROW_DAMAGE, ARROW_SPEED_M_S, BOLT_SPEED_M_S, BOW_DRAW_S, AXE_DAMAGE, BUILD_CELLS_PER_TICK, CAMPFIRE_COOK_S, CAMPFIRE_SLOTS, DIFFICULTY, PLAYER_ATTACK_COOLDOWN_S, SWORD_DAMAGE, type Difficulty, BUILD_MAX_M, DROP_PICKUP_DELAY_S, DROP_THROW_M_S, HAND_DAMAGE, REACH_M, REPEAT_S, TOOL_DAMAGE, UNDO_STEPS, cells, toCells } from '../config';
import { lootOf, type Creature, type Creatures } from '../creatures/creatures';
import { AIR, BLOCKS, POTIONS, SET_BONUSES, SOLID, type BlockType } from '../engine/blocks';
import type { World } from '../engine/world';
import { COLLISION, FULL } from './collision';
import { craft, type Craft, type Station } from './crafting';
import { Drops } from './drops';
import { Hints } from './hints';
import { newFurnace, tickFurnace, type FurnaceState } from './furnace';
import type { Input } from './input';
import { clickSlot, HOTBAR_SIZE, insertStack, Inventory, moveStack, takeOutput, type ItemStack } from './inventory';
import { breakSeconds, dropsOf, wearTool } from './mining';
import { overlapsSolid } from './physics';
import type { Player } from './player';
import { raycast, TARGET, type RayHit } from './raycast';
import { Survival } from './survival';
import { checkRoom } from './housing';
import { isEffect, POTION_SICKNESS_S, SLOWED_SPEED, SWIFT_SPEED } from './effects';
import { Particles } from './particles';
import { lootTableFor, rollLoot, type LootTable } from './loot';
import { Journal, MILESTONES, type Stats } from './journal';
import { aimAt, Projectiles } from './projectiles';
import type { BoxAt } from './collision';
import { HOUSE_BED, professionAt, sitesNear, undergroundFloor } from '../worldgen/structures';
import { Decorations, SHOPS, TRADE_OFFERS, WORKSHOP_BLOCKS, trade, forge, type TradeOffer, type WorkshopKind } from './workshops';
import { SPECIES_BY_KEY } from '../creatures/species';
import { buildingMaterial } from './building';

export type Mode = 'creative' | 'survival';

const S = (key: string, v = 0) => BLOCKS.state(key, v);
const DOOR = BLOCKS.byName('door'), BED = BLOCKS.byName('bed'), FURNACE = BLOCKS.byName('furnace'), LIT = BLOCKS.byName('lit_furnace');
const CHEST = BLOCKS.byName('chest'), ANCIENT = BLOCKS.byName('ancient_chest');
const BEACON = S('beacon'), LIT_BEACON = S('lit_beacon');
/** The beacon must be lit at least this high (m), under open sky. */
export const BEACON_MIN_M = 150;
export const CHEST_SLOTS = 27;
/** Cooked meals that leave the player well fed, and for how long. */
const WELL_FED_FOODS = new Set(['cooked_meat', 'cooked_fish', 'baked_potato']), WELL_FED_S = 90;
const TABLE = S('crafting_table'), ALCHEMY = S('alchemy_table'), TORCH = S('torch'), GRASS = S('grass'), DIRT = S('dirt'), CAMPFIRE = S('campfire'), FARMLAND = S('farmland');
const ROD = S('fishing_rod'), FISH = S('raw_fish'), BOAT = S('boat');
const WARDEN = SPECIES_BY_KEY.get('warden')!;
/** What a lightning strike turns the ground it hits into. */
const SCORCH = new Map([[S('grass'), S('dirt')], [S('sand'), S('glass')], [S('snow'), AIR]]);
/** How near (m) the Ember Warden keeps the player from its chest. */
const GUARD_M = 12;
const WATERS = new Set([S('water'), ...Array.from({ length: BLOCKS.byName('flowing_water').variants }, (_, v) => S('flowing_water', v))]);
const LADDER = BLOCKS.byName('ladder');
/** Fluid sources a bucket picks up, and the full bucket each gives. */
const BUCKET_FILLS = new Map([[S('water'), S('water_bucket')], [S('lava'), S('lava_bucket')]]);
const BUCKET = S('bucket'), BOW = S('bow'), ARROW = S('arrow'), BONE_MEAL = S('bone_meal');
/** Cells a door is tall: 2.1 m at 0.6 m cells rounds up to 4. */
export const DOOR_CELLS = 4;
const FACING_OFFSET = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
/** A home the player made: the bed head's cell, which way its sleeper lies, and who lives there. */
export interface Home { x: number; y: number; z: number; yaw: number; who: string | null }

/** Everything one player can do with the world: break, place, use blocks, carry and craft. Ported from the old game. */
export class Play {
  mode: Mode;
  private _difficulty: Difficulty = 'normal';
  readonly inventory = new Inventory();
  readonly survival = new Survival();
  /** First-steps hints in survival, and which are done. */
  readonly hints = new Hints();
  /** 3 while a workbench is in reach (all recipes), else 2 (hand recipes only). */
  craftSize = 2;
  /** Furnaces by cell key "x,y,z". */
  readonly furnaces = new Map<string, FurnaceState>();
  /** The furnace the screen shows, or null. */
  openFurnace: string | null = null;
  /** Chests' contents by cell key, and the one the screen shows. */
  readonly chests = new Map<string, (ItemStack | null)[]>();
  openChest: string | null = null;
  /** Which screen is open: none, the inventory (with crafting), a furnace or a chest. */
  screen: 'none' | 'inventory' | 'furnace' | 'chest' | WorkshopKind = 'none';
  readonly decorations = new Decorations();
  workshop: {kind:WorkshopKind;key:string}|null = null;
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
  /** Seconds to the next chip of the block being dug: a tap and a few fragments, so digging reads as progress. */
  private chipClock = 0;
  private repeat = 0;
  /** Bumped whenever anything the UI shows changes. */
  version = 0;
  /** Creatures the player can hit, if any live in this world. */
  creatures: Creatures | null = null;
  /** Creative building: the first corner of a box, edits waiting to be applied, and undo/redo history. */
  corner: [number, number, number] | null = null;
  private queue: [number, number, number, number][] = [];
  /** Creative copy: the first corner while marking, and the copied cells relative to the box's lowest corner. */
  copyCorner: [number, number, number] | null = null;
  clipboard: [number, number, number, number][] | null = null;
  private readonly undoStack: [number, number, number, number, number][][] = [];
  private readonly redoStack: [number, number, number, number, number][][] = [];
  private group: [number, number, number, number, number][] | null = null;
  private readonly setBlock: (x: number, y: number, z: number, s: number) => void;
  /** The world seed, for the loot of generated chests. */
  seed = 0;
  /** Milestones reached, running totals, and which structures' loot the player has opened. */
  readonly journal = new Journal();
  readonly stats: Stats = { days: 0, walkedM: 0, deaths: 0, killed: 0, mined: 0, wardens: 0 };
  readonly found = new Set<LootTable>();
  /** Biomes walked in (indices), and the deepest point reached (m). */
  readonly biomesSeen = new Set<number>();
  deepestM = 0;
  /** The beacon has been lit (the end), and whether its ending screen was seen. */
  beaconLit = false;
  endingSeen = false;
  /** A short message on screen (a milestone, a hint about the beacon), and seconds it stays. */
  message = '';
  private messageS = 0;
  /** Arrows and bolts in flight. */
  readonly projectiles = new Projectiles();
  /** Bits of broken blocks, and a count of swings of the hand (break, place, hit) for the first-person view. */
  readonly particles = new Particles();
  readonly visualEvents: {kind:'impact'|'sparks';x:number;y:number;z:number}[] = [];
  swings = 0;
  /** Sweeps of a sword or axe (for the slash trail), and recent hits (for floating damage numbers). */
  slashes = 0;
  readonly hits: { x: number; y: number; z: number; amount: number; crit: boolean; age: number }[] = [];
  /** While fishing: seconds until a fish bites, or 0 when the line is not out. */
  fishingS = 0;
  /** Seconds the bow has been drawn, while right click is held with it. */
  drawS = 0;
  /** The bestiary: kinds of creature seen near the player, and for each one killed, how many and what it dropped. */
  readonly seen = new Set<string>();
  readonly bestiary = new Map<string, { kills: number; drops: Set<string> }>();
  /** Writes every creature within 24 cells of the player in the bestiary as seen. */
  noteSeen(x: number, z: number): void {
    for (const c of this.creatures?.list ?? []) if (!this.seen.has(c.species.key) && Math.hypot(c.body.x - x, c.body.z - z) < 24) {
      this.seen.add(c.species.key);
      this.version++;
    }
  }
  /** Worn armour: head, chest, legs, feet. */
  readonly armour: (ItemStack | null)[] = [null, null, null, null];
  /** Worn accessories; each kind at most once. */
  readonly accessories: (ItemStack | null)[] = new Array(ACCESSORY_SLOTS).fill(null);

  /** The material of a full set of worn armour (all four pieces alike), or null. */
  get armourSet(): string | null {
    const keys = this.armour.map((a) => (a ? BLOCKS.type(a.state).key.split('_')[0]! : null));
    return keys[0] && keys.every((k) => k === keys[0]) ? keys[0] : null;
  }

  /** What the worn accessories (and a full armour set, and status effects) add up to. */
  get bonus(): { speed: number; jumps: number; featherfall: boolean; protection: number; breath: number; fireproof: boolean; regen: number; crit: number; thorns: number } {
    const b = { speed: 0, jumps: 0, featherfall: false, protection: 0, breath: 1, fireproof: false, regen: 1, crit: 0, thorns: 0 };
    const set = this.armourSet && SET_BONUSES[this.armourSet];
    if (set) {
      b.speed += set.speed ?? 0;
      b.protection += set.protection ?? 0;
      b.crit += set.crit ?? 0;
      b.thorns += set.thorns ?? 0;
    }
    for (const s of this.accessories) {
      const a = s && BLOCKS.type(s.state).accessory;
      if (!a) continue;
      b.speed += a.speed ?? 0;
      b.jumps += a.jumps ?? 0;
      b.featherfall ||= a.featherfall ?? false;
      b.protection += a.protection ?? 0;
      b.breath *= a.breath ?? 1;
      b.fireproof ||= a.fireproof ?? false;
      b.regen *= a.regen ?? 1;
    }
    // Potions and other status effects add to what is worn.
    const fx = this.survival;
    if (fx.has('swiftness')) b.speed += SWIFT_SPEED;
    if (fx.has('slowed')) b.speed += SLOWED_SPEED;
    b.fireproof ||= fx.has('fire_resistance');
    if (fx.has('water_breathing')) b.breath = Infinity;
    return b;
  }

  /** A click on accessory slot `slot`: only an accessory not worn elsewhere goes in. */
  clickAccessory(slot: number, right: boolean): void {
    const c = this.cursor;
    if (c && (!BLOCKS.type(c.state).accessory || this.accessories.some((a, i) => i !== slot && a?.state === c.state))) return;
    const box = [this.accessories[slot] ?? null];
    this.cursor = clickSlot(box, 0, c, right);
    this.accessories[slot] = box[0]!;
    this.version++;
  }
  /** Seconds since the player last hit a creature. */
  private sinceAttack = PLAYER_ATTACK_COOLDOWN_S;
  /** Food cooking on campfires by cell key: the raw item's state and seconds left for each. */
  readonly campfires = new Map<string, [number, number][]>();

  constructor(private readonly world: World, setBlock: (x: number, y: number, z: number, s: number) => void,
    private readonly events: { sound(name: 'break' | 'place' | 'eat', volume?: number): void; sleep(): boolean; fertilise?(x: number, y: number, z: number): boolean }, mode: Mode = 'creative') {
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
    if (input.consume('copy') && this.target) this.copy(this.target);
    if (input.consume('paste') && this.target && this.clipboard) {
      const t = this.target;
      for (const [dx, dy, dz, s] of this.clipboard) this.queue.push([t.x + t.nx + dx, t.y + t.ny + dy, t.z + t.nz + dz, s]);
      this.undoStack.push([]);
      this.redoStack.length = 0;
      this.version++;
    }
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
    const held = this.held; let state = clear ? AIR : held && !BLOCKS.type(held.state).item ? held.state : -1;
    if (state < 0) return;
    if(BLOCKS.type(state).key==='leaves')state=BLOCKS.byName('leaves').id+((state-BLOCKS.byName('leaves').id)|1);
    for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++) {
      for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) {
        for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++) this.queue.push([x, y, z, state]);
      }
    }
    this.undoStack.push([]);
    this.redoStack.length = 0;
    this.version++;
  }

  /** C on a block marks a corner; C again copies the box between the corners (at most BUILD_MAX_M a side). */
  private copy(t: RayHit): void {
    if (!this.copyCorner) {
      this.copyCorner = [t.x, t.y, t.z];
      this.toast('Copy: corner marked. Press C again on the opposite corner.', 3);
      return;
    }
    const a = this.copyCorner, b = [t.x, t.y, t.z], max = cells(BUILD_MAX_M);
    this.copyCorner = null;
    const lo = [0, 1, 2].map((k) => Math.min(a[k]!, b[k]!)), hi = [0, 1, 2].map((k) => Math.max(a[k]!, b[k]!));
    if ([0, 1, 2].some((k) => hi[k]! - lo[k]! + 1 > max)) {
      this.toast(`Too big to copy: at most ${BUILD_MAX_M} m a side.`, 3);
      return;
    }
    const cellsOut: [number, number, number, number][] = [];
    for (let y = lo[1]!; y <= hi[1]!; y++) for (let z = lo[2]!; z <= hi[2]!; z++) for (let x = lo[0]!; x <= hi[0]!; x++) {
      cellsOut.push([x - lo[0]!, y - lo[1]!, z - lo[2]!, this.world.get(x, y, z)]);
    }
    this.clipboard = cellsOut;
    this.toast(`Copied ${cellsOut.length} cells. V pastes against the face you aim at.`, 3);
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
    for (const s of [...this.inventory.slots, ...this.armour, ...this.accessories]) if (s) this.drops.spawn(s, x, y + 0.5, z, (Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6, DROP_PICKUP_DELAY_S);
    this.inventory.clear();
    this.armour.fill(null);
    this.accessories.fill(null);
    this.version++;
  }

  /** Starting kit in creative: one of each common block in the hotbar. */
  creativeHotbar(): void {
    ['stone', 'dirt', 'grass', 'planks', 'glass', 'torch', 'cobblestone', 'log', 'water'].forEach((k, i) => {
      if (!this.inventory.slots[i]) this.inventory.slots[i] = { state: S(k), count: 64 };
    });
  }

  update(dt: number, input: Input, player: Player, roll = Math.random()): void {
    // The hook lets go when the block it holds is gone.
    if (player.hook && this.hookCell && COLLISION[this.world.get(...this.hookCell)] === 0) player.hook = null;
    if (this.mode === 'creative') {
      this.build(input);
      this.drainQueue();
    }
    if (input.slot >= 0) this.select(input.slot);
    input.slot = -1;
    if (input.consume('slotNext')) this.select((this.inventory.selected + 1) % 9);
    if (input.consume('slotPrev')) this.select((this.inventory.selected + 8) % 9);
    if (input.consume('drop')) this.throwHeld(player);
    if (this.boating && input.descend) this.leaveBoat(player);
    const [dx, dy, dz] = player.direction();
    const b = player.body;
    this.feet = [b.x, b.y, b.z];
    this.target = raycast(b.x, player.eyeY, b.z, dx, dy, dz, toCells(REACH_M), (x, y, z) => TARGET[this.world.get(x, y, z)]!);
    this.repeat -= dt;
    this.sinceAttack += dt;
    if (this.fishingS > 0) this.fish(dt);
    if (this.messageS > 0 && (this.messageS -= dt) <= 0) {
      this.message = '';
      this.version++;
    }
    if (input.consume('pick') && this.target) this.pick(this.target);
    if (this.held && this.held.state === BOW) {
      // A bow: hold right click to draw, let go to shoot.
      input.consume('place');
      if (input.placing) this.drawS += dt;
      else if (this.drawS > 0) this.shootArrow(player);
    } else this.drawS = 0;
    const spell = this.held ? BLOCKS.type(this.held.state).spell : undefined;
    this.castClock = Math.max(0, this.castClock - dt);
    if (spell) {
      // A staff: hold right click to keep casting while mana lasts.
      const pressed = input.consume('place');
      if ((pressed || input.placing) && this.castClock <= 0) this.castSpell(player, spell);
    } else {
      const placeNow = input.consume('place') || (input.placing && this.repeat <= 0);
      if (placeNow) {
        this.repeat = REPEAT_S;
        this.record(() => this.use(player, input.descend));
      }
    }
    const clicked = input.consume('break');
    if (clicked && this.creatures && this.attack(b.x, player.eyeY, b.z, dx, dy, dz)) return;
    if (input.breaking && this.target) this.record(() => this.dig(dt, clicked, roll));
    else {
      this.breaking = 0;
      this.breakingCell = '';
    }
  }

  /**
   * A swing. Swords and axes sweep an arc in front and hit every creature inside it; anything else hits the creature
   * under the crosshair. Creatures behind the targeted block are safe. Returns whether anything was hit.
   */
  private attack(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
    const held = this.held, tool = held ? BLOCKS.type(held.state).tool : undefined;
    const arc = tool?.kind === 'sword' ? SWORD_ARC_RAD : tool?.kind === 'axe' ? AXE_ARC_RAD : 0, reach = toCells(REACH_M);
    // Only a solid block shields creatures behind it: a swing goes through grass and flowers.
    const t = this.target, wall = t && BLOCKS.type(this.world.get(t.x, t.y, t.z)).solid ? t.distance + 0.5 : Infinity;
    let victims: Creature[];
    if (arc) {
      victims = this.creatures!.list.filter((c) => {
        const cx = c.body.x - ox, cy = c.body.y + c.body.height * 0.5 - oy, cz = c.body.z - oz, d = Math.hypot(cx, cy, cz);
        // Measured to the creature's near side, as the crosshair prompt is: big creatures are not hidden by their own size.
        if (d - c.body.halfWidth > reach || d - c.body.halfWidth > wall) return false;
        return d < c.body.halfWidth + 0.6 || Math.acos(Math.max(-1, Math.min(1, (cx * dx + cy * dy + cz * dz) / d))) <= arc;
      });
      // Swinging at nothing still slashes the air, when no block is in reach to dig.
      if (!victims.length && !this.target) {
        this.slashes++;
        this.swings++;
        this.sinceAttack = 0;
        this.version++;
      }
    } else {
      const hit = this.creatures!.raycast(ox, oy, oz, dx, dy, dz, reach);
      victims = hit && hit.distance < wall ? [hit.creature] : [];
    }
    if (!victims.length) return false;
    // Quick swings land weaker blows: the hit's strength recovers over the cooldown.
    const strength = Math.max(0.2, Math.min(1, this.sinceAttack / PLAYER_ATTACK_COOLDOWN_S));
    this.sinceAttack = 0;
    const crit = Math.random() < CRIT_CHANCE + this.bonus.crit, damage = strength * weaponDamage(held) * (crit ? CRIT_FACTOR : 1);
    const knock = (KNOCKBACK_FACTOR[tool?.kind ?? 'hand'] ?? 1) * (0.5 + strength * 0.5);
    if (arc) this.slashes++;
    for (const c of victims) {
      const top = c.body.y + c.body.height;
      if (this.visualEvents.length < 64) this.visualEvents.push({ kind: 'sparks', x: c.body.x, y: c.body.y + c.body.height * .65, z: c.body.z });
      if (this.hits.length < 32) this.hits.push({ x: c.body.x, y: top, z: c.body.z, amount: Math.max(1, Math.round(damage)), crit, age: 0 });
      if (this.creatures!.damage(c, damage, ox, oz, knock) && this.mode === 'survival') {
        this.defeated(c);
      }
    }
    if (held && tool && this.mode === 'survival' && !wearTool(held)) this.inventory.slots[this.inventory.selected] = null;
    this.events.sound('break');
    this.swings++;
    this.version++;
    return true;
  }

  /** Marks milestones reached since last time, with a message for each, and gives their rewards. */
  checkJournal(): void {
    const before = new Set(this.journal.done);
    const fresh = this.journal.update({
      has: (k) => this.hasItem(k), stats: this.stats, deepestM: this.deepestM, biomes: this.biomesSeen.size, found: this.found,
      armour: this.armour.some((a) => a !== null), beacon: this.beaconLit,
    });
    if (!fresh.length) return;
    const gifts: string[] = [];
    for (const m of MILESTONES) {
      if (before.has(m.id) || !this.journal.done.has(m.id)) continue;
      this.give({ state: BLOCKS.state(m.reward[0]), count: m.reward[1] }, ...this.feet);
      gifts.push(`${m.reward[1]} ${BLOCKS.byName(m.reward[0]).name}`);
    }
    this.toast(`Milestone: ${fresh.join(', ')} · reward: ${gifts.join(', ')}`, 5);
  }

  /** The line is out: a fish bites after a while, unless the rod was put away. */
  private fish(dt: number): void {
    if (this.held?.state !== ROD) {
      this.fishingS = 0;
      return;
    }
    if ((this.fishingS -= dt) > 0) return;
    this.fishingS = 0;
    this.give({ state: FISH, count: 1 }, ...this.feet);
    this.toast('A fish! Right-click the water again to cast.', 3);
    this.events.sound('place');
  }

  /** Right click with a rod: casts into water in view (or reels the line back in). */
  private castRod(player: Player): void {
    if (this.fishingS > 0) {
      this.fishingS = 0;
      this.toast('Line reeled in.', 2);
      return;
    }
    const [dx, dy, dz] = player.direction(), b = player.body;
    const hit = raycast(b.x, player.eyeY, b.z, dx, dy, dz, toCells(REACH_M) * 2, (x, y, z) => {
      const s = this.world.get(x, y, z);
      return WATERS.has(s) ? 16 << 5 : TARGET[s]!;
    });
    if (!hit || !WATERS.has(this.world.get(hit.x, hit.y, hit.z))) {
      this.toast('Cast the line into water.', 2);
      return;
    }
    this.fishingS = FISH_MIN_S + Math.random() * (FISH_MAX_S - FISH_MIN_S);
    this.toast('Waiting for a bite…', this.fishingS);
  }

  /** Counts a creature the player defeated. */
  /** A creature killed by the player: counted, its loot dropped, and both written in the bestiary. */
  private defeated(c: Creature): void {
    this.stats.killed++;
    const entry = this.bestiary.get(c.species.key) ?? { kills: 0, drops: new Set<string>() };
    this.bestiary.set(c.species.key, entry);
    entry.kills++;
    for (const loot of lootOf(c)) {
      entry.drops.add(BLOCKS.type(loot.state).key);
      this.drop(loot, c.body.x, c.body.y, c.body.z);
    }
    if (c.species.guardian) {
      this.stats.wardens++;
      this.toast('The Ember Warden falls. The shrine is yours.', 4);
    }
  }

  /**
   * Wakes the Ember Warden of each shrine near the player whose ancient chest was never opened (call about once a
   * second). It stands by the pedestal; the chest stays shut while it lives.
   */
  wakeGuardians(player: Player): void {
    const creatures = this.creatures, b = player.body;
    if (!creatures || this.mode !== 'survival' || DIFFICULTY[this.difficulty].hostiles <= 0) return;
    const r = toCells(GUARD_M) * 2, px = Math.floor(b.x), pz = Math.floor(b.z);
    for (const site of sitesNear(this.seed, px - r, pz - r, px + r, pz + r)) {
      if (site.kind !== 'shrine') continue;
      const ground = this.world.surfaceAt(site.x, site.z);
      if (ground === undefined) continue;
      const floor = undergroundFloor(this.seed, 'shrine', site.x, site.z, ground);
      if (Math.abs(b.y - floor) > r || BLOCKS.type(this.world.get(site.x, floor + 1, site.z)) !== ANCIENT) continue;
      if (this.chests.has(`${site.x},${floor + 1},${site.z}`) || creatures.guardianNear(site.x + 0.5, floor, site.z + 0.5, r)) continue;
      creatures.add(WARDEN, site.x + 0.5, floor, site.z - 1.5, WARDEN.health);
      this.toast('Something stirs in the shrine…', 3);
    }
  }

  /**
   * Brings each village house near the player to life (call about once a second): a house whose bed still stands and
   * whose villager is not about gets its villager back, by the bed.
   */
  wakeVillagers(player: Player): void {
    const creatures = this.creatures;
    if (!creatures) return;
    const r = 48, px = Math.floor(player.body.x), pz = Math.floor(player.body.z);
    for (const site of sitesNear(this.seed, px - r, pz - r, px + r, pz + r)) {
      if (site.kind !== 'house') continue;
      const bx = site.x + HOUSE_BED[0], bz = site.z + HOUSE_BED[1], ground = this.world.surfaceAt(site.x, site.z);
      if (ground === undefined) continue;
      let bed = -1;
      for (let y = ground - 4; y <= ground + 6 && bed < 0; y++) if (this.world.isLoaded(bx, y, bz) && BLOCKS.type(this.world.get(bx, y, bz)) === BED) bed = y;
      // Home is the bed's head cell: lying there, the villager's feet reach past the foot of the bed.
      if (bed < 0 || creatures.list.some((c) => c.home && c.home[0] === bx + 1.5 && c.home[2] === bz + 0.5)) continue;
      const species = SPECIES_BY_KEY.get(professionAt(this.seed, site.x, site.z))!;
      const c = creatures.add(species, site.x + 0.5, bed, site.z + 0.5, species.health);
      c.home = [bx + 1.5, bed, bz + 0.5];
    }
    this.wakeHomes(player);
  }

  /** Homes made by placing a bed, by the bed head's cell: who lives there (null until someone moves in). */
  readonly homes = new Map<string, Home>();

  /** The room check for a home's bed: from the open cell just above the bed head. */
  private roomOf(h: Home) {
    return checkRoom((x, y, z) => (this.world.isLoaded(x, y, z) ? this.world.get(x, y, z) : 0), h.x, h.y + 1, h.z);
  }

  /** Who moves into the next new home: the first townsfolk whose time has come and who has no home yet, else a villager. */
  private nextArrival(): string {
    const housed = new Set([...this.homes.values()].map((h) => h.who));
    const potions = POTIONS.some(([k]) => this.hasItem(k)) || this.hasItem('glass_bottle') || this.hasItem('alchemy_table');
    const ready: [string, boolean][] = [['guide', true], ['merchant', this.inventory.count(BLOCKS.state('trade_coin')) >= 20], ['nurse', this.survival.maxHealth > MAX_HEALTH],
      ['alchemist', potions]];
    return ready.find(([who, ok]) => ok && !housed.has(who))?.[0] ?? ['farmer', 'smith', 'herbalist'][this.homes.size % 3]!;
  }

  /**
   * Player-built homes near the player (call about once a second): a home whose bed is gone is no more; one whose room
   * is a home and whose resident is not about gets them back (or a new arrival), by the bed.
   */
  private wakeHomes(player: Player): void {
    const creatures = this.creatures!;
    for (const [key, h] of this.homes) {
      if (Math.hypot(h.x - player.body.x, h.z - player.body.z) > 64 || !this.world.isLoaded(h.x, h.y, h.z)) continue;
      if (BLOCKS.type(this.world.get(h.x, h.y, h.z)) !== BED) {
        this.homes.delete(key);
        continue;
      }
      const at: [number, number, number] = [h.x + 0.5, h.y, h.z + 0.5];
      if (creatures.list.some((c) => c.home && c.home[0] === at[0] && c.home[1] === at[1] && c.home[2] === at[2]) || !this.roomOf(h).ok) continue;
      const arriving = h.who === null;
      h.who ??= this.nextArrival();
      const species = SPECIES_BY_KEY.get(h.who)!, c = creatures.add(species, at[0], h.y + 1, at[2], species.health);
      c.home = at;
      c.homeYaw = h.yaw;
      if (arriving) this.toast(`The ${species.name.toLowerCase()} has moved in!`, 4);
    }
  }

  /** Highest sky-blocking cell of column (x, z), if loaded. */
  private skyTop(x: number, z: number): number | undefined {
    return this.world.column(x >> 4, z >> 4)?.skyTop[((z & 15) << 4) | (x & 15)];
  }

  /**
   * Lightning lands on column (x, z) (cells): it scorches the ground it hits (grass to dirt, sand to glass) and hurts
   * the player and creatures standing under open sky within reach.
   */
  strike(x: number, z: number, player: Player): void {
    const cx = Math.floor(x), cz = Math.floor(z), top = this.skyTop(cx, cz);
    if (top === undefined || !this.world.isLoaded(cx, top, cz)) return;
    const scorched = SCORCH.get(this.world.get(cx, top, cz));
    if (scorched !== undefined) this.setBlock(cx, top, cz, scorched);
    const reach = toCells(LIGHTNING_REACH_M), y = top + 1;
    const open = (b: { x: number; y: number; z: number }) => (this.skyTop(Math.floor(b.x), Math.floor(b.z)) ?? Infinity) < b.y + 0.01;
    const near = (b: { x: number; y: number; z: number }) => Math.hypot(b.x - x, b.y - y, b.z - z) < reach && open(b);
    if (this.mode === 'survival' && !this.survival.dead && near(player.body)) {
      this.survival.hurt(this.protect(LIGHTNING_DAMAGE), 'struck by lightning');
      this.version++;
    }
    for (const c of [...(this.creatures?.list ?? [])]) if (near(c.body)) this.creatures!.damage(c, LIGHTNING_DAMAGE * 2, x, z);
  }

  /** Riding a boat (saved; the player's body follows it). */
  boating = false;

  /** Right click with a boat on water in view: put it in and get in. */
  private board(player: Player): void {
    const [dx, dy, dz] = player.direction(), b = player.body;
    const hit = raycast(b.x, player.eyeY, b.z, dx, dy, dz, toCells(REACH_M), (x, y, z) => {
      const s = this.world.get(x, y, z);
      return WATERS.has(s) ? 16 << 5 : TARGET[s]!;
    });
    if (!hit || !WATERS.has(this.world.get(hit.x, hit.y, hit.z)) || WATERS.has(this.world.get(hit.x, hit.y + 1, hit.z))) {
      this.toast('Put the boat on the surface of water.', 2);
      return;
    }
    this.consumeHeld();
    this.boating = player.boating = true;
    Object.assign(b, { x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5, vx: 0, vy: 0, vz: 0 });
    this.toast('Crouch to step out of the boat.', 3);
    this.events.sound('place');
  }

  /** Steps out of the boat; in survival it goes back in the inventory. */
  leaveBoat(player: Player): void {
    if (!this.boating) return;
    this.boating = player.boating = false;
    const b = player.body;
    if (this.mode === 'survival') this.give({ state: BOAT, count: 1 }, b.x, b.y + 1, b.z);
  }

  /** Shows `text` on screen for a few seconds. */
  toast(text: string, seconds = 5): void {
    this.message = text;
    this.messageS = seconds;
    this.version++;
  }

  /** A chest's slots, rolling its loot first if it is a generated one opened for the first time. */
  private chestSlots(key: string, state: number): (ItemStack | null)[] {
    let slots = this.chests.get(key);
    if (!slots) {
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      const table = lootTableFor(BLOCKS.type(state).key, y);
      slots = rollLoot(this.seed, x, y, z, table, CHEST_SLOTS);
      this.found.add(table);
      this.chests.set(key, slots);
    }
    return slots;
  }

  /** Right click on a beacon: it lights only high up under open sky, and that is the end of the journey. */
  private lightBeacon(x: number, y: number, z: number): void {
    const column = this.world.column(x >> 4, z >> 4);
    const open = column !== undefined && column.skyTop[((z & 15) << 4) | (x & 15)]! <= y;
    if (y * BLOCK_SIZE_M < BEACON_MIN_M || !open) {
      this.toast(`The beacon stays dark. It needs open sky, at least ${BEACON_MIN_M} m high (here ${Math.round(y * BLOCK_SIZE_M)} m).`);
      return;
    }
    this.setBlock(x, y, z, LIT_BEACON);
    this.beaconLit = true;
    this.version++;
  }

  /** Lets an arrow fly where the player looks, stronger the longer the bow was drawn; uses up an arrow in survival. */
  /** Seconds until the held staff can cast again. */
  private castClock = 0;

  /** Casts a magic bolt from the held staff along the view, if there is mana for it. */
  private castSpell(player: Player, spell: NonNullable<ReturnType<typeof BLOCKS.type>['spell']>): void {
    if (this.mode === 'survival' && !this.survival.cast(spell.mana)) {
      this.castClock = 0.25;
      return;
    }
    this.castClock = spell.cooldown;
    const [dx, dy, dz] = player.direction(), b = player.body;
    this.projectiles.shoot(b.x + dx * 0.7, player.eyeY - 0.15, b.z + dz * 0.7, dx, dy, dz, toCells(spell.speed), spell.damage, true, true);
    this.swings++;
    this.events.sound('place', 0.5);
    this.version++;
  }

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
  shootAtPlayer(x: number, y: number, z: number, player: Player, damage: number, by = 'Skulker'): void {
    const b = player.body, speed = toCells(BOLT_SPEED_M_S);
    const [dx, dy, dz] = aimAt(x, y, z, b.x, b.y + b.height * 0.7, b.z, speed);
    this.projectiles.shoot(x, y, z, dx, dy, dz, speed, damage, false, false, by);
  }

  /** Flies every arrow and bolt; hits hurt creatures or the player, and the player's arrows that miss can be picked up. */
  tickProjectiles(dt: number, boxAt: BoxAt, player: Player): void {
    const creatures = this.creatures;
    const hits = this.projectiles.update(dt, boxAt, (fromPlayer) => (fromPlayer ? creatures?.list.map((c) => c.body) ?? []
      : this.mode === 'survival' && !this.survival.dead ? [player.body] : []));
    for (const h of hits) {
      const p = h.p;
      if (p.magic && this.visualEvents.length < 64) this.visualEvents.push({ kind: 'sparks', x: p.x, y: p.y, z: p.z });
      if (h.kind === 'ground') {
        if (p.fromPlayer && !p.magic && this.mode === 'survival') this.drops.spawn({ state: ARROW, count: 1 }, p.x, p.y, p.z);
        continue;
      }
      if (!p.fromPlayer) {
        this.survival.hurt(this.protect(p.damage * DIFFICULTY[this.difficulty].damage), `shot by a ${(p.by ?? 'skulker').toLowerCase()}`);
        this.version++;
        continue;
      }
      const c = creatures?.list.find((k) => k.body === h.body);
      if (c && this.hits.length < 32) this.hits.push({ x: c.body.x, y: c.body.y + c.body.height, z: c.body.z, amount: Math.max(1, Math.round(p.damage)), crit: false, age: 0 });
      if (c && creatures!.damage(c, p.damage, p.x - p.vx, p.z - p.vz) && this.mode === 'survival') {
        this.defeated(c);
      }
    }
  }

  /** Damage left after worn armour (see `armourFactor`); every hit wears each piece. */
  protect(damage: number): number {
    let points = this.bonus.protection;
    this.armour.forEach((a, i) => {
      if (!a) return;
      const def = BLOCKS.type(a.state).armour!;
      points += def.protection + (a.upgrade ?? 0);
      a.wear = (a.wear ?? 0) + 1;
      if (a.wear >= def.durability * (1 + (a.upgrade ?? 0) * .5)) this.armour[i] = null;
    });
    this.version++;
    return damage * armourFactor(points);
  }

  /** °C of cold the worn armour keeps off. */
  get warmth(): number {
    return this.armour.reduce((sum, a) => sum + (a ? BLOCKS.type(a.state).armour!.warmth + (a.upgrade ?? 0) : 0), 0);
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

  /** Pick a building material, selecting a hotbar stack or swapping one out of the backpack. */
  private pick(t: RayHit): void {
    const s = buildingMaterial(this.world.get(t.x, t.y, t.z));
    const slots = this.inventory.slots;
    const index = slots.findIndex(stack => stack !== null && buildingMaterial(stack.state) === s);
    if (index >= 0 && index < 9) this.select(index);
    else if (this.mode === 'creative') slots[this.inventory.selected] = { state: s, count: 64 };
    else if (index >= 9) {
      [slots[this.inventory.selected], slots[index]] = [slots[index]!, slots[this.inventory.selected]!];
    } else {
      this.toast(`No ${BLOCKS.type(s).name} in your inventory.`, 2);
      return;
    }
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
      this.chipClock = 0;
    }
    const seconds = breakSeconds(state, this.held);
    this.breaking = seconds <= 0 ? 1 : this.breaking + dt / seconds;
    this.chipClock -= dt;
    if (this.chipClock <= 0 && this.breaking < 1) {
      this.chipClock = 0.2;
      this.particles.burst(state, t.x + 0.5, t.y + 0.5, t.z + 0.5, 3);
      this.events.sound('break', 0.35);
      this.swings++;
    }
    if (this.breaking >= 1) {
      this.breaking = 0;
      this.breakingCell = '';
      this.breakCell(t.x, t.y, t.z, state, true, roll);
    }
  }

  private breakCell(x: number, y: number, z: number, state: number, survival: boolean, roll: number): void {
    if(this.visualEvents.length<64)this.visualEvents.push({kind:'impact',x:x+.5,y:y+.5,z:z+.5});
    const type = BLOCKS.type(state);
    if (survival) {
      this.stats.mined++;
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
    if (type === CHEST || type === ANCIENT) {
      const key = `${x},${y},${z}`;
      if (survival) for (const s of this.chestSlots(key, state)) if (s) this.drop(s, x + 0.5, y, z + 0.5);
      this.chests.delete(key);
    }
    this.particles.burst(state, x + 0.5, y + 0.5, z + 0.5);
    this.swings++;
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
  private use(player: Player, placeOnly = false): void {
    if (placeOnly && this.target && this.held && !BLOCKS.type(this.held.state).item) {
      this.place(this.target, this.held, player);
      return;
    }
    if(this.creatures){
      const [dx,dy,dz]=player.direction(),b=player.body;
      const hit=this.creatures.raycast(b.x,player.eyeY,b.z,dx,dy,dz,toCells(REACH_M));
      if(hit?.creature.species.trader&&(!this.target||hit.distance<this.target.distance)){
        this.openWorkshop('trade',`mob:${hit.creature.id}`);return;
      }
    }
    if (this.useBucket(player)) return;
    if (this.held?.state === ROD) {
      this.castRod(player);
      return;
    }
    if (this.held?.state === BOAT && !this.boating) {
      this.board(player);
      return;
    }
    if (this.feedCreature(player)) return;
    const t = this.target;
    if (t) {
      const state = this.world.get(t.x, t.y, t.z), type = BLOCKS.type(state);
      const workshop = WORKSHOP_BLOCKS[type.key];
      if(workshop){this.openWorkshop(workshop,`${t.x},${t.y},${t.z}`);return;}
      if (type === DOOR) {
        const v = BLOCKS.variant(state), next = DOOR.id + (v < 4 ? v + 4 : v - 4);
        for (const [x, y, z] of this.doorCells(t.x, t.y, t.z)) this.setBlock(x, y, z, next);
        return;
      }
      if (type === CHEST || type === ANCIENT) {
        if (type === ANCIENT && this.creatures?.guardianNear(t.x + 0.5, t.y, t.z + 0.5, toCells(GUARD_M))) {
          this.toast('The Ember Warden guards the chest.', 2);
          return;
        }
        const key = `${t.x},${t.y},${t.z}`;
        this.chestSlots(key, state);
        this.openChest = key;
        this.openScreen('chest', 2);
        return;
      }
      if (state === BEACON) {
        this.lightBeacon(t.x, t.y, t.z);
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
    if (heldType.key === 'grappling_hook') {
      this.fireHook(player);
      return;
    }
    if (heldType.potion) {
      this.drink(heldType.potion);
      return;
    }
    if (heldType.key === 'life_crystal') {
      if (this.survival.growHeart()) {
        if (this.mode === 'survival') this.inventory.useHeld();
        this.toast(`Your heart grows stronger: ${this.survival.maxHealth} health`, 4);
        this.events.sound('eat');
      } else this.toast('Your heart can grow no stronger', 3);
      this.version++;
      return;
    }
    if ((heldType.key === 'slime_crown' || heldType.key === 'moth_lure') && this.creatures) {
      // Calls a boss: it arrives a little way off, ready to fight. One at a time; the Matriarch only comes at night.
      const moth = heldType.key === 'moth_lure';
      if (this.creatures.list.some((c) => c.species.boss)) this.toast('A boss is already here', 3);
      else if (moth && this.daylight > 0.35) this.toast('The lure only draws her out at night', 3);
      else {
        const boss = SPECIES_BY_KEY.get(moth ? 'gloom_matriarch' : 'king_slime')!, [x, y, z] = this.feet, a = Math.random() * Math.PI * 2;
        this.creatures.add(boss, x + Math.cos(a) * 9, y + (moth ? 10 : 6), z + Math.sin(a) * 9, boss.health);
        if (this.mode === 'survival') this.inventory.useHeld();
        this.toast(moth ? 'The Gloom Matriarch descends!' : 'The Slime King has awoken!', 4);
      }
      return;
    }
    if (heldType.accessory) {
      const free = this.accessories.indexOf(null);
      if (free >= 0 && !this.accessories.some((a) => a?.state === held.state)) {
        this.accessories[free] = held;
        this.inventory.slots[this.inventory.selected] = null;
        this.events.sound('place');
        this.version++;
      } else this.toast(free < 0 ? 'Every accessory slot is full' : `You already wear a ${heldType.name}`, 3);
      return;
    }
    if (heldType.tool?.kind === 'hoe' && t && t.ny === 1) {
      const ground = this.world.get(t.x, t.y, t.z);
      if ((ground === GRASS || ground === DIRT) && TARGET[this.world.get(t.x, t.y + 1, t.z)] === 0) {
        this.setBlock(t.x, t.y, t.z, FARMLAND);
        if (this.mode === 'survival' && !wearTool(held)) this.inventory.slots[this.inventory.selected] = null;
        this.events.sound('place');
        this.version++;
      }
      return;
    }
    if (held.state === BONE_MEAL && t && this.events.fertilise?.(t.x, t.y, t.z)) {
      this.consumeHeld();
      return;
    }
    // Food is eaten when hungry, unless it is a crop being planted on grass or dirt.
    if (heldType.food && this.mode === 'survival') {
      const ground = t ? this.world.get(t.x, t.y, t.z) : AIR;
      const planting = heldType.variantTiles !== undefined && t !== null && t.ny === 1 && (ground === GRASS || ground === DIRT || ground === FARMLAND);
      if (!planting && this.survival.eat(heldType.food)) {
        // A cooked meal leaves the player well fed: health comes back faster for a while.
        if (WELL_FED_FOODS.has(heldType.key)) this.survival.addEffect('well_fed', WELL_FED_S);
        this.events.sound('eat');
        this.consumeHeld();
        return;
      }
    }
    if (!t || heldType.item) return;
    this.place(t, held, player);
  }

  /** A creature's bite lands: its damage through armour, and maybe the status effect it carries. */
  bitten(damage: number, by: string, s?: { inflicts?: readonly [string, number, number] }, rand = Math.random, biter?: Creature): void {
    if (this.mode !== 'survival' || this.survival.dead) return;
    this.survival.hurt(this.protect(damage * DIFFICULTY[this.difficulty].damage), `killed by a ${by.toLowerCase()}`);
    // Jade armour bites back.
    const thorns = this.bonus.thorns;
    if (thorns && biter && biter.health > 0 && this.creatures?.damage(biter, thorns, this.feet[0], this.feet[2], 0.5)) this.defeated(biter);
    const [effect, seconds, chance] = s?.inflicts ?? ['', 0, 0];
    if (rand() < chance) {
      if (effect === 'burning') { if (!this.bonus.fireproof) this.survival.burning = Math.max(this.survival.burning, seconds); }
      else if (isEffect(effect)) this.survival.addEffect(effect, seconds);
    }
    this.version++;
  }

  /** The block the grappling hook holds. */
  private hookCell: [number, number, number] | null = null;
  /** Throws the grappling hook at the solid block in view within reach, or takes it back if it is out. */
  private fireHook(player: Player): void {
    if (player.hook) {
      player.hook = null;
      return;
    }
    const [dx, dy, dz] = player.direction(), b = player.body;
    const hit = raycast(b.x, player.eyeY, b.z, dx, dy, dz, toCells(HOOK_RANGE_M), (x, y, z) => COLLISION[this.world.get(x, y, z)]!);
    if (!hit) {
      this.toast('Nothing in reach to hook onto', 2);
      return;
    }
    // Just outside the face it hit, so the point is in open air and the player is pulled flat against the block.
    const d = hit.distance - 0.05;
    player.hook = [b.x + dx * d, player.eyeY + dy * d, b.z + dz * d];
    this.hookCell = [hit.x, hit.y, hit.z];
    this.events.sound('place', 0.5);
  }

  /** Drinks the held potion. A healing potion brings Potion sickness, and none is drunk while it lasts. */
  private drink(p: NonNullable<BlockType['potion']>): void {
    const s = this.survival;
    if (p.heal && s.has('potion_sickness')) {
      this.toast(`Too soon for another: ${Math.ceil(s.effects.potion_sickness!)} s of potion sickness left`, 3);
      return;
    }
    if (p.heal) {
      s.health = Math.min(s.maxHealth, s.health + p.heal);
      s.addEffect('potion_sickness', POTION_SICKNESS_S);
    }
    if (p.cures) {
      delete s.effects.poisoned;
      delete s.effects.bleeding;
    }
    if (p.effect && isEffect(p.effect)) s.addEffect(p.effect, p.seconds ?? 30);
    if (this.mode === 'survival') this.inventory.useHeld();
    this.events.sound('eat');
    this.version++;
  }

  /** Right click with an animal's food on the animal in view: it eats it and is ready to breed. */
  private feedCreature(player: Player): boolean {
    const held = this.held;
    if (!held || !this.creatures) return false;
    const key = BLOCKS.type(held.state).key, [dx, dy, dz] = player.direction(), b = player.body;
    const hit = this.creatures.raycast(b.x, player.eyeY, b.z, dx, dy, dz, toCells(REACH_M));
    if (!hit || (this.target && this.target.distance < hit.distance) || !hit.creature.species.food?.includes(key)) return false;
    if (!this.creatures.feed(hit.creature)) return false;
    this.consumeHeld();
    return true;
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
    if ((type.variantTiles || type.key === 'sapling') && below !== GRASS && below !== DIRT && below !== FARMLAND) return;
    // The way the player looks decides which way a door, bed, stairs or furnace faces.
    const [fx, , fz] = player.direction();
    const facing = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 0 : 1) : fz > 0 ? 2 : 3;
    const toward = [1, 0, 3, 2][facing]!;
    let state = held.state;
    if (type === DOOR) {
      for (let k = 0; k < DOOR_CELLS; k++) if (TARGET[this.world.get(x, y + k, z)] !== 0 || !this.free(x, y + k, z, player, true)) return;
      for (let k = 0; k < DOOR_CELLS; k++) this.setBlock(x, y + k, z, DOOR.id + facing);
      this.consumeHeld(true);
      this.events.sound('place');
      return;
    }
    if (type === BED) {
      const [ox, oz] = FACING_OFFSET[facing]!;
      if (TARGET[this.world.get(x + ox, y, z + oz)] !== 0 || !this.free(x, y, z, player) || !this.free(x + ox, y, z + oz, player)) return;
      this.setBlock(x, y, z, BED.id + facing);
      this.setBlock(x + ox, y, z + oz, BED.id + facing + 4);
      this.consumeHeld(true);
      this.events.sound('place');
      // A bed makes a home: someone moves in once the room around it is one.
      const home: Home = { x: x + ox, y, z: z + oz, yaw: Math.PI + Math.atan2(-oz, ox), who: null };
      this.homes.set(`${home.x},${home.y},${home.z}`, home);
      const room = this.roomOf(home);
      this.toast(room.ok ? 'A fine home: someone will move in soon.' : `Not a home yet: it needs ${room.missing.join(', ')}.`, 5);
      return;
    }
    // A ladder goes on the side of a wall, hanging on the face that was clicked.
    if (type === LADDER) {
      if (t.ny !== 0) return;
      state = LADDER.id + (t.nx === -1 ? 0 : t.nx === 1 ? 1 : t.nz === -1 ? 2 : 3);
    } else if (type.key === 'leaves') state = type.id + ((held.state-type.id)|1);
    else if (['sign','item_frame'].includes(type.key)) {
      if(t.ny!==0){this.toast('Place this against the side of a wall.',2);return;}
      state=type.id+(t.nx>0?0:t.nx<0?1:t.nz>0?2:3);
    }
    else if (type.front) state = type.id + toward;
    else if (type.key.endsWith('_stairs')) state = type.id + facing;
    else if (type.slabOf && t.ny === -1) state = type.id + 1;
    if (!this.free(x, y, z, player, false, state)) return;
    this.setBlock(x, y, z, state);
    if (type === FURNACE) this.furnaces.set(`${x},${y},${z}`, newFurnace());
    // A chest the player places starts empty (generated ones roll their loot when first opened).
    if (type === CHEST) this.chests.set(`${x},${y},${z}`, new Array(CHEST_SLOTS).fill(null));
    this.consumeHeld(true);
    this.swings++;
    this.events.sound('place');
  }

  /** Whether a block placed at (x, y, z) would leave the player free. */
  private free(x: number, y: number, z: number, player: Player, solidCell = false, state = TORCH): boolean {
    const box = solidCell ? FULL : COLLISION[state]!;
    return box === 0 || !overlapsSolid(player.body, (cx, cy, cz) => (cx === x && cy === y && cz === z ? box : 0));
  }

  private consumeHeld(refill = false): void {
    if (this.mode === 'survival') this.inventory.useHeld(refill);
    this.version++;
  }

  openWorkshop(kind:WorkshopKind,key:string):void {
    this.workshop={kind,key};this.openScreen(kind);
  }
  private workshopValid(kind:WorkshopKind):boolean {
    const w=this.workshop;if(!w||w.kind!==kind||this.screen!==kind)return false;
    if(w.key.startsWith('mob:')){
      const c=this.creatures?.list.find(c=>c.id===Number(w.key.slice(4))&&c.species.trader);
      return !!c&&Math.hypot(c.body.x-this.feet[0],c.body.y-this.feet[1],c.body.z-this.feet[2])<=toCells(REACH_M)+1;
    }
    const [x,y,z]=w.key.split(',').map(Number);
    return [x,y,z].every(Number.isFinite)&&this.world.isLoaded(x!,y!,z!)&&
      WORKSHOP_BLOCKS[BLOCKS.type(this.world.get(x!,y!,z!)).key]===kind&&Math.hypot(x!+.5-this.feet[0],y!+.5-this.feet[1],z!+.5-this.feet[2])<=toCells(REACH_M)+2;
  }
  /** The offers of the open trade: a villager's own shop, or the general list. */
  get offers(): readonly TradeOffer[] {
    const w = this.workshop;
    const c = w?.key.startsWith('mob:') ? this.creatures?.list.find((m) => m.id === Number(w.key.slice(4))) : undefined;
    return (c?.species.shop && SHOPS[c.species.shop]) || TRADE_OFFERS;
  }
  performTrade(offer:number):boolean {
    const ok=this.workshopValid('trade')&&trade(this.inventory,offer,this.offers);this.toast(ok?'Trade completed.':'Trade unavailable: check payment, space and reach.',2);this.version++;return ok;
  }
  performForge(slot:number):boolean {
    const ok=this.workshopValid('forge')&&forge(this.inventory,slot);this.toast(ok?'Ember upgrade applied.':'Needs ember crystals, two iron ingots and eligible equipment (maximum level 3).',3);this.version++;return ok;
  }
  writeSign(text:string):boolean {
    if(!this.workshopValid('sign'))return false;this.decorations.setSign(this.workshop!.key,text);this.version++;return true;
  }
  frameItem(slot:number|null):boolean {
    if(!this.workshopValid('frame'))return false;const ok=this.decorations.frame(this.inventory,this.workshop!.key,slot);this.version++;return ok;
  }

  openScreen(screen: 'inventory' | 'furnace' | 'chest' | WorkshopKind, craftSize = 2): void {
    this.screen = screen;
    // A workbench within a few steps counts, as in Terraria.
    this.craftSize = craftSize === 3 || (screen === 'inventory' && this.near(TABLE, 4)) ? 3 : 2;
    this.alchemy = screen === 'inventory' && this.near(ALCHEMY, 4);
    this.version++;
  }

  /** Whether a block of type `type` (any variant) is within `r` cells of the feet. */
  private near(type: number, r: number): boolean {
    const [fx, fy, fz] = this.feet.map(Math.floor) as [number, number, number];
    for (let y = fy - 2; y <= fy + 3; y++) for (let z = fz - r; z <= fz + r; z++) for (let x = fx - r; x <= fx + r; x++) {
      if (BLOCKS.type(this.world.get(x, y, z)).id === type) return true;
    }
    return false;
  }

  /** Closes any screen; the cursor goes back to the inventory. */
  closeScreen(): void {
    if (this.cursor) this.give(this.cursor, ...this.feet);
    this.cursor = null;
    this.screen = 'none';
    this.workshop = null;
    this.openFurnace = null;
    this.openChest = null;
    this.version++;
  }

  /** Where crafting happens now: at a workbench (opened from one, or one in reach) or by hand. */
  get station(): Station {
    return this.craftSize === 3 ? 'table' : 'hand';
  }
  /** An alchemy table within a few steps when the inventory opened: potions can be made. */
  alchemy = false;
  /** Every station at hand: the workbench (or hand) and the alchemy table. */
  get stations(): Station[] {
    return this.alchemy ? [this.station, 'alchemy'] : [this.station];
  }

  /** Makes `c` from the inventory, `times` times at most; what does not fit stays unmade. Returns how many were made. */
  craftItem(c: Craft, times = 1): number {
    const made = craft(c, this.inventory, this.stations, times);
    if (made) {
      this.events.sound('place');
      this.version++;
    }
    return made;
  }

  /** How light the sky is, 0 (night) to 1 (day); kept up to date by the game loop. */
  daylight = 1;

  /** The trash slot: what was last thrown away, until something else replaces it. */
  trash: ItemStack | null = null;

  /** A click on the trash slot: the cursor goes in (destroying what was there), or an empty cursor takes it back. */
  clickTrash(): void {
    if (this.cursor) [this.trash, this.cursor] = [this.cursor, null];
    else [this.cursor, this.trash] = [this.trash, null];
    this.version++;
  }

  /** Merges stacks and orders the backpack (not the hotbar) by kind and name: tools, armour, blocks, then items. */
  sortBackpack(): void {
    const slots = this.inventory.slots, bag = slots.slice(HOTBAR_SIZE).filter((s): s is ItemStack => s !== null);
    slots.fill(null, HOTBAR_SIZE);
    const rank = (s: ItemStack) => {
      const t = BLOCKS.type(s.state);
      return t.tool ? 0 : t.armour ? 1 : t.food ? 3 : t.item ? 4 : 2;
    };
    bag.sort((a, b) => rank(a) - rank(b) || BLOCKS.type(a.state).name.localeCompare(BLOCKS.type(b.state).name) || a.state - b.state || (a.wear ?? 0) - (b.wear ?? 0));
    for (const s of bag) insertStack(slots, s, HOTBAR_SIZE);
    this.version++;
  }

  /** Shift-click moves directly between a container and the player, or hotbar and backpack. */
  quickMove(slots:(ItemStack|null)[],index:number):void {
    if(this.cursor)return;
    const s=slots[index];if(!s)return;
    if(slots!==this.inventory.slots){moveStack(slots,index,this.inventory.slots);this.version++;return;}
    const chest=this.openChest&&this.screen==='chest'?this.chests.get(this.openChest):null;
    if(chest){moveStack(slots,index,chest);this.version++;return;}
    const f=this.openFurnace&&this.screen==='furnace'?this.furnaces.get(this.openFurnace):null;
    if(f){
      const t=BLOCKS.type(s.state),field=t.smeltsTo?'input':t.fuel?'fuel':null;
      if(field){const box=[f[field]];moveStack(slots,index,box);f[field]=box[0]!;this.version++;return;}
    }
    // With no container open, armour and accessories go on: armour swaps with what is worn.
    const t=BLOCKS.type(s.state),free=this.accessories.findIndex((a)=>!a);
    if(t.armour){slots[index]=this.armour[t.armour.slot]??null;this.armour[t.armour.slot]=s;this.version++;return;}
    if(t.accessory&&free>=0&&!this.accessories.some((a)=>a?.state===s.state)){this.accessories[free]=s;slots[index]=null;this.version++;return;}
    moveStack(slots,index,slots,index<9?9:0,index<9?36:9);this.version++;
  }
  takeFurnaceOutput(right=false,quick=false):void {
    const f=this.openFurnace?this.furnaces.get(this.openFurnace):null;if(!f)return;
    if(quick){if(this.cursor)return;const box=[f.output];moveStack(box,0,this.inventory.slots);f.output=box[0]!;}
    else {const result=takeOutput(f.output,this.cursor,right);f.output=result.source;this.cursor=result.cursor;}
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
      decorations: this.decorations.save(), mode: this.mode, difficulty: this.difficulty, hints: this.hints.save(), inventory: this.inventory.save(), selected: this.inventory.selected, drops: this.drops.save(),
      health: this.survival.health, maxHealth: this.survival.maxHealth, hunger: this.survival.hunger, air: this.survival.air, effects: { ...this.survival.effects }, burning: this.survival.burning, bodyC: this.survival.temperature.coreC, spawn: this.spawn,
      furnaces: [...this.furnaces].map(([k, f]) => [k, s(f.input), s(f.fuel), s(f.output), f.burn, f.progress]),
      homes: [...this.homes.values()].map((h) => [h.x, h.y, h.z, h.yaw, h.who]), journal: this.journal.save(), seen: [...this.seen], bestiary: [...this.bestiary].map(([k, e]) => [k, e.kills, [...e.drops]]), stats: this.stats, biomesSeen: [...this.biomesSeen], deepestM: this.deepestM, found: [...this.found], beaconLit: this.beaconLit, endingSeen: this.endingSeen, boating: this.boating,
      armour: this.armour.map((a) => (a ? [BLOCKS.stateName(a.state), 1, a.wear ?? 0, a.upgrade ?? 0] : null)),
      accessories: this.accessories.map((a) => (a ? [BLOCKS.stateName(a.state), 1] : null)),
      campfires: [...this.campfires].map(([k, c]) => [k, c.map(([st, left]) => [BLOCKS.stateName(st), left])]),
      chests: [...this.chests].map(([k, slots]) => [k, slots.map((st) => (st ? [BLOCKS.stateName(st.state), st.count, st.wear ?? 0, st.upgrade ?? 0] : null))]),
    };
  }

  /** Restores a save; anything malformed is left at its default. */
  load(saved: unknown): void {
    if (typeof saved !== 'object' || saved === null) return;
    const p = saved as Record<string, unknown>;
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    if (p.mode === 'creative' || p.mode === 'survival') this.mode = p.mode;
    if (typeof p.difficulty === 'string' && p.difficulty in DIFFICULTY) this.difficulty = p.difficulty as Difficulty;
    this.decorations.load(p.decorations);
    this.hints.load(p.hints);
    this.boating = p.boating === true;
    this.inventory.load(p.inventory);
    this.drops.load(p.drops);
    this.inventory.selected = Math.max(0, Math.min(8, Math.floor(num(p.selected, 0))));
    this.survival.maxHealth = Math.max(MAX_HEALTH, Math.min(MAX_HEALTH * 2, Math.round(num(p.maxHealth, MAX_HEALTH) / 2) * 2));
    this.survival.health = Math.min(this.survival.maxHealth, num(p.health, this.survival.health));
    this.survival.hunger = num(p.hunger, this.survival.hunger);
    this.survival.air = num(p.air, this.survival.air);
    this.survival.burning = Math.max(0, num(p.burning, 0));
    if (Array.isArray(p.homes)) for (const h of p.homes) {
      if (!Array.isArray(h) || !h.slice(0, 4).every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
      const who = typeof h[4] === 'string' && SPECIES_BY_KEY.get(h[4])?.villager ? h[4] : null;
      this.homes.set(`${h[0]},${h[1]},${h[2]}`, { x: h[0], y: h[1], z: h[2], yaw: h[3], who });
    }
    if (Array.isArray(p.seen)) for (const k of p.seen) if (typeof k === 'string' && SPECIES_BY_KEY.has(k)) this.seen.add(k);
    if (Array.isArray(p.bestiary)) for (const e of p.bestiary) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || !SPECIES_BY_KEY.has(e[0])) continue;
      this.bestiary.set(e[0], { kills: Math.max(0, Math.floor(num(e[1], 0))), drops: new Set(Array.isArray(e[2]) ? e[2].filter((d: unknown) => typeof d === 'string') : []) });
    }
    this.survival.effects = {};
    if (typeof p.effects === 'object' && p.effects !== null) for (const [k, v] of Object.entries(p.effects)) if (isEffect(k) && num(v, 0) > 0) this.survival.effects[k] = num(v, 0);
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
    this.journal.load(p.journal);
    if (typeof p.stats === 'object' && p.stats !== null) {
      const st = p.stats as Record<string, unknown>;
      for (const k of Object.keys(this.stats) as (keyof Stats)[]) this.stats[k] = Math.max(0, num(st[k], 0));
    }
    if (Array.isArray(p.found)) for (const f of p.found) if (['surface', 'mine', 'vault', 'shrine'].includes(f)) this.found.add(f as LootTable);
    this.beaconLit = p.beaconLit === true;
    if (Array.isArray(p.biomesSeen)) for (const b of p.biomesSeen) if (Number.isInteger(b) && b >= 0 && b < 256) this.biomesSeen.add(b);
    this.deepestM = Math.min(0, num(p.deepestM, 0));
    this.endingSeen = p.endingSeen === true;
    if (Array.isArray(p.armour)) {
      const worn = new Inventory();
      worn.load(p.armour);
      worn.slots.slice(0, 4).forEach((a, i) => (this.armour[i] = a && BLOCKS.type(a.state).armour?.slot === i ? a : null));
    }
    if (Array.isArray(p.accessories)) {
      const worn = new Inventory();
      worn.load(p.accessories);
      worn.slots.slice(0, ACCESSORY_SLOTS).forEach((a, i) => {
        const fine = a && BLOCKS.type(a.state).accessory && !this.accessories.some((o) => o?.state === a.state);
        this.accessories[i] = fine ? { state: a.state, count: 1 } : null;
      });
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
/** The share of a hit that gets through `points` of armour. */
export const armourFactor = (points: number): number => 1 - Math.min(ARMOUR_CAP, points * ARMOUR_PER_POINT);

export function weaponDamage(held: ItemStack | null): number {
  const tool = held ? BLOCKS.type(held.state).tool : undefined;
  if (!tool) return HAND_DAMAGE;
  return (tool.kind === 'sword' ? SWORD_DAMAGE : tool.kind === 'axe' ? AXE_DAMAGE : TOOL_DAMAGE) + (TIER_DAMAGE[tool.tier] ?? tool.tier) + (held?.upgrade ?? 0);
}
