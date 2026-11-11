import * as THREE from 'three';
import { ARCHER_AIM_S, ATTACK_COOLDOWN_S, CREATURE_CAP } from '../config';
import { DEATH_S, burrowed, type Creature } from '../creatures/creatures';
import { SPECIES, type Species } from '../creatures/species';
import { attachWorldFog, type WorldFogUniforms } from './worldFog';

/**
 * Creatures built from smooth primitives (balls, capsules, cones, boxes) on a jointed skeleton, animated procedurally:
 * walk and run cycles, grazing, looking about, lunging attacks, flinching, hopping, flapping and natural rest poses.
 * Units are fractions of the creature's height; a model faces -z with its feet at y = 0.
 */
type V3 = readonly [number, number, number];
const BALL = 0, CAPSULE = 1, CONE = 2, BOX = 3;
interface Shape { kind: number; at: V3; size: V3; rot: V3; color: THREE.Color; glow: boolean }
type Role = 'root' | 'neck' | 'head' | 'tail' | 'hip' | 'knee' | 'ear' | 'arm' | 'elbow' | 'wing' | 'jaw' | 'leg' | 'foot' | 'none';
interface Joint { role: Role; at: V3; rot: V3; phase: number; hind: boolean; side: number; shapes: Shape[]; kids: Joint[] }
type Plan = 'quad' | 'biped' | 'fish' | 'spider' | 'slime' | 'bat';
interface Model { root: Joint; plan: Plan; restDrop: number; hop?: boolean }

/** Upper bound of shapes in one model, for the instance buffers. */
export const MAX_SHAPES = 64;

const col = (c: number | readonly [number, number, number]) => typeof c === 'number' ? new THREE.Color(c) : new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255);
const shape = (kind: number, at: V3, size: V3, color: number, rot: V3 = [0, 0, 0], glow = false): Shape => ({ kind, at, size, rot, color: col(color), glow });
const ball = (at: V3, size: V3, color: number, rot?: V3, glow?: boolean) => shape(BALL, at, size, color, rot, glow);
const cone = (at: V3, size: V3, color: number, rot?: V3) => shape(CONE, at, size, color, rot);
const box = (at: V3, size: V3, color: number, rot?: V3) => shape(BOX, at, size, color, rot);
/** A capsule hanging down from its joint: `len` long, `r` thick. */
const limb = (len: number, r: number, color: number, rz = 0): Shape => shape(CAPSULE, [0, -len / 2, 0], [r * 2, len, r * 2], color, [0, 0, rz]);
const joint = (role: Role, at: V3, shapes: Shape[], kids: Joint[] = [], o: Partial<Pick<Joint, 'rot' | 'phase' | 'hind' | 'side'>> = {}): Joint =>
  ({ role, at, shapes, kids, rot: o.rot ?? [0, 0, 0], phase: o.phase ?? 0, hind: o.hind ?? false, side: o.side ?? 0 });

interface Quad {
  hipH: number; body: V3; coat: number; belly: number; leg: number; hoof: number; legR: number;
  neck: { len: number; r: number; tilt: number }; head: V3; snout: { len: number; r: number; color: number }; nose?: number;
  ears: { len: number; r: number; tilt: number; color?: number }; tail: { len: number; r: number; color: number; tilt: number; bushy?: boolean; tip?: number };
  extra?: (head: Joint, root: Joint) => void; fluff?: number; eye?: number; eyeGlow?: boolean;
}

/** Four legs with knees, a body, a neck carrying a head with snout, eyes and ears, and a tail. */
function quadruped(q: Quad): Model {
  const [bw, bh, bl] = q.body;
  const legs: Joint[] = [];
  for (const [front, side, phase] of [[1, -1, 0], [1, 1, Math.PI], [0, -1, Math.PI], [0, 1, 0]] as const) {
    const z = (front ? -1 : 1) * bl * 0.34, y = -bh * 0.15, total = q.hipH + y, upper = total * 0.5, lower = total - upper;
    const thigh = ball([0, -upper * 0.2, 0], [q.legR * (front ? 3.4 : 4.4), upper * 0.8, q.legR * (front ? 3.6 : 5)], q.coat);
    legs.push(joint('hip', [side * bw * 0.28, y, z], [limb(upper, q.legR * 1.25, q.coat), thigh], [
      joint('knee', [0, -upper, 0], [ball([0, 0, 0], [q.legR * 2.3, q.legR * 2.3, q.legR * 2.3], q.leg), limb(lower, q.legR, q.leg),
        ball([0, -lower, -q.legR * 0.3], [q.legR * 2.4, q.legR * 1.4, q.legR * 2.9], q.hoof)], [], { phase, hind: !front }),
    ], { phase, hind: !front, side }));
  }
  const [hw, hh, hl] = q.head;
  const head = joint('head', [0, q.neck.len, 0], [
    ball([0, 0, 0], q.head, q.coat),
    cone([0, -hh * 0.12, -hl * 0.45 - q.snout.len / 2], [q.snout.r * 2, q.snout.len, q.snout.r * 1.7], q.snout.color, [-Math.PI / 2, 0, 0]),
    ball([0, -hh * 0.05, -hl * 0.42 - q.snout.len * 0.95], [q.snout.r * 0.9, q.snout.r * 0.7, q.snout.r * 0.6], q.nose ?? 0x1a1412),
    ...[-1, 1].map((s) => ball([s * hw * 0.36, hh * 0.18, -hl * 0.3], [hw * 0.2, hw * 0.2, hw * 0.14], q.eye ?? 0x0c0a09, undefined, q.eyeGlow)),
  ], [-1, 1].map((s) => joint('ear', [s * hw * 0.38, hh * 0.35, hl * 0.1], [cone([0, q.ears.len / 2, 0], [q.ears.r * 2, q.ears.len, q.ears.r], q.ears.color ?? q.coat)], [],
    { rot: [0.2, 0, -s * q.ears.tilt], side: s })), { rot: [q.neck.tilt - 0.15, 0, 0] });
  const t = q.tail;
  const tailShapes = t.bushy
    ? [ball([0, 0, t.len * 0.5], [t.r * 2.4, t.r * 2.4, t.len], t.color, [0, 0, 0]), ...(t.tip ? [ball([0, 0, t.len * 0.95], [t.r * 1.8, t.r * 1.8, t.len * 0.3], t.tip)] : [])]
    : [shape(CAPSULE, [0, 0, t.len / 2], [t.r * 2, t.len, t.r * 2], t.color, [Math.PI / 2, 0, 0])];
  const root = joint('root', [0, q.hipH, 0], [
    ball([0, 0, 0], [bw, bh, bl], q.coat),
    ball([0, -bh * 0.22, 0], [bw * 0.85, bh * 0.6, bl * 0.8], q.belly),
    ...(q.fluff ? [ball([0, bh * 0.1, -bl * 0.25], [bw * q.fluff, bh * q.fluff, bl * 0.55], q.coat), ball([0, bh * 0.1, bl * 0.25], [bw * q.fluff, bh * q.fluff, bl * 0.55], q.coat)] : []),
  ], [
    ...legs,
    joint('neck', [0, bh * 0.2, -bl * 0.4], [shape(CAPSULE, [0, q.neck.len / 2, 0], [q.neck.r * 2, q.neck.len * 1.15, q.neck.r * 2.2], q.coat)], [head], { rot: [-q.neck.tilt, 0, 0] }),
    joint('tail', [0, bh * 0.15, bl * 0.47], tailShapes, [], { rot: [t.tilt, 0, 0] }),
  ]);
  q.extra?.(head, root);
  return { root, plan: 'quad', restDrop: q.hipH - bh * 0.45 };
}

