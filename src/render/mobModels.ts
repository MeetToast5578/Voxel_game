/** Voxel rigs in body-width / body-height units, with shared anatomical animation pivots. */
export type SkinPart = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type Point = readonly [number, number, number];
export interface MobPart {
  name: string; x: number; y: number; z: number; w: number; h: number; d: number;
  skin: SkinPart; rx: number; ry: number; rz: number;
  gait?: number; head?: boolean; tint?: readonly [number, number, number];
  pivot?: Point; motion?: 'limb' | 'tail' | 'fin';
  /** Vertical texture interval, bottom to top: feet sample the boot/hoof rather than another whole limb. */
  uv?: readonly [number, number];
  glow?: boolean;
}
export const MAX_MOB_PARTS = 32;
const CREAM = [.94, .87, .71] as const, DARK = [.15, .12, .11] as const;

export function mobRig(key: string): readonly MobPart[] {
  const out: MobPart[] = [];
  const p = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, skin: SkinPart = 0,
    extra: Partial<MobPart> = {}) => out.push({name, x, y, z, w, h, d, skin, rx: 0, ry: 0, rz: 0, ...extra});
  const head = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, skin: SkinPart = 0,
    extra: Partial<MobPart> = {}) => p(name, x, y, z, w, h, d, skin, {head: true, ...extra});
  const horn = (name: string, x: number, y: number, z: number, h: number, extra: Partial<MobPart> = {}) =>
    head(name, x, y, z, .075, h, .09, 6, extra);
  const leg = (name: string, x: number, top: number, z: number, w: number, h: number, d: number, gait: number,
    pawW = w * 1.2, pawD = d * 1.35) => {
    const pivot: Point = [x, top, z], footH = Math.min(.09, h * .24);
    p('leg_' + name, x, (top + footH) / 2, z, w, top - footH, d, 2, {gait, motion: 'limb', pivot, uv: [.25, 1]});
    p('paw_' + name, x, footH / 2, z - (pawD - d) / 2, pawW, footH, pawD, 2, {gait, motion: 'limb', pivot, uv: [0, .25]});
  };
  const upright = ['zombie', 'skulker', 'brute', 'warden', 'swamp_hollow', 'trader'].includes(key);
  if (key === 'fish') {
    p('body', 0, .5, 0, .62, .64, 1.35);
    head('head', 0, .5, -.65, .57, .58, .38, 1);
    p('tail', 0, .5, .95, .07, .66, .58, 2, {gait: 2, motion: 'tail', pivot: [0, .5, .67]});
    p('dorsal_fin', 0, .88, .1, .06, .28, .65, 2);
    for (const side of [-1, 1]) {
      p('fin_' + side, side * .34, .43, -.03, .34, .06, .36, 2, {gait: side, motion: 'fin', pivot: [side * .23, .43, -.03]});
      head('eye_' + side, side * .295, .61, -.66, .025, .12, .12, 3, {tint: [.08, .12, .13]});
    }
  } else if (key === 'crawler' || key === 'desert_stalker') {
    const desert = key === 'desert_stalker';
    p('abdomen', 0, .59, .35, 1, .48, 1.05);
    p('thorax', 0, .48, -.3, .74, .4, .65);
    head('head', 0, .46, -.77, .67, .4, .46, 1);
    for (const side of [-1, 1]) for (let j = 0; j < 4; j++) {
      const z = -.6 + j * .4, gait = (j % 2 ? 1 : -1) * side;
      const pivot: Point = [side * .37, .48, z];
      p('leg_' + side + '_' + j, side * .63, .4, z, .66, .1, .14, 2, {gait, motion: 'limb', pivot, rz: -side * .16, uv: [.25, 1]});
      p('foot_' + side + '_' + j, side * .95, .19, z, .12, .38, .14, 2, {gait, motion: 'limb', pivot, rz: side * .17, uv: [0, .6]});
    }
    horn('left_fang', -.19, .26, -1.01, .2, {rx: -.25});
    horn('right_fang', .19, .26, -1.01, .2, {rx: -.25});
    for (let j = 0; j < 3; j++) p('shell_plate_' + j, 0, .84 + j * .025, .02 + j * .34, .88 - j * .08, .12, .33, 0);
    if (desert) {
      p('tail_root', 0, .77, .97, .24, .21, .4);
      p('tail', 0, 1.01, 1.17, .17, .45, .17, 0, {motion: 'tail', pivot: [0, .77, .97]});
      p('stinger', 0, 1.24, 1.03, .12, .12, .33, 3, {tint: DARK, motion: 'tail', pivot: [0, .77, .97]});
    }
  } else if (upright) {
    const bulky = key === 'brute' || key === 'warden', swamp = key === 'swamp_hollow', trader = key === 'trader';
    const shoulder = bulky ? .81 : .7, armW = bulky ? .4 : swamp ? .2 : .27;
    p('torso', 0, .62, 0, bulky ? 1.23 : 1.04, .34, .59);
    p('waist', 0, .42, 0, bulky ? .85 : .76, .14, .48);
    head('head', 0, .865, -.04, bulky ? .78 : .8, .21, .66, 1);
    for (const side of [-1, 1]) {
      leg(String(side), side * .26, .39, 0, bulky ? .4 : .34, .39, .4, side, bulky ? .47 : .38, .59);
      const pivot: Point = [side * shoulder, .77, 0], gait = -side;
      p('arm_' + side, side * shoulder, .59, key === 'zombie' ? -.21 : 0, armW, .34, .34, 0,
        {gait, motion: 'limb', pivot, rx: key === 'zombie' ? -.65 : 0});
      p('hand_' + side, side * shoulder, .39, key === 'zombie' ? -.42 : -.02, armW * 1.08, .1, .36,
        trader ? 3 : 0, {gait, motion: 'limb', pivot, ...(trader ? {tint: [.73, .47, .29] as const} : {})});
      if (bulky) p('shoulder_' + side, side * .78, .77, 0, .48, .16, .73);
      if (swamp) {
        horn('branch_' + side, side * .36, 1.01, .03, .24, {rz: side * -.45, tint: [.52, .65, .33]});
        p('root_' + side, side * .38, .1, .14, .24, .19, .51, 0);
      }
    }
    if (key === 'warden') {
      p('ember_core', 0, .65, -.31, .34, .17, .035, 3, {tint: [1, .42, .06], glow: true});
      p('core_frame', 0, .65, -.3, .5, .23, .035, 7, {tint: [.6, .4, .23]});
      for (const side of [-1, 1]) horn('crown_' + side, side * .28, 1.02, .02, .2, {tint: [.33, .24, .3], rz: side * -.2});
    }
    if (key === 'brute') for (const side of [-1, 1]) p('ice_spike_' + side, side * .92, .88, .03, .13, .22, .24, 0, {rz: side * -.4});
    if (trader) {
      head('hat_brim', 0, .99, -.01, 1.13, .045, .95, 5);
      head('hat_top', 0, 1.045, .02, .81, .09, .73, 4);
      head('hat_band', 0, 1.015, .02, .84, .025, .76, 5);
      p('backpack', 0, .61, .44, .79, .31, .36, 5);
      p('pack_flap', 0, .75, .49, .83, .07, .41, 5);
      p('pack_buckle', 0, .68, .63, .15, .05, .035, 7);
      p('belt', 0, .46, -.01, 1.07, .055, .62, 5);
      p('buckle', 0, .46, -.33, .18, .055, .04, 7);
    }
    if (key === 'skulker') {
      head('hood', 0, .98, .03, .94, .07, .78);
      p('cloak', 0, .59, .35, 1.15, .56, .08);
      const pivot: Point = [-shoulder, .77, 0];
      for (const [name, y, z, h, d] of [['grip', .47, -.25, .35, .08], ['upper', .68, -.2, .1, .34], ['lower', .26, -.2, .1, .34]] as const) {
        p('bow_' + name, -.79, y, z, .07, h, d, 5, {gait: 1, motion: 'limb', pivot});
      }
      p('bow_string', -.79, .47, -.34, .018, .48, .018, 6, {gait: 1, motion: 'limb', pivot});
    }
    // All head decorations share the neck pivot rather than rotating around their own centres.
    for (const part of out) if (part.head) part.pivot = [0, .76, -.02];
  } else {
    const rabbit = key === 'rabbit', bear = key === 'bear', boar = key === 'boar';
    const canine = ['wolf', 'fox', 'snow_prowler'].includes(key), tall = key === 'deer' || key === 'camel';
    const legH = rabbit ? .25 : bear || boar ? .3 : tall ? .47 : .36;
    const bodyY = legH + (bear ? .22 : .19), len = rabbit ? 1.15 : canine ? 1.9 : bear ? 1.78 : 1.65;
    const headY = rabbit ? .59 : key === 'camel' ? .87 : bear ? .67 : .75;
    const headZ = -len * .56, headW = bear ? .72 : boar ? .68 : rabbit ? .65 : .59;
    p('body', 0, bodyY, 0, bear ? 1.08 : canine ? .82 : 1, bear ? .49 : .38, len);
    p('neck', 0, (bodyY + headY) / 2, -len * .4, key === 'camel' ? .37 : .52, Math.max(.18, headY - bodyY + .1), .48);
    if (bear) p('shoulder_hump', 0, bodyY + .18, -.44, 1.06, .3, .72);
    head('head', 0, headY, headZ, headW, rabbit ? .3 : .25, bear ? .62 : .55, 1);
    head('muzzle', 0, headY - .065, headZ - .32, boar ? .45 : rabbit ? .28 : .38, .13, canine ? .35 : .24);
    if (key !== 'sheep' && key !== 'cow') head('nose', 0, headY - .05, headZ - (canine ? .5 : .45), boar ? .28 : .16, .065, .035, 3, {tint: boar ? [.38, .22, .19] : DARK});
    for (const [side, z, gait] of [[-1, -1, 1], [1, -1, -1], [-1, 1, -1], [1, 1, 1]] as const) {
      const hind = rabbit && z > 0;
      leg(side + '_' + z, side * .32, legH, z * len * .33, bear ? .26 : hind ? .3 : .17, legH, hind ? .34 : .23, rabbit ? z : gait, hind ? .35 : undefined, hind ? .48 : undefined);
      if (hind) p('haunch_' + side, side * .3, .36, .35, .34, .28, .4);
    }
    for (const side of [-1, 1]) {
      head('ear_' + side, side * (bear ? .28 : .25), headY + (rabbit ? .29 : .19), headZ + .04,
        bear ? .22 : rabbit ? .16 : .18, rabbit ? .5 : bear ? .12 : canine ? .24 : .17, .14, 0,
        {rz: side * (rabbit ? .13 : .23)});
      if (rabbit || canine) head('inner_ear_' + side, side * .25, headY + (rabbit ? .29 : .19), headZ - .04,
        .075, rabbit ? .36 : .12, .015, 3, {tint: rabbit ? [.72, .46, .4] : [.35, .24, .23], rz: side * (rabbit ? .13 : .23)});
    }
    if (key === 'deer') for (const side of [-1, 1]) {
      horn('antler_' + side, side * .25, 1.04, headZ + .09, .34, {rz: side * -.2});
      horn('antler_branch_' + side, side * .4, 1.12, headZ + .09, .25, {rz: side * .9});
      horn('antler_tine_' + side, side * .48, 1.21, headZ + .09, .17);
    }
    if (key === 'goat' || key === 'cow') for (const side of [-1, 1]) horn('horn_' + side, side * .32, .98, headZ + .04, key === 'goat' ? .28 : .13, {rx: .35, rz: side * -.35});
    if (key === 'goat') head('beard', 0, headY - .22, headZ - .23, .14, .2, .18, 6);
    if (boar) {
      p('bristle_ridge', 0, bodyY + .22, .04, .21, .13, 1.35, 3, {tint: [.25, .16, .12]});
      for (const side of [-1, 1]) horn('tusk_' + side, side * .23, headY - .04, headZ - .44, .17, {rx: -.3});
    }
    if (key === 'camel') {p('hump', 0, bodyY + .26, .22, .66, .33, .72); head('chin', 0, headY - .16, headZ - .25, .3, .16, .23);}
    if (key === 'sheep') {
      p('fleece', 0, bodyY + .04, .04, 1.13, .44, len * 1.02);
      p('fleece_shoulders', 0, bodyY + .21, -.29, .96, .19, .77);
    }
    if (rabbit) p('tail', 0, .42, len * .58, .28, .21, .25, 6);
    else if (canine) {
      const pivot: Point = [0, bodyY + .04, len * .46];
      p('tail', 0, bodyY + .06, len * .72, key === 'fox' ? .33 : .23, .19, len * .55, 0, {motion: 'tail', pivot});
      p('tail_tip', 0, bodyY + .06, len * 1.04, key === 'fox' ? .32 : .22, .18, len * .2, 3, {motion: 'tail', pivot, tint: key === 'fox' ? CREAM : DARK});
    } else p('tail', 0, bodyY - .08, len * .59, .09, .29, .12, 0, {rx: .2, motion: 'tail', pivot: [0, bodyY + .06, len * .59]});
    if (key === 'snow_prowler') for (const side of [-1, 1]) horn('saber_' + side, side * .2, headY - .18, headZ - .43, .24);
    for (const part of out) if (part.head) part.pivot = [0, headY - .13, headZ + .13];
  }
  const skull = out.find(part => part.name === 'head');
  if (skull && !skull.pivot) {
    const pivot: Point = [skull.x, skull.y - skull.h * .35, skull.z + skull.d * .3];
    for (const part of out) if (part.head) part.pivot = pivot;
  }
  if (out.length > MAX_MOB_PARTS) throw new Error('Mob rig ' + key + ' exceeds its instance budget');
  return out;
}

