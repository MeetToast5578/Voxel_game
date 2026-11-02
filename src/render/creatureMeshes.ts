import * as THREE from 'three';
import { CREATURE_CAP } from '../config';
import { creaturePixels, SKIN_COLUMNS, SKIN_INDEX, SKIN_ROWS, SKIN_SIZE } from './creatureArt';
import { MAX_MOB_PARTS, mobRig, poseMobPart } from './mobModels';
import type { MobPart } from './mobModels';
import type { Creature } from '../creatures/creatures';

const CAPACITY = CREATURE_CAP * MAX_MOB_PARTS;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), localQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), rotation = new THREE.Euler();
const HURT = new THREE.Color(1, .1, .1);

/** Species-specific voxel rigs, including accessories, share one textured instanced draw. */
export class CreatureMeshes {
  private readonly mesh: THREE.InstancedMesh;
  private readonly skin = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4);
  private readonly rigs = new Map<string, readonly MobPart[]>();
  private readonly sleepOffsets = new Map<string, number>();

  constructor(scene: THREE.Scene) {
    const atlas = new THREE.DataTexture(creaturePixels(), SKIN_SIZE * SKIN_COLUMNS, SKIN_SIZE * SKIN_ROWS);
    atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
    atlas.needsUpdate = true;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute('skinTile', this.skin);
    this.skin.setUsage(THREE.DynamicDrawUsage);
    const material = new THREE.MeshBasicMaterial({ map: atlas, color: 0xffffff });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'attribute vec4 skinTile;\nvarying float mobShade;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>',
        `#include <uv_vertex>\nmobShade = normal.y > 0.5 ? 1.0 : normal.y < -0.5 ? 0.55 : normal.z < -0.5 ? 0.93 : 0.76;\nvec2 tile = skinTile.xy;\n// Faces belong on the front of the head; its sides use the body skin.\nif (tile.y == 1.0 && normal.z > -0.5) tile.y = 0.0;\nvec2 uv = vec2(vMapUv.x, mix(skinTile.z, skinTile.w, vMapUv.y));\n// Stay inside this tile even on cube edges; feet and legs use separate skin intervals.\nuv = clamp(uv, vec2(0.5 / ${SKIN_SIZE}.0), vec2(1.0 - 0.5 / ${SKIN_SIZE}.0));\nvMapUv = (uv + tile) / vec2(${SKIN_COLUMNS}.0, ${SKIN_ROWS}.0);`);
      shader.fragmentShader = 'varying float mobShade;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= mobShade;');
    };
    material.customProgramCacheKey = () => 'woodland-mob-rigs-v3';
    this.mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(list: readonly Creature[], lightAt: (c: Creature) => number, time = 0): void {
    let n = 0;
    for (const c of list.slice(0, CREATURE_CAP)) {
      const key = c.species.key;
      let rig = this.rigs.get(key);
      if (!rig) { rig = mobRig(key); this.rigs.set(key, rig); }
      const w = c.body.halfWidth * 2, h = c.body.height, light = lightAt(c);
      const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw);
      const pose = { phase: c.walk, time: time + c.id, moving: Math.hypot(c.body.vx, c.body.vz) > .1,
        sleeping: c.mode === 'sleep', attacking: c.mode === 'hunt' && c.cooldown > .65 };
      const hop = key === 'rabbit' && pose.moving && !pose.sleeping ? Math.abs(Math.sin(c.walk)) * h * .08 : 0;
      // Lower the whole resting rig together. Scaling each part's height position separates joints.
      let sleepOffset = 0;
      if (pose.sleeping) {
        const cacheKey = `${key}:${w}:${h}`;
        let offset = this.sleepOffsets.get(cacheKey);
        if (offset === undefined) {
          offset = Infinity;
          for (const part of rig) {
            const p = poseMobPart(part, pose, h / w);
            localQ.setFromEuler(rotation.set(p.rx, p.ry, p.rz, 'ZYX'));
            tmpM.makeRotationFromQuaternion(localQ);
            const e = tmpM.elements;
            const halfY = (Math.abs(e[1]!) * part.w * w + Math.abs(e[5]!) * part.h * h + Math.abs(e[9]!) * part.d * w) / 2;
            offset = Math.min(offset, p.y * h - halfY);
          }
          this.sleepOffsets.set(cacheKey, offset);
        }
        sleepOffset = offset;
      }
      for (const part of rig) {
        const p = poseMobPart(part, pose, h / w), x = p.x * w, z = p.z * w;
        tmpP.set(c.body.x + x * cos + z * sin, c.body.y + p.y * h - sleepOffset + hop, c.body.z - x * sin + z * cos);
        tmpQ.setFromAxisAngle(UP, c.yaw);
        localQ.setFromEuler(rotation.set(p.rx, p.ry, p.rz, 'ZYX'));
        tmpQ.multiply(localQ);
        tmpS.set(part.w * w, part.h * h, part.d * w);
        this.skin.setXYZW(n, SKIN_INDEX.get(key) ?? 0, part.skin, part.uv?.[0] ?? 0, part.uv?.[1] ?? 1);
        this.mesh.setMatrixAt(n, tmpM.compose(tmpP, tmpQ, tmpS));
        const tint = part.tint;
        const partLight = part.glow ? Math.max(.8, light) : light;
        tmpC.setRGB(partLight * (tint?.[0] ?? 1), partLight * (tint?.[1] ?? 1), partLight * (tint?.[2] ?? 1));
        if (c.hurt > 0) tmpC.lerp(HURT,.6);
        this.mesh.setColorAt(n++, tmpC);
      }
    }
    this.mesh.count = n;
    this.skin.clearUpdateRanges(); this.skin.addUpdateRange(0,n*4); this.skin.needsUpdate = true;
    this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0,n*16);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor?.clearUpdateRanges(); this.mesh.instanceColor?.addUpdateRange(0,n*3);
    if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate = true;
  }
}