interface Bip {
  skin: number; shirt: number; trousers: number; shoe: number; eye: number; glowEyes?: boolean;
  /** Arms held forward at rest (radians), as a zombie does. */
  armsForward?: number; hunch?: number; bulk?: number; legLen?: number; armLen?: number; headSize?: number; thin?: number;
  extra?: (root: Joint, head: Joint, arms: Joint[]) => void;
}

/** Two legs and two arms with elbows and knees, a torso and a head. */
function biped(b: Bip): Model {
  const bulk = b.bulk ?? 1, thin = b.thin ?? 1, leg = b.legLen ?? 0.24, arm = b.armLen ?? 0.2, hs = b.headSize ?? 1;
  const hipH = leg * 2, torso = 0.3, legs: Joint[] = [], arms: Joint[] = [];
  for (const [side, phase] of [[-1, 0], [1, Math.PI]] as const) {
    legs.push(joint('hip', [side * 0.07 * bulk, 0, 0], [limb(leg, 0.055 * bulk * thin, b.trousers)], [
      joint('knee', [0, -leg, 0], [limb(leg, 0.048 * bulk * thin, b.trousers), ball([0, -leg + 0.005, -0.03], [0.09 * bulk, 0.05, 0.15], b.shoe)], [], { phase, hind: true }),
    ], { phase, side }));
    arms.push(joint('arm', [side * 0.15 * bulk, torso * 0.85, 0], [ball([0, 0, 0], [0.1 * bulk, 0.09 * bulk, 0.1 * bulk], b.shirt), limb(arm, 0.045 * bulk * thin, b.shirt)], [
      joint('elbow', [0, -arm, 0], [limb(arm * 0.9, 0.038 * bulk * thin, b.skin), ball([0, -arm * 0.95, 0], [0.065 * bulk, 0.075 * bulk, 0.065 * bulk], b.skin)], [], { phase }),
    ], { rot: [-(b.armsForward ?? 0), 0, -side * 0.08], phase: phase + Math.PI, side }));
  }
  const head = joint('head', [0, 0.03, 0], [
    ball([0, 0.08 * hs, 0], [0.19 * hs, 0.21 * hs, 0.2 * hs], b.skin),
    ...[-1, 1].map((s) => ball([s * 0.045 * hs, 0.1 * hs, -0.09 * hs], [0.035 * hs, 0.03 * hs, 0.02], b.eye, undefined, b.glowEyes)),
  ]);
  const root = joint('root', [0, hipH, 0], [
    ball([0, 0.02, 0], [0.22 * bulk, 0.12, 0.15 * bulk], b.trousers),
    shape(CAPSULE, [0, torso * 0.5, 0], [0.26 * bulk * thin, torso * 1.05, 0.16 * bulk], b.shirt),
  ], [...legs, ...arms, joint('neck', [0, torso + 0.02, 0], [shape(CAPSULE, [0, 0.03, 0], [0.08, 0.05, 0.08], b.skin)], [head], { rot: [b.hunch ?? 0, 0, 0] })],
  { rot: [b.hunch ? -b.hunch * 0.6 : 0, 0, 0] });
  b.extra?.(root, head, arms);
  return { root, plan: 'biped', restDrop: 0 };
}

/** A round body with a smaller head, many jointed legs splayed out to the sides, and glinting eyes. */
function spider(body: number, head: number, legC: number, eye: number, legsPerSide: number, scale: V3, extra?: (root: Joint, h: Joint) => void): Model {
  const [w, , l] = scale, legs: Joint[] = [];
  for (const side of [-1, 1]) for (let k = 0; k < legsPerSide; k++) {
    const z = (k / (legsPerSide - 1) - 0.5) * l * 0.55, phase = (k + (side > 0 ? 1 : 0)) % 2 ? Math.PI : 0;
    // Each leg rises out to a high knee, then reaches down and out to the ground.
    legs.push(joint('leg', [side * w * 0.25, 0, z], [limb(0.42, 0.035, legC)], [
      joint('foot', [0, -0.42, 0], [limb(0.48, 0.026, legC), cone([0, -0.5, 0], [0.04, 0.06, 0.04], legC, [Math.PI, 0, 0])], [], { rot: [0, 0, -side * 1.55], phase, side }),
    ], { rot: [0, (k / (legsPerSide - 1) - 0.5) * side * 1.1, side * 1.95], phase, side }));
  }
  const h = joint('head', [0, 0.02, -l * 0.42], [
    ball([0, 0, 0], [w * 0.55, w * 0.42, w * 0.5], head),
    ...[[-1, 0.1], [1, 0.1], [-0.5, 0.18], [0.5, 0.18]].map(([s, y]) => ball([s! * w * 0.12, y! * w, -w * 0.22], [0.05, 0.05, 0.04], eye, undefined, true)),
    ...[-1, 1].map((s) => cone([s * w * 0.08, -w * 0.15, -w * 0.25], [0.04, 0.12, 0.04], legC, [Math.PI, 0, 0])),
  ]);
  const root = joint('root', [0, 0.36, 0], [ball([0, 0.05, l * 0.22], [w, w * 0.8, l * 0.6], body), ball([0, 0, -l * 0.12], [w * 0.7, w * 0.5, l * 0.32], head)], [...legs, h]);
  extra?.(root, h);
  return { root, plan: 'spider', restDrop: 0.25 };
}

/** A wobbling jelly with a darker core and two eyes; it squashes and stretches as it hops. */
function slime(s: Species): Model {
  const [r, g, b] = s.colours.body, core = s.colours.head, shine = s.colours.legs;
  const c = (v: readonly number[]) => (v[0]! << 16) | (v[1]! << 8) | v[2]!;
  const glow = !!s.fireproof;
  return { plan: 'slime', restDrop: 0, root: joint('root', [0, 0, 0], [
    ball([0, 0.45, 0], [1.25, 0.9, 1.25], c([r, g, b]), undefined, glow),
    ball([0, 0.36, 0.05], [0.55, 0.45, 0.55], c(core), undefined, glow),
    ball([-0.28, 0.72, -0.3], [0.2, 0.14, 0.12], c(shine), undefined, true),
    ...[-1, 1].map((sd) => ball([sd * 0.2, 0.55, -0.55], [0.14, 0.2, 0.08], 0x101418)),
    ...[-1, 1].map((sd) => ball([sd * 0.18, 0.6, -0.59], [0.05, 0.06, 0.03], 0xffffff, undefined, true)),
    // A king wears a crown.
    ...(s.boss ? [shape(CAPSULE, [0, 0.9, 0], [0.42, 0.08, 0.42], 0xe8b84a), ...[0, 1, 2, 3, 4].map((k) => cone([Math.sin(k * 1.257) * 0.17, 1.0, Math.cos(k * 1.257) * 0.17], [0.08, 0.16, 0.08], 0xffd060)),
      ball([0, 0.95, -0.2], [0.07, 0.07, 0.05], 0xe03050, undefined, true)] : []),
  ]) };
}

