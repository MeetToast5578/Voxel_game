import * as THREE from 'three';

const WOOD = new THREE.Color(0.55, 0.38, 0.22);

/** The boat under a rider: a plank hull of five boxes (floor and four sides), shaded by the light where it floats. */
export class BoatMesh {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.MeshBasicMaterial({ color: WOOD });

  constructor(scene: THREE.Scene) {
    // Cells: 2.4 long, 1.4 wide, 0.6 deep; its floor sits just under the rider's feet.
    const parts: [number, number, number, number, number, number][] = [
      [2.4, 0.12, 1.4, 0, -0.3, 0], [2.4, 0.5, 0.12, 0, -0.05, 0.64], [2.4, 0.5, 0.12, 0, -0.05, -0.64],
      [0.12, 0.5, 1.4, 1.14, -0.05, 0], [0.12, 0.5, 1.4, -1.14, -0.05, 0],
    ];
    for (const [w, h, d, x, y, z] of parts) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material);
      m.position.set(x, y, z);
      this.group.add(m);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Shows the boat at the rider's feet (x, y, z), its bow the way `yaw` faces; hides it when `riding` is false. */
  update(riding: boolean, x: number, y: number, z: number, yaw: number, light: number): void {
    this.group.visible = riding;
    if (!riding) return;
    this.group.position.set(x, y, z);
    this.group.rotation.y = yaw + Math.PI / 2;
    this.material.color.copy(WOOD).multiplyScalar(light);
  }
}
