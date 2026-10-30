import * as THREE from 'three';
import { DROP_CAP } from '../config';
import type { Drop } from '../game/drops';
import { itemTile, tileIndex } from './tilePixels';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Dropped items as small cubes in one instanced mesh, each showing its item tile, bobbing and turning. */
export class DropMeshes {
  private readonly mesh: THREE.InstancedMesh;
  private readonly tile = new THREE.InstancedBufferAttribute(new Float32Array(DROP_CAP), 1);
  private readonly light = new THREE.InstancedBufferAttribute(new Float32Array(DROP_CAP), 1);

  constructor(scene: THREE.Scene, tiles: THREE.Texture) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute('tile', this.tile);
    geometry.setAttribute('light', this.light);
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { tiles: { value: tiles } },
      vertexShader: /* glsl */ `
        in float tile;
        in float light;
        out vec2 vUv;
        flat out float vTile;
        out float vLight;
        void main() {
          vUv = uv;
          vTile = tile;
          vLight = light;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform highp sampler2DArray tiles;
        in vec2 vUv;
        flat in float vTile;
        in float vLight;
        out vec4 outColor;
        void main() {
          vec4 c = texture(tiles, vec3(vUv, vTile));
          if (c.a < 0.5) discard;
          outColor = vec4(c.rgb * vLight, 1.0);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, DROP_CAP);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Places every drop; `lightAt` gives the brightness (0..1) where a drop lies. */
  update(list: readonly Drop[], time: number, lightAt: (d: Drop) => number): void {
    let n = 0;
    for (const d of list) {
      const b = d.body, size = b.height, phase = d.age * 2 + b.x;
      tmpP.set(b.x, b.y + size / 2 + (b.onGround ? 0.08 + Math.sin(time * 2.5 + phase) * 0.06 : 0), b.z);
      tmpQ.setFromAxisAngle(UP, time + phase);
      this.mesh.setMatrixAt(n, tmpM.compose(tmpP, tmpQ, tmpS.set(size, size, size)));
      this.tile.setX(n, tileIndex(itemTile(d.stack.state)));
      this.light.setX(n, lightAt(d));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.tile.needsUpdate = true;
    this.light.needsUpdate = true;
  }
}