/** A furry body with big ears and two membrane wings that beat fast. */
function bat(): Model {
  const fur = 0x5a4640, skin = 0x4a2e30, bone = 0x2a1c1e;
  const wing = (side: number) => joint('wing', [side * 0.12, 0.04, 0], [
    shape(CAPSULE, [side * 0.36, 0, -0.02], [0.04, 0.72, 0.04], bone, [0, 0, Math.PI / 2]),
    ball([side * 0.32, -0.01, 0.1], [0.64, 0.025, 0.3], skin),
    ball([side * 0.6, -0.01, 0.12], [0.26, 0.025, 0.36], skin),
    cone([side * 0.74, 0, -0.02], [0.04, 0.1, 0.04], bone, [0, 0, -side * Math.PI / 2]),
  ], [], { side });
  const head = joint('head', [0, 0.12, -0.14], [
    ball([0, 0, 0], [0.22, 0.2, 0.2], fur),
    ...[-1, 1].map((s) => cone([s * 0.07, 0.15, 0.02], [0.08, 0.16, 0.04], skin, [0, 0, -s * 0.3])),
    ...[-1, 1].map((s) => ball([s * 0.05, 0.02, -0.095], [0.04, 0.04, 0.02], 0xff5040, undefined, true)),
    cone([0, -0.07, -0.08], [0.06, 0.05, 0.04], 0xf4eadc, [Math.PI, 0, 0]),
  ]);
  return { plan: 'bat', restDrop: 0, root: joint('root', [0, 0.5, 0], [ball([0, 0, 0.02], [0.22, 0.2, 0.32], fur)], [
    head, wing(-1), wing(1),
    ...[-1, 1].map((s) => joint('none', [s * 0.05, -0.15, 0.04], [limb(0.08, 0.015, skin)])),
  ]) };
}

/** A moth: a furry body and head, feathery antennae, glowing eyes and two pairs of patterned wings. */
function moth(s: Species): Model {
  const c = (v: readonly number[]) => (v[0]! << 16) | (v[1]! << 8) | v[2]!;
  const fur = c(s.colours.body), dark = c(s.colours.head), glow = c(s.colours.legs);
  const wing = (side: number, back: boolean) => joint('wing', [side * 0.08, 0.04, back ? 0.08 : -0.04], [
    ball([side * 0.3, 0, back ? 0.12 : -0.02], [0.56, 0.02, back ? 0.36 : 0.44], fur, [0, side * (back ? -0.5 : 0.4), 0]),
    ball([side * 0.34, 0.012, back ? 0.14 : -0.04], [0.2, 0.02, 0.16], glow, undefined, true),
    ball([side * 0.3, 0.014, back ? 0.12 : -0.02], [0.1, 0.02, 0.08], dark),
  ], [], { side });
  const head = joint('head', [0, 0.04, -0.2], [
    ball([0, 0, 0], [0.18, 0.16, 0.16], fur),
    ...[-1, 1].map((sd) => ball([sd * 0.06, 0.02, -0.07], [0.07, 0.07, 0.05], glow, undefined, true)),
    ...[-1, 1].map((sd) => cone([sd * 0.05, 0.13, -0.05], [0.06, 0.2, 0.02], dark, [-0.5, 0, -sd * 0.4])),
  ]);
  // Hornets: dark bands round the abdomen and a stinger at its tip.
  const hornet = s.key === 'hornet' || s.key === 'hive_mother';
  const bands = hornet ? [0.1, 0.24, 0.38].map((z) => ball([0, 0, z], [0.19, 0.19 - z * 0.12, 0.05], dark)).concat(cone([0, -0.01, 0.56], [0.04, 0.16, 0.04], 0x1a140c, [Math.PI / 2, 0, 0])) : [];
  return { plan: 'bat', restDrop: 0, root: joint('root', [0, 0.5, 0], [
    ball([0, 0, 0.12], [0.18, 0.18, 0.4], fur), ball([0, 0.01, -0.06], [0.2, 0.2, 0.18], hornet ? dark : 0xe8e0d0), ...bands,
  ], [head, wing(-1, false), wing(1, false), wing(-1, true), wing(1, true)]) };
}

/** A great worm: a horned head with a round maw of teeth, and a long chain of segments that sway behind it. */
function worm(s: Species): Model {
  const c = (v: readonly number[]) => (v[0]! << 16) | (v[1]! << 8) | v[2]!;
  const hide = c(s.colours.body), dark = c(s.colours.head), tooth = c(s.colours.legs);
  let tail: Joint | null = null;
  for (let k = 7; k >= 1; k--) {
    const r = 0.5 - k * 0.04;
    tail = joint('tail', [0, -0.02, 0.4], [ball([0, 0, 0.22], [r * 1.1, r * 1.1, 0.55], k % 2 ? hide : dark), ...[-1, 1].map((sd) => cone([sd * r * 0.5, r * 0.5, 0.22], [0.05, 0.14, 0.05], tooth, [0, 0, -sd * 0.5]))],
      tail ? [tail] : [], { phase: k * 0.5 });
  }
  return { plan: 'fish', restDrop: 0, root: joint('root', [0, 0.5, 0], [
    ball([0, 0, 0], [0.62, 0.62, 0.7], hide),
    ball([0, 0, -0.32], [0.48, 0.48, 0.12], 0x2a1410),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => cone([Math.cos(k * 0.785) * 0.2, Math.sin(k * 0.785) * 0.2, -0.36], [0.05, 0.14, 0.05], tooth, [-Math.PI / 2, 0, k * 0.785])),
    ...[-1, 1].map((sd) => cone([sd * 0.24, 0.26, -0.1], [0.07, 0.3, 0.07], dark, [-0.5, 0, -sd * 0.5])),
  ], [tail!]) };
}

/** A fish: a long body, a beating tail fin, a back fin and eyes. */
function fish(s: Species): Model {
  const c = (v: readonly number[]) => (v[0]! << 16) | (v[1]! << 8) | v[2]!;
  const body = c(s.colours.body), belly = 0xdfe8ea;
  return { plan: 'fish', restDrop: 0, root: joint('root', [0, 0.5, 0], [
    ball([0, 0, 0], [0.55, 0.8, 1.9], body),
    ball([0, -0.15, 0], [0.45, 0.45, 1.6], belly),
    cone([0, 0.45, 0.1], [0.08, 0.35, 0.6], c(s.colours.legs), [0, 0, 0]),
    ...[-1, 1].map((sd) => ball([sd * 0.24, 0.12, -0.6], [0.1, 0.14, 0.1], 0x101010)),
  ], [joint('tail', [0, 0, 0.85], [cone([0, 0, 0.3], [0.08, 0.7, 0.6], c(s.colours.legs), [Math.PI / 2, 0, 0])])]) };
}

