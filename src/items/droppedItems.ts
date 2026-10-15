/**
 * Dropped items (spec 23): a broken block becomes a small cube that falls, lands, turns on the spot and can be
 * picked up. Pure: no three.js, no DOM, so it is tested in Node.
 *
 * The item starts with a little sideways speed, falls, and stops at the first solid block. Collision reuses moveAndCollide.
 */
import {
  GRAVITY, ITEM_HALF_WIDTH, ITEM_HEIGHT, ITEM_PICKUP_DELAY_S, ITEM_PICKUP_RADIUS_M, ITEM_SPIN_DEG_S, ITEM_SPREAD_M_S,
  ITEM_TERMINAL_M_S, PLAYER_HEIGHT, metersToBlocks, DROPPED_ITEM_MAX,
} from '../config';
import { moveAndCollide, type BodyShape, type SolidFn, type Vec3 } from '../player/physics';

export interface DroppedItem {
  /** Block state of the broken block: what the item looks like and what a pickup adds. */
  blockId: number;
  /** Centre of the item's bottom face, in blocks. */
  pos: Vec3;
  vel: Vec3;
  /** Turn on the spot, in degrees. */
  spin: number;
  /** Seconds left before the item can be picked up. */
  pickupDelay: number;
}

const SHAPE: BodyShape = { halfWidth: ITEM_HALF_WIDTH, height: ITEM_HEIGHT };
/** Fixed sub-step: at terminal speed an item moves about 0.28 blocks per sub-step, less than its height. */
const MAX_SUBSTEP_S = 1 / 240;
/** An item that is still inside solid after this many block-high nudges is removed. */
const MAX_NUDGE_BLOCKS = 8;

/** A broken block at (x, y, z) becomes an item centred in its cell, with a small random sideways speed. */
export function spawnDroppedItem(blockId: number, x: number, y: number, z: number, random: () => number): DroppedItem {
  const spread = metersToBlocks(ITEM_SPREAD_M_S);
  return {
    blockId,
    pos: { x: x + 0.5, y: y + (1 - ITEM_HEIGHT) / 2, z: z + 0.5 },
    vel: { x: (random() * 2 - 1) * spread, y: 0, z: (random() * 2 - 1) * spread },
    spin: random() * 360,
    pickupDelay: ITEM_PICKUP_DELAY_S,
  };
}

/** Adds an item and drops the oldest ones beyond DROPPED_ITEM_MAX. Mutates items. */
export function addDroppedItem(items: DroppedItem[], item: DroppedItem): void {
  items.push(item);
  while (items.length > DROPPED_ITEM_MAX) items.shift();
}

/**
 * Advances one item by dt seconds: gravity with a terminal speed, collision with solid blocks, sideways motion
 * stopped on the ground, and the spin. Returns false if the item is still inside solid after a nudge up, in which
 * case the caller should remove it.
 */
export function stepDroppedItem(item: DroppedItem, dt: number, isSolid: SolidFn): boolean {
  item.pickupDelay = Math.max(0, item.pickupDelay - dt);
  item.spin = (item.spin + ITEM_SPIN_DEG_S * dt) % 360;
  if (!unstick(item, isSolid)) return false;

  const steps = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_S));
  const h = dt / steps;
  const terminal = metersToBlocks(ITEM_TERMINAL_M_S);
  for (let i = 0; i < steps; i++) {
    item.vel.y = Math.max(-terminal, item.vel.y - GRAVITY * h);
    const hit = moveAndCollide(item.pos, item.vel, h, SHAPE, isSolid);
    if (hit.onGround) {
      item.vel.x = 0;
      item.vel.z = 0;
    }
  }
  return true;
}

/** True if the player can pick the item up now: its delay has run out and it is within the pickup radius. */
export function canPickUp(item: DroppedItem, feet: Vec3): boolean {
  if (item.pickupDelay > 0) return false;
  const r = metersToBlocks(ITEM_PICKUP_RADIUS_M);
  const dx = item.pos.x - feet.x;
  const dy = item.pos.y + ITEM_HEIGHT / 2 - (feet.y + PLAYER_HEIGHT / 2);
  const dz = item.pos.z - feet.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/** Moves an item that was placed into a solid block straight up to the first free space. */
function unstick(item: DroppedItem, isSolid: SolidFn): boolean {
  for (let i = 0; overlapsSolid(item.pos, isSolid); i++) {
    if (i === MAX_NUDGE_BLOCKS) return false;
    item.pos.y += 1;
  }
  return true;
}

function overlapsSolid(pos: Vec3, isSolid: SolidFn): boolean {
  const minX = Math.floor(pos.x - ITEM_HALF_WIDTH), maxX = Math.ceil(pos.x + ITEM_HALF_WIDTH);
  const minZ = Math.floor(pos.z - ITEM_HALF_WIDTH), maxZ = Math.ceil(pos.z + ITEM_HALF_WIDTH);
  const minY = Math.floor(pos.y), maxY = Math.ceil(pos.y + ITEM_HEIGHT);
  for (let y = minY; y < maxY; y++)
    for (let z = minZ; z < maxZ; z++)
      for (let x = minX; x < maxX; x++)
        if (isSolid(x, y, z)) return true;
  return false;
}
