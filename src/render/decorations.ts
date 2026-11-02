import * as THREE from 'three';
import { BLOCKS } from '../engine/blocks';
import type { World } from '../engine/world';
import type { Decorations } from '../game/workshops';
import type { ItemStack } from '../game/inventory';
import { stackIconUrl } from '../ui/icons';

const NORMALS=[[1,0],[-1,0],[0,1],[0,-1]] as const;
interface Drawn {mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;stamp:string}
/** Loaded sign text and framed items; textures are rebuilt only when their contents change. */
export class DecorationMeshes {
  private readonly drawn=new Map<string,Drawn>();
  private readonly geometry=new THREE.PlaneGeometry(.7,.7);
  constructor(private readonly scene:THREE.Scene){}
  update(data:Decorations,world:World,camera:THREE.Camera,lightAt:(x:number,y:number,z:number)=>number):void {
    const keep=new Set<string>();
    const visit=(key:string,text:string|undefined,item:ItemStack|undefined)=>{
      const [x,y,z]=key.split(',').map(Number);if(!world.isLoaded(x!,y!,z!))return;
      if(Math.hypot(x!-camera.position.x,y!-camera.position.y,z!-camera.position.z)>64)return;
      const state=world.get(x!,y!,z!),type=BLOCKS.type(state);
      if(type.key!==(text===undefined?'item_frame':'sign'))return;
      keep.add(key);const stamp=`${state}:${text??(item?.state+':'+item?.upgrade)}`;let draw=this.drawn.get(key);
      if(!draw||draw.stamp!==stamp){
        if(draw){this.scene.remove(draw.mesh);draw.mesh.material.map?.dispose();draw.mesh.material.dispose();}
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=192;
        const ctx=canvas.getContext('2d')!;
        if(text!==undefined){
          ctx.fillStyle='#201c16';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 23px sans-serif';
          text.split('\n').slice(0,4).forEach((line,i)=>ctx.fillText(line,128,40+i*36,238));
        }
        const texture=new THREE.CanvasTexture(canvas);texture.magFilter=texture.minFilter=THREE.NearestFilter;
        if(item!==undefined){const img=new Image();img.onload=()=>{ctx.imageSmoothingEnabled=false;ctx.drawImage(img,32,0,192,192);texture.needsUpdate=true;};img.src=stackIconUrl(item);}
        const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide});
        const mesh=new THREE.Mesh(this.geometry,material);draw={mesh,stamp};this.drawn.set(key,draw);this.scene.add(mesh);
      }
      const [nx,nz]=NORMALS[BLOCKS.variant(state)]!;
      draw.mesh.position.set(x!+.5+nx!*(-.36),y!+.5,z!+.5+nz!*(-.36));
      draw.mesh.rotation.y=Math.atan2(nx!,nz!);draw.mesh.scale.set(1,text===undefined?1:.7,1);
      draw.mesh.material.color.setScalar(lightAt(x!+.5,y!+.5,z!+.5));
    };
    data.signs.forEach((text,key)=>visit(key,text,undefined));data.frames.forEach((item,key)=>visit(key,undefined,item));
    for(const [key,draw] of this.drawn)if(!keep.has(key)){this.scene.remove(draw.mesh);draw.mesh.material.map?.dispose();draw.mesh.material.dispose();this.drawn.delete(key);}
  }
}
