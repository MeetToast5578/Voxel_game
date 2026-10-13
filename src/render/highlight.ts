import * as THREE from 'three';

/** Thin dark outline around the block the player is looking at. */
export class BlockHighlight {
  private readonly lines: THREE.LineSegments;

  constructor(scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002); // slightly larger than a block to avoid z-fighting
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    this.lines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }),
    );
    this.lines.visible = false;
    scene.add(this.lines);
  }

  /** Shows the outline around block (x, y, z), or hides it when target is null. */
  update(target: { x: number; y: number; z: number } | null): void {
    if (!target) {
      this.lines.visible = false;
      return;
    }
    this.lines.visible = true;
    this.lines.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  }
}