const brown = 0x2b211b, black = 0x14100e;
const MODELS: Record<string, Model> = {
  deer: quadruped({ hipH: 0.56, body: [0.22, 0.27, 0.62], coat: 0x9a5b2e, belly: 0xe2c9a0, leg: 0x7d4a26, hoof: brown, legR: 0.026,
    neck: { len: 0.24, r: 0.055, tilt: 0.75 }, head: [0.11, 0.12, 0.17], snout: { len: 0.1, r: 0.045, color: 0x8a5228 },
    ears: { len: 0.09, r: 0.035, tilt: 1.1 }, tail: { len: 0.07, r: 0.03, color: 0xf2eadb, tilt: -0.4 },
    extra: (head) => {
      for (const s of [-1, 1]) head.kids.push(joint('none', [s * 0.03, 0.06, 0.02], [
        cone([0, 0.09, 0], [0.025, 0.18, 0.025], 0xd8c6a2), cone([s * 0.03, 0.12, -0.01], [0.018, 0.08, 0.018], 0xd8c6a2, [0, 0, -s * 0.8]),
        cone([-s * 0.01, 0.15, 0.02], [0.016, 0.07, 0.016], 0xd8c6a2, [0.5, 0, s * 0.4]),
      ], [], { rot: [0.3, 0, -s * 0.35] }));
    } }),
  rabbit: quadruped({ hipH: 0.28, body: [0.36, 0.42, 0.62], coat: 0xa88c6e, belly: 0xe8dccb, leg: 0x9a7f62, hoof: 0xd8ccb8, legR: 0.045,
    neck: { len: 0.1, r: 0.12, tilt: 0.3 }, head: [0.3, 0.3, 0.32], snout: { len: 0.08, r: 0.08, color: 0xb89c7e }, nose: 0xd88a8a,
    ears: { len: 0.3, r: 0.06, tilt: 0.15, color: 0xb89a7c }, tail: { len: 0.1, r: 0.07, color: 0xf6f0e6, tilt: 0.6, bushy: true } }),
  boar: quadruped({ hipH: 0.38, body: [0.36, 0.44, 0.78], coat: 0x5c4636, belly: 0x4a382c, leg: 0x3c2e24, hoof: black, legR: 0.045,
    neck: { len: 0.06, r: 0.14, tilt: 0.1 }, head: [0.24, 0.26, 0.3], snout: { len: 0.18, r: 0.08, color: 0x6e5444 }, nose: 0x8a6656,
    ears: { len: 0.1, r: 0.05, tilt: 0.5 }, tail: { len: 0.12, r: 0.02, color: 0x3c2e24, tilt: 0.3 },
    extra: (head, root) => {
      for (const s of [-1, 1]) head.shapes.push(cone([s * 0.07, -0.08, -0.3], [0.03, 0.12, 0.03], 0xf2ead8, [-0.5, 0, s * 0.3]));
      root.shapes.push(ball([0, 0.2, -0.12], [0.14, 0.2, 0.5], 0x3a2c22));
    } }),
  wolf: quadruped({ hipH: 0.5, body: [0.26, 0.3, 0.72], coat: 0x8a8d93, belly: 0xc9c6bf, leg: 0x7a7c82, hoof: 0x3b3a3c, legR: 0.035,
    neck: { len: 0.14, r: 0.09, tilt: 0.45 }, head: [0.19, 0.17, 0.22], snout: { len: 0.17, r: 0.06, color: 0x9a9da3 }, eye: 0xe8c040,
    ears: { len: 0.1, r: 0.045, tilt: 0.25 }, tail: { len: 0.32, r: 0.055, color: 0x6f7277, tilt: 0.9, bushy: true } }),
  bear: quadruped({ hipH: 0.42, body: [0.46, 0.5, 0.86], coat: 0x54392a, belly: 0x46301f, leg: 0x46301f, hoof: 0x1d1611, legR: 0.07,
    neck: { len: 0.1, r: 0.16, tilt: 0.2 }, head: [0.3, 0.28, 0.3], snout: { len: 0.14, r: 0.09, color: 0x8a6a4e },
    ears: { len: 0.08, r: 0.06, tilt: 0.6 }, tail: { len: 0.06, r: 0.05, color: 0x46301f, tilt: 0.4 },
    extra: (_h, root) => root.shapes.push(ball([0, 0.16, -0.18], [0.42, 0.34, 0.4], 0x5e4130)) }),
  fox: quadruped({ hipH: 0.4, body: [0.24, 0.28, 0.68], coat: 0xce6e2c, belly: 0xf3e6d6, leg: 0x3c2820, hoof: 0x2a1c16, legR: 0.03,
    neck: { len: 0.12, r: 0.08, tilt: 0.5 }, head: [0.22, 0.2, 0.22], snout: { len: 0.2, r: 0.055, color: 0xf0e4d4 }, eye: 0xd4a020,
    ears: { len: 0.16, r: 0.06, tilt: 0.25 }, tail: { len: 0.46, r: 0.08, color: 0xce6e2c, tilt: 0.7, bushy: true, tip: 0xf6f0e8 } }),
  sheep: quadruped({ hipH: 0.5, body: [0.48, 0.42, 0.66], coat: 0xeee7da, belly: 0xe0d8c8, leg: 0x2f2925, hoof: 0x1d1917, legR: 0.03,
    neck: { len: 0.1, r: 0.08, tilt: 0.5 }, head: [0.16, 0.18, 0.21], snout: { len: 0.08, r: 0.06, color: 0x2f2925 },
    ears: { len: 0.1, r: 0.04, tilt: 1.7, color: 0x3a322c }, tail: { len: 0.08, r: 0.05, color: 0xeee7da, tilt: 0.8 }, fluff: 0.95,
    extra: (head) => { head.shapes[0] = ball([0, 0, 0], [0.16, 0.18, 0.21], 0x3a322c); head.shapes.push(ball([0, 0.08, 0.02], [0.18, 0.1, 0.16], 0xeee7da)); } }),
  cow: quadruped({ hipH: 0.5, body: [0.36, 0.38, 0.82], coat: 0x4a382c, belly: 0xece6dc, leg: 0x3c2e24, hoof: black, legR: 0.045,
    neck: { len: 0.12, r: 0.1, tilt: 0.4 }, head: [0.2, 0.22, 0.26], snout: { len: 0.1, r: 0.09, color: 0xe6c8b8 }, nose: 0x8a5a54,
    ears: { len: 0.1, r: 0.05, tilt: 1.5 }, tail: { len: 0.32, r: 0.02, color: 0x3c2e24, tilt: -0.15 },
    extra: (head, root) => {
      head.shapes[0] = ball([0, 0, 0], [0.2, 0.22, 0.26], 0xece6dc);
      for (const s of [-1, 1]) head.shapes.push(cone([s * 0.1, 0.12, 0.02], [0.035, 0.12, 0.035], 0xe8dcc0, [0, 0, -s * 0.9]));
      root.shapes.push(ball([0.1, 0.06, 0.12], [0.2, 0.26, 0.3], 0xece6dc), ball([-0.12, 0.1, -0.2], [0.16, 0.2, 0.22], 0xece6dc));
    } }),
  goat: quadruped({ hipH: 0.48, body: [0.24, 0.3, 0.58], coat: 0xdcd8cc, belly: 0xccc8bc, leg: 0x8a867c, hoof: 0x2a2622, legR: 0.03,
    neck: { len: 0.16, r: 0.07, tilt: 0.55 }, head: [0.14, 0.16, 0.2], snout: { len: 0.1, r: 0.05, color: 0xc8c4b8 },
    ears: { len: 0.1, r: 0.04, tilt: 1.4 }, tail: { len: 0.08, r: 0.035, color: 0xdcd8cc, tilt: -0.7 },
    extra: (head) => {
      for (const s of [-1, 1]) head.shapes.push(cone([s * 0.04, 0.12, 0.06], [0.035, 0.2, 0.035], 0x6a5e50, [0.7, 0, -s * 0.2]));
      head.shapes.push(cone([0, -0.12, -0.12], [0.05, 0.12, 0.04], 0xece8de, [Math.PI, 0, 0]));
    } }),
  camel: quadruped({ hipH: 0.62, body: [0.24, 0.24, 0.6], coat: 0xc4a068, belly: 0xb89460, leg: 0xaa8858, hoof: 0x6e5a40, legR: 0.03,
    neck: { len: 0.3, r: 0.06, tilt: 0.25 }, head: [0.12, 0.12, 0.2], snout: { len: 0.1, r: 0.055, color: 0xb89460 },
    ears: { len: 0.05, r: 0.03, tilt: 1 }, tail: { len: 0.14, r: 0.02, color: 0x8a6e48, tilt: -0.3 },
    extra: (_h, root) => root.shapes.push(ball([0, 0.15, 0.02], [0.2, 0.22, 0.26], 0xc4a068)) }),
  snow_prowler: quadruped({ hipH: 0.44, body: [0.3, 0.32, 0.82], coat: 0xdfeaef, belly: 0xf2f6f8, leg: 0xc6d4de, hoof: 0x8a9aa6, legR: 0.045,
    neck: { len: 0.1, r: 0.11, tilt: 0.25 }, head: [0.24, 0.22, 0.24], snout: { len: 0.1, r: 0.08, color: 0xeef4f6 }, eye: 0x7fd4ff, eyeGlow: true,
    ears: { len: 0.09, r: 0.05, tilt: 0.3 }, tail: { len: 0.5, r: 0.04, color: 0xc6d4de, tilt: 0.2 },
    extra: (head, root) => {
      for (const s of [-1, 1]) head.shapes.push(cone([s * 0.05, -0.1, -0.2], [0.025, 0.12, 0.025], 0xffffff, [Math.PI + 0.2, 0, 0]));
      for (const x of [-0.1, 0.12, 0.3]) root.shapes.push(ball([0, 0.13, x], [0.25, 0.06, 0.06], 0x9ab0c0));
    } }),
  fish: fish(SPECIES.find((s) => s.key === 'fish')!),
  zombie: biped({ skin: 0x6f8f6a, shirt: 0x3e5f6f, trousers: 0x3b3550, shoe: 0x2a2420, eye: 0xd8ff7a, glowEyes: true, armsForward: 1.35, hunch: 0.25,
    extra: (root, head) => { head.shapes.push(ball([0, 0.15, 0.02], [0.17, 0.06, 0.16], 0x4a3a2a)); root.shapes.push(box([0.06, 0.2, -0.085], [0.08, 0.08, 0.01], 0x2e4652)); } }),
  skulker: biped({ skin: 0xc8c4b0, shirt: 0x46405a, trousers: 0x322e3c, shoe: 0x1e1a22, eye: 0xff6a3a, glowEyes: true, armsForward: 0.5, thin: 0.8,
    extra: (root, head, arms) => {
      head.shapes.push(cone([0, 0.18, 0.02], [0.26, 0.3, 0.26], 0x46405a), ball([0, 0.1, 0.03], [0.23, 0.22, 0.22], 0x3a3450));
      root.shapes.push(cone([0, 0.08, 0], [0.32, 0.36, 0.22], 0x3a3450, [Math.PI, 0, 0]));
      arms[0]!.kids[0]!.shapes.push(shape(CAPSULE, [0, -0.2, -0.04], [0.025, 0.5, 0.025], 0x6e4c2c, [0.2, 0, 0]));
    } }),
  skeleton: biped({ skin: 0xe8e2cc, shirt: 0xe8e2cc, trousers: 0xd8d2bc, shoe: 0xcfc8b0, eye: 0xff4a2a, glowEyes: true, thin: 0.55, armsForward: 0.35,
    extra: (root, head, arms) => {
      root.shapes[1] = shape(CAPSULE, [0, 0.15, 0], [0.05, 0.32, 0.05], 0xd8d2bc);
      for (let k = 0; k < 4; k++) root.shapes.push(ball([0, 0.12 + k * 0.05, 0], [0.24 - k * 0.02, 0.03, 0.14], 0xe8e2cc));
      head.shapes[0] = ball([0, 0.08, 0], [0.18, 0.2, 0.19], 0xf0ead6);
      head.shapes.push(box([0, 0.0, -0.05], [0.12, 0.06, 0.09], 0xe0dac6), ...[-1, 1].map((s) => ball([s * 0.045, 0.09, -0.085], [0.06, 0.06, 0.03], 0x1a1414)));
      arms[1]!.kids[0]!.shapes.push(box([0, -0.32, -0.1], [0.03, 0.04, 0.4], 0x8a8f96), box([0, -0.32, 0.02], [0.08, 0.025, 0.025], 0x5a4030));
    } }),
  brute: biped({ skin: 0xbcd2e2, shirt: 0xaac4d6, trousers: 0x7890a4, shoe: 0x52667a, eye: 0x9fe8ff, glowEyes: true, bulk: 1.7, hunch: 0.35, armLen: 0.26, headSize: 0.8,
    extra: (root, head) => { root.shapes.push(ball([0, 0.36, 0.04], [0.5, 0.22, 0.32], 0xe2eef6)); for (const s of [-1, 1]) head.shapes.push(cone([s * 0.07, 0.16, 0], [0.04, 0.12, 0.04], 0xf4f8fa, [0, 0, -s * 0.4])); } }),
  frost_colossus: biped({ skin: 0xc4def0, shirt: 0x9cc4e0, trousers: 0x6e94b4, shoe: 0x4a6a8a, eye: 0x7ff0ff, glowEyes: true, bulk: 2.1, hunch: 0.2, armLen: 0.3,
    legLen: 0.27, headSize: 0.75,
    extra: (root, head, arms) => {
      // Ice crystals jut from the shoulders, back and crown; the fists are blocks of ice.
      for (const s of [-1, 1]) for (let k = 0; k < 3; k++) root.shapes.push(cone([s * (0.2 + k * 0.06), 0.36 + k * 0.03, 0.04 + k * 0.03], [0.05, 0.16 - k * 0.03, 0.05], 0xe8f8ff, [0.3, 0, -s * (0.5 + k * 0.2)]));
      for (let k = 0; k < 3; k++) root.shapes.push(cone([0, 0.18 + k * 0.08, 0.14], [0.05, 0.14, 0.05], 0xbfeaff, [0.9, 0, 0]));
      for (const s of [-1, 0, 1]) head.shapes.push(cone([s * 0.06, 0.18, 0], [0.035, 0.12 - Math.abs(s) * 0.03, 0.035], 0xe8f8ff, [0, 0, -s * 0.35]));
      for (const a of arms) a.kids[0]!.shapes.push(box([0, -0.3, 0], [0.12, 0.12, 0.12], 0xbfeaff));
    } }),
  warden: biped({ skin: 0x5a3c40, shirt: 0x523a3e, trousers: 0x3e2c30, shoe: 0x2a1c1e, eye: 0xffa040, glowEyes: true, bulk: 1.8, armLen: 0.28, legLen: 0.26, headSize: 0.9,
    extra: (root, head) => {
      head.shapes.push(ball([0, 0.06, -0.06], [0.14, 0.1, 0.12], 0xff7828, undefined, true), cone([0, 0.25, 0.02], [0.08, 0.16, 0.08], 0xff9a40, undefined));
      root.shapes.push(ball([0, 0.2, -0.1], [0.18, 0.18, 0.1], 0xff7828, undefined, true));
      for (const s of [-1, 1]) root.shapes.push(cone([s * 0.24, 0.32, 0.02], [0.08, 0.18, 0.08], 0x2a1e20, [0, 0, -s * 0.5]));
    } }),
  swamp_hollow: biped({ skin: 0x506e30, shirt: 0x48602c, trousers: 0x3e5024, shoe: 0x2e3c1a, eye: 0xc8ff60, glowEyes: true, hunch: 0.45, thin: 0.75, armLen: 0.27, legLen: 0.27,
    extra: (root, head) => { root.shapes.push(ball([0.06, 0.33, 0.03], [0.24, 0.1, 0.2], 0x6a8a3a), ball([-0.1, 0.1, 0.06], [0.1, 0.16, 0.1], 0x7aa046)); head.shapes.push(cone([0, -0.06, -0.02], [0.14, 0.16, 0.12], 0x6a8a3a, [Math.PI, 0, 0])); } }),
  trader: biped({ skin: 0xcfa274, shirt: 0x2d636f, trousers: 0x393642, shoe: 0x3a2a20, eye: 0x241a14,
    extra: (root, head) => {
      head.shapes.push(shape(CAPSULE, [0, 0.19, 0], [0.32, 0.02, 0.32], 0x6e4c2c), shape(CAPSULE, [0, 0.24, 0], [0.18, 0.1, 0.18], 0x6e4c2c), ball([0, 0.02, -0.06], [0.14, 0.08, 0.1], 0x7a5a40));
      root.shapes.push(box([0, 0.18, 0.13], [0.22, 0.26, 0.12], 0x7a5434), box([0, 0.33, 0.13], [0.2, 0.05, 0.13], 0x5e3e24), box([0, 0.02, -0.09], [0.24, 0.05, 0.02], 0x8a6a3a));
    } }),
  farmer: biped({ skin: 0xd8a878, shirt: 0x5a7e3a, trousers: 0x6a5238, shoe: 0x3a2a1c, eye: 0x241a14,
    extra: (root, head) => {
      // A wide straw hat and an apron.
      head.shapes.push(shape(CAPSULE, [0, 0.18, 0], [0.42, 0.025, 0.42], 0xe2c46a), shape(CAPSULE, [0, 0.23, 0], [0.2, 0.09, 0.2], 0xd6b45a), shape(CAPSULE, [0, 0.2, 0], [0.21, 0.025, 0.21], 0xa0402c));
      root.shapes.push(box([0, 0.12, -0.085], [0.2, 0.28, 0.015], 0xe8dcc0));
    } }),
  smith: biped({ skin: 0xc08a60, shirt: 0x6a6e74, trousers: 0x3a3a40, shoe: 0x2a2220, eye: 0x241a14, bulk: 1.15,
    extra: (root, head, arms) => {
      // A leather apron, a full beard and a hammer.
      root.shapes.push(box([0, 0.14, -0.1], [0.24, 0.34, 0.02], 0x6a4428));
      head.shapes.push(ball([0, 0.01, -0.06], [0.16, 0.12, 0.1], 0x5a3a22), ball([0, 0.16, 0.0], [0.17, 0.06, 0.17], 0x5a3a22));
      arms[1]!.kids[0]!.shapes.push(shape(CAPSULE, [0, -0.24, -0.08], [0.025, 0.24, 0.025], 0x6e4c2c, [1.2, 0, 0]), box([0, -0.24, -0.2], [0.07, 0.07, 0.12], 0x7a8088));
    } }),
  herbalist: biped({ skin: 0xe0b890, shirt: 0x6a4a86, trousers: 0x4a3460, shoe: 0x2a2030, eye: 0x241a14, thin: 0.9,
    extra: (root, head) => {
      // A long robe, a hood and a satchel of herbs.
      root.shapes.push(cone([0, -0.06, 0], [0.34, 0.5, 0.26], 0x5a3e76, [Math.PI, 0, 0]), box([0.13, 0.06, 0.02], [0.06, 0.12, 0.14], 0x7a5a34), ball([0.13, 0.14, 0.02], [0.06, 0.05, 0.08], 0x6aa04a));
      head.shapes.push(ball([0, 0.12, 0.03], [0.23, 0.22, 0.22], 0x6a4a86), cone([0, 0.25, 0.06], [0.14, 0.14, 0.14], 0x6a4a86, [0.5, 0, 0]));
    } }),
  guide: biped({ skin: 0xd8a878, shirt: 0x7a5a34, trousers: 0x4a4038, shoe: 0x3a2a1c, eye: 0x241a14,
    extra: (root, head) => {
      // The tails of a travelling coat, and a flat cap.
      root.shapes.push(cone([0, -0.04, 0], [0.26, 0.3, 0.2], 0x6a4a2a, [Math.PI, 0, 0]));
      head.shapes.push(ball([0, 0.17, 0.02], [0.2, 0.07, 0.2], 0x4a5a3a), ball([0, 0.15, -0.12], [0.14, 0.025, 0.08], 0x4a5a3a));
    } }),
  merchant: biped({ skin: 0xc89a6a, shirt: 0x8a2a2a, trousers: 0x3a2e28, shoe: 0x2a2018, eye: 0x241a14, bulk: 1.1,
    extra: (root, head) => {
      // A red coat with gold buttons, a pack on the back and a tall hat.
      root.shapes.push(box([0, 0.2, 0.13], [0.24, 0.3, 0.12], 0x7a5a34), ball([0, 0.22, -0.1], [0.03, 0.03, 0.02], 0xe8b84a), ball([0, 0.14, -0.1], [0.03, 0.03, 0.02], 0xe8b84a));
      head.shapes.push(shape(CAPSULE, [0, 0.18, 0], [0.26, 0.02, 0.26], 0x2a2420), shape(CAPSULE, [0, 0.27, 0], [0.15, 0.12, 0.15], 0x2a2420));
    } }),
  nurse: biped({ skin: 0xe8c0a0, shirt: 0xf0f0ec, trousers: 0xe0e0dc, shoe: 0x6a6a70, eye: 0x241a14, thin: 0.9,
    extra: (root, head) => {
      // White clothes with a red cross, and a small cap.
      root.shapes.push(box([0, 0.2, -0.1], [0.08, 0.025, 0.01], 0xd02a30), box([0, 0.2, -0.1], [0.025, 0.08, 0.01], 0xd02a30));
      head.shapes.push(box([0, 0.17, -0.02], [0.18, 0.06, 0.14], 0xf4f4f0), box([0, 0.18, -0.09], [0.04, 0.012, 0.01], 0xd02a30));
    } }),
  alchemist: biped({ skin: 0xd8b088, shirt: 0x2a6a6a, trousers: 0x244a50, shoe: 0x20282c, eye: 0x241a14,
    extra: (root, head) => {
      // A teal robe, brass goggles pushed up, and a bottle at the belt.
      root.shapes.push(cone([0, -0.06, 0], [0.32, 0.48, 0.25], 0x235a5a, [Math.PI, 0, 0]), ball([0.14, 0.0, -0.04], [0.05, 0.07, 0.05], 0xe0303c));
      head.shapes.push(ball([0.06, 0.12, -0.11], [0.045, 0.045, 0.03], 0xc89a4a), ball([-0.06, 0.12, -0.11], [0.045, 0.045, 0.03], 0xc89a4a), ball([0, 0.15, 0], [0.18, 0.08, 0.18], 0x7a5a40));
    } }),
  crawler: spider(0x3e3632, 0x4a403a, 0x302a26, 0xff3030, 4, [0.6, 0.4, 0.8]),
  desert_stalker: spider(0xba914b, 0xd2ae62, 0x90693a, 0x301808, 3, [0.5, 0.35, 0.8], (root, head) => {
    // A curled tail over the back ending in a sting, and two claws.
    root.kids.push(joint('tail', [0, 0.08, 0.42], [ball([0, 0.06, 0.05], [0.12, 0.12, 0.16], 0xba914b)], [
      joint('none', [0, 0.1, 0.06], [ball([0, 0.07, 0], [0.11, 0.16, 0.11], 0xba914b)], [
        joint('none', [0, 0.14, -0.02], [ball([0, 0.04, -0.04], [0.1, 0.12, 0.12], 0xba914b), cone([0, 0.02, -0.14], [0.05, 0.14, 0.05], 0x301808, [-Math.PI / 2, 0, 0])])], { rot: [-0.9, 0, 0] }),
    ], { rot: [0.5, 0, 0] }));
    for (const s of [-1, 1]) head.kids.push(joint('arm', [s * 0.14, -0.02, -0.08], [limb(0.16, 0.03, 0x90693a, 0), ball([0, -0.18, 0], [0.12, 0.08, 0.16], 0xd2ae62)], [], { rot: [-1.4, s * 0.4, 0], side: s }));
  }),
  bat: bat(),
};
for (const s of SPECIES) if (s.hops) MODELS[s.key] = slime(s);
// The mimic hops like a slime but is a chest: a wooden box with iron bands, its lid open on a row of teeth and a tongue.
MODELS.mimic = { plan: 'slime', restDrop: 0, root: joint('root', [0, 0, 0], [
  box([0, 0.25, 0], [0.9, 0.5, 0.7], 0x8a5a2c), box([0, 0.12, -0.36], [0.92, 0.06, 0.02], 0x6a6e74), box([0, 0.4, -0.36], [0.92, 0.05, 0.02], 0x6a6e74),
  box([0, 0.72, 0.12], [0.9, 0.12, 0.7], 0x9a6a38, [-0.55, 0, 0]), box([0, 0.66, -0.12], [0.92, 0.04, 0.02], 0x6a6e74, [-0.55, 0, 0]),
  ...[-0.3, -0.15, 0, 0.15, 0.3].map((x) => cone([x, 0.54, -0.3], [0.06, 0.12, 0.06], 0xf0ead8)),
  ...[-0.22, 0, 0.22].map((x) => cone([x, 0.6, -0.26], [0.05, 0.1, 0.05], 0xf0ead8, [Math.PI, 0, 0])),
  ball([0, 0.5, -0.2], [0.18, 0.04, 0.22], 0xc03040),
  ...[-1, 1].map((sd) => ball([sd * 0.22, 0.86, -0.08], [0.07, 0.07, 0.05], 0xffd040, undefined, true)),
]) };
for (const m of [MODELS.rabbit]) m!.hop = true;
MODELS.sandmaw = worm(SPECIES.find((s) => s.key === 'sandmaw')!);
for (const key of ['gloom_moth', 'gloom_matriarch', 'hornet', 'hive_mother']) MODELS[key] = moth(SPECIES.find((s) => s.key === key)!);

