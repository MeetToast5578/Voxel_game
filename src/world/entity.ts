import { GRAVITY, TERMINAL_VELOCITY, ENTITY_FRICTION } from '../config';
import { moveAndCollide, type BodyShape, type CollisionFn, type Vec3 } from '../player/physics';

/** A moving object in the world: players, creatures, dropped items, etc. */
export interface Entity {
  readonly id: number;
  type: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  halfWidth: number;
  height: number;
  onGround: boolean;
}

/** Manages entities: spawning, despawning, stepping with physics. Pure. */
export class EntitySystem {
  private readonly entities = new Map<number, Entity>();
  private nextId = 1;

  /** Spawn a new entity. Returns its unique ID. */
  spawn(type: string, x: number, y: number, z: number, halfWidth: number, height: number): number {
    const id = this.nextId++;
    const entity: Entity = {
      id, type, x, y, z, vx: 0, vy: 0, vz: 0, halfWidth, height, onGround: false,
    };
    this.entities.set(id, entity);
    return id;
  }

  /** Remove an entity. Returns true if it existed. */
  despawn(id: number): boolean {
    return this.entities.delete(id);
  }

  /** Get an entity by ID, or undefined. */
  get(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  /** All entities. */
  all(): Entity[] {
    return [...this.entities.values()];
  }

  /** Step all entities by dt seconds: apply gravity, collide with blocks, friction. */
  step(dt: number, isSolid: CollisionFn): void {
    for (const entity of this.entities.values()) {
      const shape: BodyShape = { halfWidth: entity.halfWidth, height: entity.height };
      const pos: Vec3 = { x: entity.x, y: entity.y, z: entity.z };
      const vel: Vec3 = { x: entity.vx, y: entity.vy, z: entity.vz };

      // Gravity
      vel.y = Math.max(vel.y - GRAVITY * dt, -TERMINAL_VELOCITY);

      const result = moveAndCollide(pos, vel, dt, shape, isSolid);

      entity.x = pos.x;
      entity.y = pos.y;
      entity.z = pos.z;
      entity.vx = vel.x;
      entity.vy = vel.y;
      entity.vz = vel.z;
      entity.onGround = result.onGround;

      // Friction when on the ground
      if (entity.onGround) {
        const f = Math.exp(-ENTITY_FRICTION * dt);
        entity.vx *= f;
        entity.vz *= f;
      }
    }
  }

  /** Number of entities. */
  get count(): number {
    return this.entities.size;
  }
}
