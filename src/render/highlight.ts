import * as THREE from 'three';
import { BLOCKS } from '../engine/blocks';
import type { RayHit } from '../game/raycast';
import { TILE_NAMES, TILE_SIZE, tilePixels } from './tilePixels';

type HighlightBox = readonly [number, number, number, number, number, number];
/** Match the visible block geometry, including non-solid fittings and open doors. */
export function highlightBoxes(state: number): readonly HighlightBox[] {
  const type = BLOCKS.type(state), v = BLOCKS.variant(state);
  if (type.boxes) return type.boxes(v).map(b => b.map(n => n / 16) as unknown as HighlightBox);
  if (type.shape === 'slab') return [[0, v === 0 ? 0 : .5, 0, 1, v === 0 ? .5 : 1, 1]];
  if (type.key === 'snow') return [[0, 0, 0, 1, (v + 1) / 8, 1]];
  if (type.shape === 'layer') return [[0, 0, 0, 1, .125, 1]];
  return [[0, 0, 0, 1, 1, 1]];
}

/** Matching outlines and cracks for each component of the target's actual shape. */
export class Highlight {
  private readonly lines = new THREE.Group();
  private readonly cracks = new THREE.Group();
  private readonly stages: THREE.DataTexture[] = [];
  private readonly edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly lineMaterial = new THREE.LineBasicMaterial({color: 0xd9e6e5, transparent: true, opacity: .65});
  private readonly crackMaterial: THREE.MeshBasicMaterial;
  private state = -1;

  constructor(scene: THREE.Scene) {
    const pixels = tilePixels(), size = TILE_SIZE * TILE_SIZE * 4;
    for (let i = 0; i < 10; i++) {
      const layer = TILE_NAMES.indexOf(`crack_${i}`);
      const texture = new THREE.DataTexture(new Uint8Array(pixels.subarray(layer * size, (layer + 1) * size)), TILE_SIZE, TILE_SIZE);
      texture.magFilter = THREE.NearestFilter; texture.needsUpdate = true; this.stages.push(texture);
    }
    this.crackMaterial = new THREE.MeshBasicMaterial({map: this.stages[0]!, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, fog: false});
    this.lines.visible = this.cracks.visible = false;
    scene.add(this.lines, this.cracks);
  }

  set(hit: RayHit | null, progress = 0, state = 0): void {
    this.lines.visible = hit !== null;
    this.cracks.visible = hit !== null && progress > 0;
    if (!hit) return;
    if (state !== this.state) {
      this.state = state;
      const boxes = highlightBoxes(state);
      while (this.lines.children.length < boxes.length) {
        this.lines.add(new THREE.LineSegments(this.edgeGeometry, this.lineMaterial));
        this.cracks.add(new THREE.Mesh(this.boxGeometry, this.crackMaterial));
      }
      this.lines.children.forEach((line, i) => {
        const crack = this.cracks.children[i]!, b = boxes[i];
        line.visible = crack.visible = !!b;
        if (!b) return;
        line.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
        crack.position.copy(line.position);
        line.scale.set(b[3] - b[0] + .004, b[4] - b[1] + .004, b[5] - b[2] + .004);
        crack.scale.set(b[3] - b[0] + .006, b[4] - b[1] + .006, b[5] - b[2] + .006);
      });
    }
    this.lines.position.set(hit.x, hit.y, hit.z);
    this.cracks.position.copy(this.lines.position);
    if (progress > 0) this.crackMaterial.map = this.stages[Math.min(9, Math.floor(progress * 10))]!;
  }
}
