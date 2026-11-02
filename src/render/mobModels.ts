/** Pure voxel rigs. Coordinates are fractions of body width (x/z) and height (y). */
export type SkinPart = 0 | 1 | 2 | 3;
export interface MobPart {
  name: string; x: number; y: number; z: number; w: number; h: number; d: number;
  skin: SkinPart; rx: number; ry: number; rz: number;
  gait?: number; head?: boolean; tint?: readonly [number, number, number];
}
export const MAX_MOB_PARTS = 32;
const CREAM = [0.94, 0.84, 0.65] as const, DARK = [0.18, 0.14, 0.12] as const;

export function mobRig(key: string): readonly MobPart[] {
  const out: MobPart[] = [];
  const p = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, skin: SkinPart = 0,
    extra: Partial<MobPart> = {}) => out.push({ name, x, y, z, w, h, d, skin, rx: 0, ry: 0, rz: 0, ...extra });
  const horn = (name: string, x: number, y: number, z: number, h: number, extra: Partial<MobPart> = {}) =>
    p(name, x, y, z, .07, h, .09, 3, { tint: CREAM, head: true, ...extra });
  const upright = ['zombie','skulker','brute','warden','swamp_hollow','trader'].includes(key);
  if (key === 'fish') {
    p('body', 0,.5,0,.62,.7,1.55); p('head',0,.5,-.7,.59,.62,.45,1,{head:true});
    p('tail',0,.5,1.05,.09,.66,.62,0,{gait:2});
    p('dorsal_fin',0,.9,.05,.05,.28,.65); p('left_fin',-.4,.4,-.05,.38,.09,.45,0,{rz:-.25});
    p('right_fin',.4,.4,-.05,.38,.09,.45,0,{rz:.25});
  } else if (key === 'crawler' || key === 'desert_stalker') {
    p('abdomen',0,.62,.35,.95,.55,1.15); p('thorax',0,.5,-.3,.7,.45,.65);
    p('head',0,.48,-.8,.62,.4,.5,1,{head:true});
    for (let side=-1;side<=1;side+=2) for(let j=0;j<4;j++) {
      const z=-.6+j*.43;
      p(`leg_${side}_${j}`,side*.63,.44,z,.75,.11,.14,2,{rz:0,gait:(j%2?1:-1)*side});
      p(`foot_${side}_${j}`,side*.97,.2,z,.13,.48,.16,2,{rz:side*-.15,gait:(j%2?1:-1)*side});
    }
    horn('left_fang',-.19,.28,-1.02,.2); horn('right_fang',.19,.28,-1.02,.2);
    if(key==='desert_stalker') for(let j=0;j<3;j++)p(`shell_plate_${j}`,0,.91,.12+j*.34,.8,.13,.27);
  } else if (upright) {
    const bulky=key==='brute'||key==='warden', swamp=key==='swamp_hollow';
    p('torso',0,.62,0,bulky?1.05:.8,.39,.53);
    p('waist',0,.4,0,.62,.16,.4);
    p('head',0,.87,-.04,bulky?.65:.57,.24,.55,1,{head:true});
    for(let side=-1;side<=1;side+=2){
      p(`leg_${side}`,side*.23,.2,0,.33,.4,.37,2,{gait:side});
      p(`foot_${side}`,side*.23,.04,-.1,.38,.08,.6,2,{gait:side});
      p(`arm_${side}`,side*(bulky?.7:.55),.57,-.02,bulky?.35:.22,.38,.3,0,{gait:-side,rx:key==='zombie'?-1.0:0});
      p(`hand_${side}`,side*(bulky?.7:.55),.35,-.05,.29,.12,.32,0,{gait:-side});
      if(bulky)p(`shoulder_${side}`,side*.65,.79,0,.45,.14,.65);
      if(swamp)horn(`branch_${side}`,side*.32,1.02,.02,.22,{rz:side*-.5});
    }
    if(key==='warden'){
      p('ember_core',0,.65,-.285,.26,.15,.035,3,{tint:[1,.46,.08]});
      for(let side=-1;side<=1;side+=2)horn(`crown_${side}`,side*.24,1.03,.02,.18,{tint:[.4,.25,.32],rz:side*-.2});
    }
    if(key==='trader'){p('hat_brim',0,1.0,0,.9,.045,.85);p('hat_top',0,1.06,0,.62,.09,.6);p('backpack',0,.6,.4,.65,.4,.3);}
    if(key==='skulker'){
      p('hood',0,.99,.03,.67,.08,.66);p('cloak',0,.59,.29,.85,.55,.09);
      p('bow_grip',-.72,.52,-.25,.06,.4,.08,3,{tint:[.45,.28,.12]});
      p('bow_upper',-.7,.74,-.2,.07,.1,.32,3,{tint:[.45,.28,.12]});
      p('bow_lower',-.7,.3,-.2,.07,.1,.32,3,{tint:[.45,.28,.12]});
    }
  } else {
    const short=key==='rabbit', long=key==='wolf'||key==='fox'||key==='snow_prowler';
    const legH=short?.25:key==='deer'||key==='camel'?.46:.37;
    const bodyY=legH+.19, headY=short?.59:key==='camel'?.86:.76;
    const len=short?1.22:long?1.95:1.65;
    p('body',0,bodyY,0,1,.38,len);
    p('neck',0,(bodyY+headY)/2,-len*.42,.5,Math.max(.15,headY-bodyY+.05),.48);
    p('head',0,headY,-len*.57,.58,short?.28:.25,.55,1,{head:true});
    p('muzzle',0,headY-.065,-len*.57-.32,short?.28:.4,.13,.23,0,{head:true});
    for(const [side,z,gait] of [[-1,-1,1],[1,-1,-1],[-1,1,-1],[1,1,1]]) {
      p(`leg_${side}_${z}`,side!*.33,legH/2,z!*len*.34,short?.25:.18,legH,.22,2,{gait:gait!});
      p(`paw_${side}_${z}`,side!*.33,.045,z!*len*.34-.055,short?.32:.23,.09,short?.4:.31,2,{gait:gait!});
    }
    for(let side=-1;side<=1;side+=2){
      p(`ear_${side}`,side*.25,headY+.2,-len*.55,short?.15:.16,short?.42:.16,.13,0,{head:true,rz:side*(short?.13:.22)});
    }
    if(key==='deer')for(let side=-1;side<=1;side+=2){
      horn(`antler_${side}`,side*.24,1.02,-len*.52,.28,{rz:side*-.2});
      horn(`antler_tine_${side}`,side*.39,1.09,-len*.52,.13,{rz:side*.6});
    }
    if(key==='goat'||key==='cow')for(let side=-1;side<=1;side+=2)horn(`horn_${side}`,side*.32,.98,-len*.52,key==='goat'?.26:.13,{rx:.3,rz:side*-.35});
    if(key==='boar')for(let side=-1;side<=1;side+=2)horn(`tusk_${side}`,side*.23,headY-.03,-len*.57-.4,.16,{rx:-.3});
    if(key==='camel'){p('hump',0,bodyY+.3,.22,.65,.28,.65);p('chin',0,headY-.14,-len*.57-.2,.28,.13,.15);}
    if(key==='sheep')p('fleece',0,bodyY+.04,.04,1.12,.43,len*1.02);
    if(key==='rabbit')p('tail',0,.43,len*.58,.26,.2,.23,3,{tint:CREAM});
    else if(long){
      p('tail',0,bodyY+.04,len*.68,.25,.18,len*.53,0,{gait:2});
      p('tail_tip',0,bodyY+.04,len*.94,.24,.18,len*.19,3,{gait:2,tint:key==='fox'?CREAM:DARK});
    } else p('tail',0,bodyY-.08,len*.63,.1,.3,.12,0,{rx:.2});
    if(key==='snow_prowler')for(let side=-1;side<=1;side+=2)horn(`saber_${side}`,side*.2,headY-.17,-len*.57-.38,.23);
  }
  if(out.length>MAX_MOB_PARTS)throw new Error(`Mob rig ${key} exceeds its instance budget`);
  return out;
}

export interface MobPose { phase: number; time: number; moving: boolean; sleeping: boolean; attacking: boolean }
/** Pose a part around a limb pivot. Returns local offsets/rotations, before yaw and world translation. */
export function poseMobPart(part: MobPart, pose: MobPose): { x: number; y: number; z: number; rx: number; ry: number; rz: number } {
  let {x,y,z,rx,ry,rz}=part;
  if(part.gait){
    const a=Math.sin(pose.phase+(part.gait<0?Math.PI:0))*(pose.moving?.55:0);
    if(Math.abs(part.gait)===2)ry+=Math.sin(pose.phase)*.3;
    else {rx+=pose.sleeping?1.15:a;z+=Math.sin(a)*.09;}
  }
  if(part.head){rx+=pose.sleeping?.2:Math.sin(pose.time*1.1)*.035; if(pose.attacking){rx-=.22;z-=.12;}}
  if(pose.sleeping){y=Math.max(.045,y*.58);if(part.gait)rz+=part.x<0?-.65:.65;}
  else if(!pose.moving)y+=Math.sin(pose.time*1.8)*.003;
  return {x,y,z,rx,ry,rz};
}