export interface MobPose {phase: number; time: number; moving: boolean; sleeping: boolean; attacking: boolean}
/** Animate shared joints in width units; aspect converts height units before rotation. */
export function poseMobPart(part: MobPart, pose: MobPose, aspect = 1): {x: number; y: number; z: number; rx: number; ry: number; rz: number} {
  let {x, y, z, rx, ry, rz} = part;
  let ax = 0, ay = 0, az = 0;
  if (part.motion === 'tail') ay = pose.sleeping ? .3 : Math.sin(pose.phase + pose.time * (pose.moving ? 0 : 1.5)) * (pose.moving ? .34 : .08);
  else if (part.motion === 'fin') az = Math.sin(pose.phase + (part.gait! < 0 ? Math.PI : 0)) * .3;
  else if (part.gait) {
    ax = Math.sin(pose.phase + (part.gait < 0 ? Math.PI : 0)) * (pose.moving ? .5 : 0);
    if (pose.attacking && (part.name.startsWith('arm_') || part.name.startsWith('hand_') || part.name.startsWith('bow_'))) ax -= .75;
  }
  if (part.head) {ax += pose.sleeping ? -.18 : Math.sin(pose.time * 1.1) * .035; ay += pose.sleeping ? 0 : Math.sin(pose.time * .65) * .06; if (pose.attacking) ax -= .18;}
  if (pose.sleeping && part.motion === 'limb') {ax = part.pivot && part.pivot[2] < -.1 ? -1.15 : 1.15; az = part.x < 0 ? -.25 : .25;}
  if (part.pivot) {
    const [px, py, pz] = part.pivot;
    let dx = x - px, dy = (y - py) * aspect, dz = z - pz;
    const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
    [dy, dz] = [dy * cx - dz * sx, dy * sx + dz * cx];
    [dx, dz] = [dx * cy + dz * sy, -dx * sy + dz * cy];
    [dx, dy] = [dx * cz - dy * sz, dx * sz + dy * cz];
    x = px + dx; y = py + dy / aspect; z = pz + dz;
  }
  rx += ax; ry += ay; rz += az;
  if (!pose.sleeping && !pose.moving && !part.gait && !part.head) y += Math.sin(pose.time * 1.8) * .002;
  return {x, y, z, rx, ry, rz};
}