export function hasShapeModel(key: string): boolean { return key in MODELS; }

/** How many shapes a species' model has (for tests). */
export function shapeCount(key: string): number {
  const count = (j: Joint): number => j.shapes.length + j.kids.reduce((n, k) => n + count(k), 0);
  return MODELS[key] ? count(MODELS[key].root) : 0;
}

interface Pose {
  phase: number; time: number; speed: number; sleeping: boolean; attack: number; hurt: number; graze: number; air: number; plan: Plan;
}

const swingOf = (p: Pose) => Math.min(1.3, p.speed);

/** The animated rotation of a joint, added to its rest rotation. */
function animate(j: Joint, p: Pose, out: number[]): void {
  const sw = swingOf(p), ph = p.phase + j.phase, s = Math.sin(ph), c = Math.cos(ph), still = Math.max(0, 1 - sw * 2);
  out[0] = out[1] = out[2] = 0;
  if (p.sleeping) {
    if (p.plan === 'quad') {
      // Lying down: forelegs folded back under the chest, hind legs tucked forward along the belly, head lowered and
      // turned to the side, tail curled round. A slow breath moves the head a little.
      if (j.role === 'hip') { out[0] = j.hind ? 1.25 : -1.35; out[2] = j.side * 0.12; }
      else if (j.role === 'knee') out[0] = j.hind ? -2.5 : 2.55;
      else if (j.role === 'neck') { out[0] = 0.55; out[1] = 0.55; }
      else if (j.role === 'head') { out[0] = 0.5 + Math.sin(p.time * 0.9) * 0.03; out[2] = 0.25; }
      else if (j.role === 'tail') { out[0] = 0.5; out[1] = 0.9; }
      else if (j.role === 'ear') out[0] = -0.5;
    } else if (p.plan === 'biped') {
      // Lying on the side, knees drawn up a little, one arm under the head.
      if (j.role === 'hip') out[0] = 0.5 + j.side * 0.1;
      else if (j.role === 'knee') out[0] = -0.8;
      else if (j.role === 'arm') out[0] = j.side < 0 ? 2.4 : 0.6;
      else if (j.role === 'elbow') out[0] = j.side < 0 ? 0.9 : 0.4;
      else if (j.role === 'neck') out[0] = 0.15;
    }
    return;
  }
  const atk = p.attack, flinch = p.hurt;
  switch (j.role) {
    case 'root':
      if (p.plan === 'quad') { out[0] = -0.22 * atk + 0.15 * flinch + (p.speed > 1.2 ? 0.06 * Math.sin(p.phase * 2) : 0); out[2] = sw * 0.03 * s; }
      else if (p.plan === 'biped') { out[1] = sw * 0.1 * s; out[0] = -0.12 * atk + 0.12 * flinch; }
      else if (p.plan === 'fish') { out[1] = Math.sin(p.time * 3) * 0.08; }
      else if (p.plan === 'bat') { out[0] = 0.25 * sw; out[2] = Math.sin(p.time * 2.3) * 0.15; }
      return;
    case 'hip':
      out[0] = sw * (p.plan === 'biped' ? 0.6 : 0.5) * s;
      if (p.plan === 'quad' && p.speed > 1.2) out[0] = 0.75 * Math.sin(p.phase + (j.hind ? 0 : 0.9)) * (j.side > 0 ? 1 : 0.85);
      return;
    case 'knee':
      // The lower leg folds while the foot swings forward; hind legs bend the other way at the hock.
      out[0] = -sw * (p.plan === 'biped' ? 0.9 : 0.75) * Math.max(0, -c);
      return;
    case 'arm':
      if (j.side !== 0 && p.plan === 'spider') { out[0] = -0.5 * atk; out[1] = -j.side * 0.6 * atk; return; }
      // Arms swing against the legs; an attack raises both and brings them down hard.
      out[0] = sw * 0.55 * s - (atk > 0.5 ? (1 - atk) * 2 * 1.6 : atk * 2 * 1.6) * (atk > 0 ? 1 : 0) + Math.sin(p.time * 1.1 + j.side) * 0.04 * still;
      out[2] = -j.side * 0.1 * flinch;
      return;
    case 'elbow':
      out[0] = -0.2 - sw * 0.35 * Math.max(0, c) - 0.6 * atk;
      return;
    case 'neck':
      out[0] = (p.plan === 'quad' ? -1.1 * p.graze : 0) + sw * 0.05 * Math.sin(p.phase * 2) - 0.45 * atk + 0.3 * flinch;
      out[1] = Math.sin(p.time * 0.37) * 0.3 * still * (1 - p.graze);
      return;
    case 'head':
      out[0] = Math.sin(p.time * 0.8) * 0.06 - 0.5 * p.graze + (p.graze ? Math.max(0, Math.sin(p.time * 5)) * 0.12 : 0);
      out[1] = Math.sin(p.time * 0.23 + 1) * 0.35 * still * (1 - p.graze);
      return;
    case 'tail':
      if (p.plan === 'fish') { out[1] = Math.sin(p.time * (4 + sw * 6)) * 0.55; return; }
      out[0] = Math.sin(p.time * 1.7) * 0.1;
      out[1] = Math.sin(p.time * (2.3 + sw * 4)) * (0.3 + sw * 0.2);
      return;
    case 'ear':
      out[0] = Math.max(0, Math.sin(p.time * 1.3 + j.side * 2)) ** 8 * 0.5 + 0.3 * sw + 0.8 * p.graze;
      return;
    case 'wing':
      out[2] = j.side * (Math.sin(p.time * 13) * 0.75 + 0.15);
      out[0] = Math.cos(p.time * 13) * 0.15;
      return;
    case 'leg':
      // Spider legs step in alternating sets: forward and back, lifting as they reach.
      out[1] = sw * 0.35 * s + (still ? Math.sin(p.time * 2 + j.phase) * 0.03 : 0);
      out[2] = j.side * sw * 0.25 * Math.max(0, c) - j.side * 0.3 * atk;
      return;
    case 'foot':
      out[2] = -j.side * sw * 0.2 * Math.max(0, -c);
      return;
  }
}

