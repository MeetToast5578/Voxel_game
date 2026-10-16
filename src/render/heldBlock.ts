import * as THREE from 'three';
import { HAND_BLOCK_SIZE, HAND_BOB, HAND_SWING_S, HAND_X, HAND_Y, HAND_Z } from '../config';
import { blockGeometry } from './blockGeometry';

/**
 * The selected block, held in the bottom-right of the view (spec 24). It is a child of the camera, and the renderer
 * draws it in its own scene after the world, so it never clips into walls.
 */
export class HeldBlock {
  private readonly mesh = new THREE.Mesh();
  private state = 0;
  /** 0..1 while a one-off swing runs (after a break or a place); 1 when at rest. */
  private swingT = 1;
  /** Seconds spent busy (breaking), which keeps the hand swinging. */
  private busyT = 0;
  private walkT = 0;

  constructor(camera: THREE.Object3D, material: THREE.Material) {
    this.mesh.material = material;
    this.mesh.visible = false;
    camera.add(this.mesh);
  }

  /** Shows the block in hand; state 0 (air) hides it. */
  setState(state: number): void {
    if (state === this.state) return;
    this.state = state;
    this.mesh.visible = state !== 0;
    if (state !== 0) this.mesh.geometry = blockGeometry(state, HAND_BLOCK_SIZE);
  }

  /** A swing, for a block broken or placed. */
  swing(): void {
    this.swingT = 0;
  }

  /** walking is 0..1 (how fast the player moves on the ground); busy is true while a block is being broken. */
  update(dt: number, walking: number, busy: boolean): void {
    this.swingT = Math.min(1, this.swingT + dt / HAND_SWING_S);
    this.busyT = busy ? this.busyT + dt : 0;
    this.walkT += dt * walking * 9;
    const dip = Math.sin(this.swingT * Math.PI) * 0.9 + (busy ? Math.abs(Math.sin((this.busyT * Math.PI) / HAND_SWING_S)) * 0.5 : 0);
    this.mesh.rotation.set(0.2 + dip, -0.6, 0);
    this.mesh.position.set(
      HAND_X + Math.cos(this.walkT / 2) * HAND_BOB * walking,
      HAND_Y + Math.sin(this.walkT) * HAND_BOB * walking,
      HAND_Z,
    );
  }
}
