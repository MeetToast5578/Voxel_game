import {describe, expect, it} from 'vitest';
import * as THREE from 'three';
import {SPECIES} from '../creatures/species';
import type {Creature} from '../creatures/creatures';
import {mobRig, poseMobPart, MAX_MOB_PARTS, type MobPart, type MobPose} from '../render/mobModels';
import {CreatureMeshes} from '../render/creatureMeshes';
import {decodeArtTile} from '../render/artCodec';
import refined from '../../assets/woodland-ember/refinement/creatures.json';
import manifest from '../../assets/woodland-ember/refinement/manifest.json';
import runtime from '../render/creatureSkins.json';

const pose: MobPose = {phase: 1.1, time: 2, moving: true, sleeping: false, attacking: false};
function point(part: MobPart, local: THREE.Vector3, state: MobPose, width: number, height: number): THREE.Vector3 {
  const p = poseMobPart(part, state, height / width);
  return local.applyEuler(new THREE.Euler(p.rx, p.ry, p.rz, 'ZYX')).add(new THREE.Vector3(p.x * width, p.y * height, p.z * width));
}
const creature = (species: typeof SPECIES[number], id: number, mode = 'idle') => ({id, species, yaw: 0, mode, walk: 1.1, cooldown: 1, hurt: 0,
  body: {x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, halfWidth: species.halfWidthM / .6, height: species.heightM / .6}}) as Creature;

describe('refined mob artwork and rigs', () => {
  it('ships all 60 mob skins and four accessory tiles in the active runtime export', () => {
    expect(manifest.names.length).toBe(64);
    expect(Object.keys(refined).sort()).toEqual([...manifest.names].sort());
    for (const name of manifest.names) {
      const tile = refined[name as keyof typeof refined], pixels = decodeArtTile(tile);
      expect(pixels.length, name).toBe(4096);
      expect(Array.from(pixels).filter((_, i) => i % 4 === 3).every(a => a === 255), name).toBe(true);
      expect(runtime[name as keyof typeof runtime], name).toEqual(tile);
    }
    for (const species of SPECIES) for (const part of ['body', 'face', 'legs']) expect(manifest.names).toContain(`${species.key}_${part}`);
    expect(refined.trader_body).not.toEqual(refined.skulker_body);
    expect(refined.trader_face).not.toEqual(refined.skulker_face);
  });

  it('keeps feet attached to the bottom of their legs while walking, attacking and resting', () => {
    for (const species of SPECIES) {
      const rig = mobRig(species.key), width = species.halfWidthM * 2, height = species.heightM;
      for (const foot of rig.filter(p => p.name.startsWith('paw_'))) {
        const leg = rig.find(p => p.name === foot.name.replace('paw_', 'leg_'))!;
        expect(leg.pivot).toEqual(foot.pivot);
        expect(foot.uv).toEqual([0, .25]); expect(leg.uv).toEqual([.25, 1]);
        for (const state of [pose, {...pose, sleeping: true}, {...pose, attacking: true}]) {
          const legEnd = point(leg, new THREE.Vector3(0, -leg.h * height / 2, 0), state, width, height);
          const footJoint = point(foot, new THREE.Vector3(0, foot.h * height / 2, (leg.z - foot.z) * width), state, width, height);
          expect(legEnd.distanceTo(footJoint), `${species.key}/${foot.name}`).toBeLessThan(1e-8);
        }
      }
    }
  });

  it('turns head details and the held bow around the same joints as their parent parts', () => {
    for (const key of SPECIES.map(s => s.key)) {
      const rig = mobRig(key), head = rig.find(p => p.name === 'head')!;
      for (const part of rig.filter(p => p.head)) expect(part.pivot).toEqual(head.pivot);
    }
    const rig = mobRig('skulker'), arm = rig.find(p => p.name === 'arm_-1')!;
    for (const part of rig.filter(p => p.name.startsWith('bow_'))) {
      expect(part.pivot).toEqual(arm.pivot); expect(part.gait).toBe(arm.gait);
      expect(poseMobPart(part, {...pose, attacking: true}).rx).toBe(poseMobPart(arm, {...pose, attacking: true}).rx);
    }
  });

  it('keeps all resting rigs on the ground without scaling apart their joints', () => {
    const scene = new THREE.Scene(), meshes = new CreatureMeshes(scene);
    const mesh = scene.children[0] as THREE.InstancedMesh;
    for (const [i, species] of SPECIES.entries()) {
      for (const time of [1, 10]) {
        meshes.update([creature(species, i, 'sleep')], () => .7, time);
        mesh.computeBoundingBox();
        expect(mesh.boundingBox!.min.y, species.key).toBeCloseTo(0, 5);
        expect(Number.isFinite(mesh.boundingBox!.max.y)).toBe(true);
        expect(mesh.count).toBeLessThanOrEqual(MAX_MOB_PARTS);
      }
    }
  });

  it('shares one instanced mesh for every species and retains a visible ember core in darkness', () => {
    const scene = new THREE.Scene(), meshes = new CreatureMeshes(scene);
    meshes.update(SPECIES.map((s, i) => creature(s, i)), () => .05, 1);
    expect(scene.children).toHaveLength(1);
    const mesh = scene.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(SPECIES.reduce((n, s) => n + mobRig(s.key).length, 0));
    const warden = SPECIES.find(s => s.key === 'warden')!;
    meshes.update([creature(warden, 1)], () => .05, 1);
    const colour = new THREE.Color(); mesh.getColorAt(mobRig('warden').findIndex(p => p.name === 'ember_core'), colour);
    expect(colour.r).toBeGreaterThanOrEqual(.79); expect(colour.g).toBeGreaterThan(.3);
  });
});