const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpE = new THREE.Euler();
const local = new THREE.Matrix4(), part = new THREE.Matrix4(), tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), FORWARD = new THREE.Vector3(0, 0, 1);
const HURT = new THREE.Color(1, 0.12, 0.1), FLASH = new THREE.Color(1, 1, 0.85);
const angles = [0, 0, 0];

/** Shape-built creatures in four instanced draws, one per primitive. */
export class ShapeMobs {
  private readonly meshes: THREE.InstancedMesh[];
  private readonly counts = [0, 0, 0, 0];
  /** One world matrix per joint depth, reused every frame. */
  private readonly stack = Array.from({ length: 12 }, () => new THREE.Matrix4());

  constructor(scene: THREE.Scene, fog?: WorldFogUniforms) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying float mobShade;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
        // A soft key light from above and front-left, fill from the sky, and a darker underside.
        vec3 wn = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        mobShade = 0.55 + 0.42 * max(dot(wn, normalize(vec3(-0.35, 1.0, -0.45))), 0.0) + 0.12 * (wn.y * 0.5 + 0.5);`);
      shader.fragmentShader = 'varying float mobShade;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mobShade;');
    };
    material.customProgramCacheKey = () => 'shape-mobs-v2';
    attachWorldFog(material, fog);
    const capsule = new THREE.CapsuleGeometry(0.5, 1, 4, 10);
    // The capsule's height is 2 (radius 0.5 caps on a length-1 body): scaled to height 1, `size` is its extent.
    capsule.scale(1, 0.5, 1);
    const geometries = [new THREE.SphereGeometry(0.5, 14, 10), capsule, new THREE.ConeGeometry(0.5, 1, 10), new THREE.BoxGeometry(1, 1, 1)];
    const capacity = CREATURE_CAP * MAX_SHAPES;
    this.meshes = geometries.map((g) => {
      const m = new THREE.InstancedMesh(g, material, capacity);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, tmpC.setRGB(1, 1, 1));
      scene.add(m);
      return m;
    });
  }

  update(list: readonly Creature[], lightAt: (c: Creature) => number, time = 0, dying: readonly { c: Creature; t: number }[] = []): void {
    this.counts.fill(0);
    const deadAt = new Map(dying.map((d) => [d.c, d.t]));
    for (const c of [...list.slice(0, CREATURE_CAP), ...dying.map((d) => d.c)]) {
      const model = MODELS[c.species.key];
      if (!model || burrowed(c)) continue;
      const b = c.body, h = b.height, speed = Math.hypot(b.vx, b.vz) / Math.max(0.5, c.species.speedM_S / 0.6);
      const t = time + c.id * 1.7, sleeping = c.mode === 'sleep';
      // Attack: 1 just as the bite starts, falling to 0 over 0.4 s.
      // Archers instead raise their arms through the draw before a shot.
      const attack = c.mode !== 'hunt' ? 0 : c.species.ranged ? Math.max(0, Math.min(1, 1 - c.cooldown / ARCHER_AIM_S))
        : Math.max(0, (c.cooldown - (ATTACK_COOLDOWN_S - 0.4)) / 0.4);
      // Grazers lower their heads to eat now and then while standing.
      const graze = c.species.grazer && c.mode === 'idle' ? Math.max(0, Math.min(1, Math.sin(t * 0.35) * 3 - 1)) : 0;
      const pose: Pose = { phase: c.walk, time: t, speed, sleeping, attack, hurt: Math.min(1, c.hurt / 0.3), graze, air: b.onGround ? 0 : 1, plan: model.plan };
      const light = lightAt(c);
      const m = this.stack[0]!;
      let lift = 0, sx = 1, sy = 1, sz = 1;
      if (sleeping && model.plan === 'quad') lift = -model.restDrop;
      else if (model.plan === 'quad' || model.plan === 'biped') lift = speed > 0.1 ? Math.abs(Math.sin(c.walk)) * 0.02 : Math.sin(t * 1.6) * 0.004;
      if (model.hop && speed > 0.1 && !sleeping) lift += Math.abs(Math.sin(c.walk * 0.5)) * 0.25;
      if (model.plan === 'slime') {
        // Squash on the ground, stretch in the air; a slow wobble at rest.
        const v = b.vy, k = b.onGround ? 1 - 0.12 * (0.5 + 0.5 * Math.sin(t * 3)) : Math.min(1.35, 1 + Math.abs(v) * 0.03);
        sy = k;
        sx = sz = 1 / Math.sqrt(k);
      }
      if (sleeping && model.plan === 'quad') sy *= 1 + Math.sin(t * 0.9) * 0.015;
      // A wind-up: it crouches and flashes before the strike lands.
      const winding = (c.windup ?? 0) > 0 || (c.move !== undefined && c.move.t > 0);
      if (winding) {
        sy *= 0.82;
        sx *= 1.1;
        sz *= 1.1;
      }
      const dead = deadAt.get(c);
      if (dead !== undefined) {
        // Defeated: it tips over onto its side, then shrinks away.
        const fade = Math.max(0, (dead - DEATH_S * 0.6) / (DEATH_S * 0.4));
        sx *= 1 - fade;
        sy *= 1 - fade;
        sz *= 1 - fade;
        pose.speed = 0;
        pose.attack = 0;
      }
      m.compose(tmpV.set(b.x, b.y + lift * h, b.z), tmpQ.setFromAxisAngle(UP, c.yaw), tmpS.set(h * sx, h * sy, h * sz));
      if (dead !== undefined && model.plan !== 'slime') {
        const fall = Math.min(1, dead / (DEATH_S * 0.45));
        m.multiply(local.makeRotationAxis(FORWARD, (Math.PI / 2) * fall * fall));
      }
      if (sleeping && model.plan === 'biped') {
        // Lying on one side, the head where the creature stands (a villager's pillow) and the feet behind.
        m.multiply(local.makeTranslation(0.9, 0.13, 0)).multiply(local.makeRotationAxis(FORWARD, Math.PI / 2));
      }
      tmpC.setRGB(light, light, light);
      if (c.hurt > 0) tmpC.lerp(HURT, 0.6);
      else if (winding) tmpC.lerp(FLASH, 0.35 + 0.25 * Math.sin(t * 40));
      if (c.phase === 2) tmpC.lerp(HURT, 0.2);
      this.draw(model.root, 0, pose, tmpC.clone(), light);
    }
    this.meshes.forEach((m, i) => {
      m.count = this.counts[i]!;
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, m.count * 16);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) {
        m.instanceColor.clearUpdateRanges();
        m.instanceColor.addUpdateRange(0, m.count * 3);
        m.instanceColor.needsUpdate = true;
      }
    });
  }

  private draw(j: Joint, depth: number, pose: Pose, tint: THREE.Color, light: number): void {
    animate(j, pose, angles);
    const parent = this.stack[depth]!, world = this.stack[depth + 1]!;
    world.multiplyMatrices(parent, local.compose(tmpV.set(j.at[0], j.at[1], j.at[2]),
      tmpQ.setFromEuler(tmpE.set(j.rot[0] + angles[0]!, j.rot[1] + angles[1]!, j.rot[2] + angles[2]!, 'YXZ')), tmpS.set(1, 1, 1)));
    for (const s of j.shapes) {
      const mesh = this.meshes[s.kind]!, n = this.counts[s.kind]!;
      if (n >= mesh.instanceMatrix.count) continue;
      part.multiplyMatrices(world, local.compose(tmpV.set(s.at[0], s.at[1], s.at[2]), tmpQ.setFromEuler(tmpE.set(s.rot[0], s.rot[1], s.rot[2], 'YXZ')), tmpS.set(s.size[0], s.size[1], s.size[2])));
      mesh.setMatrixAt(n, part);
      const glow = s.glow ? Math.max(0.95, light) / Math.max(0.05, light) : 1;
      mesh.setColorAt(n, tmpC.copy(s.color).multiply(tint).multiplyScalar(glow));
      this.counts[s.kind] = n + 1;
    }
    for (const k of j.kids) this.draw(k, depth + 1, pose, tint, light);
  }
}
