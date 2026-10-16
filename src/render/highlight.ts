import * as THREE from 'three';
import { crackGeometry } from './blockGeometry';

/** Thin dark outline around the block the player is looking at, or around a volume the build tools would change. */
export class BlockHighlight {
  private readonly lines: THREE.LineSegments;
  private readonly area: THREE.LineSegments;
  private areaKey = '';

  constructor(scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002); // slightly larger than a block to avoid z-fighting
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    const material = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 });
    this.lines = new THREE.LineSegments(edges, material);
    this.lines.visible = false;
    this.area = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    this.area.visible = false;
    scene.add(this.lines, this.area);
  }

  /** Shows the outline around block (x, y, z), or hides it when target is null. */
  update(target: { x: number; y: number; z: number } | null): void {
    this.area.visible = false;
    if (!target) {
      this.lines.visible = false;
      return;
    }
    this.lines.visible = true;
    this.lines.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  }

  /** Shows the outline around a box of blocks (inclusive bounds), or hides it when box is null. */
  showBox(box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null): void {
    this.lines.visible = false;
    if (!box) {
      this.area.visible = false;
      return;
    }
    const sx = box.max.x - box.min.x + 1;
    const sy = box.max.y - box.min.y + 1;
    const sz = box.max.z - box.min.z + 1;
    const key = `${sx},${sy},${sz}`;
    if (key !== this.areaKey) {
      // The outline is 0.002 larger than the box, like the single-block outline, to avoid z-fighting.
      const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(sx + 0.002, sy + 0.002, sz + 0.002));
      this.area.geometry.dispose();
      this.area.geometry = geometry;
      this.areaKey = key;
    }
    this.area.visible = true;
    this.area.position.set(box.min.x + sx / 2, box.min.y + sy / 2, box.min.z + sz / 2);
  }
}

/** The crack overlay is a cube this much larger than a block, so it does not z-fight with the block's faces. */
const OVERLAY_SIZE = 1.004;

/** The crack overlay on the block being broken: a cube just larger than the block, showing the crack stage. */
export class BreakOverlay {
  private readonly mesh: THREE.Mesh;

  constructor(scene: THREE.Scene, material: THREE.Material) {
    this.mesh = new THREE.Mesh(crackGeometry(0, OVERLAY_SIZE), material);
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Shows crack stage 0..9 on block cell, or hides the overlay when there is no cell or the stage is -1. */
  update(cell: { x: number; y: number; z: number } | null, stage: number): void {
    if (!cell || stage < 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.geometry = crackGeometry(stage, OVERLAY_SIZE);
    this.mesh.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
    this.mesh.visible = true;
  }
}

