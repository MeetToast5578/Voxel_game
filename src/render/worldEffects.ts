import * as THREE from 'three';
import art from './effectArt.json';
import { decodeArtTile, type PackedArtTile } from './artCodec';
import { WORLD_FOG_FRAGMENT, worldFogUniforms, type WorldFogUniforms } from './worldFog';
export const EFFECT_KINDS=['fire','smoke','sparks','splash','lightning','impact'] as const;
export type EffectKind=typeof EFFECT_KINDS[number];
interface Effect {kind:EffectKind;x:number;y:number;z:number;age:number;life:number;size:number}
const CAP=128;
/** Bounded, camera-facing animated effects; one instanced draw for all six sprite sequences. */
export class WorldEffects {
  private readonly list:Effect[]=[];
  private readonly geometry:THREE.InstancedBufferGeometry;
  private readonly center=new THREE.InstancedBufferAttribute(new Float32Array(CAP*3),3);
  private readonly info=new THREE.InstancedBufferAttribute(new Float32Array(CAP*4),4);
  constructor(scene:THREE.Scene,fog?:WorldFogUniforms){
    const source:Record<string,PackedArtTile>=art,data=new Uint8Array(32*32*4*48);
    EFFECT_KINDS.forEach((kind,k)=>{for(let f=0;f<8;f++){
      const p=decodeArtTile(source[`${kind}_${f}`]!);
      for(let y=0;y<32;y++)data.set(p.subarray(y*128,(y+1)*128),((k*8+f)*1024+(31-y)*32)*4);
    }});
    const texture=new THREE.DataArrayTexture(data,32,32,48);texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.needsUpdate=true;
    this.geometry=new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute('position',new THREE.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));
    this.geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,1,1,0,1],2));this.geometry.setIndex([0,1,2,0,2,3]);
    this.geometry.setAttribute('center',this.center);this.geometry.setAttribute('info',this.info);this.geometry.instanceCount=0;
    this.center.setUsage(THREE.DynamicDrawUsage);this.info.setUsage(THREE.DynamicDrawUsage);
    const material=new THREE.ShaderMaterial({glslVersion:THREE.GLSL3,transparent:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{sprites:{value:texture},...worldFogUniforms(fog)},vertexShader:`
      in vec3 center;in vec4 info;out vec2 vUv;flat out float vFrame;out float vAlpha;out float vFogDepth;
      void main(){vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);
      vec3 up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
      vec3 p=center+right*position.x*info.y+up*position.y*info.z;
      vUv=uv;vFrame=info.x;vAlpha=info.w;vFogDepth=length(p.xz-cameraPosition.xz);gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);}`,
      fragmentShader:WORLD_FOG_FRAGMENT+`uniform highp sampler2DArray sprites;in vec2 vUv;flat in float vFrame;in float vAlpha;in float vFogDepth;out vec4 outColor;
      void main(){vec4 c=texture(sprites,vec3(vUv,vFrame));if(c.a<.1)discard;outColor=vec4(applyWorldFog(c.rgb,vFogDepth),c.a*vAlpha);}`});
    const mesh=new THREE.Mesh(this.geometry,material);mesh.frustumCulled=false;mesh.renderOrder=4;scene.add(mesh);
  }
  burst(kind:EffectKind,x:number,y:number,z:number,size=1):void {
    if(this.list.length>=CAP)this.list.shift();
    this.list.push({kind,x,y,z,size,age:0,life:kind==='lightning'?.55:kind==='smoke'?1.4:.65});
  }
  update(dt:number,time:number,emitters:readonly {kind:EffectKind;x:number;y:number;z:number;size:number}[]):void {
    for(let i=this.list.length-1;i>=0;i--){const e=this.list[i]!;e.age+=dt;if(e.age>=e.life)this.list.splice(i,1);}
    let n=0;
    const put=(kind:EffectKind,x:number,y:number,z:number,size:number,frame:number,alpha:number)=>{
      if(n>=CAP)return;
      this.center.setXYZ(n,x,y,z);this.info.setXYZW(n,EFFECT_KINDS.indexOf(kind)*8+frame,size,kind==='lightning'?size*5:size,alpha);n++;
    };
    for(const e of this.list)put(e.kind,e.x,e.y+(e.kind==='smoke'?e.age*.7:0),e.z,e.size,Math.min(7,Math.floor(e.age/e.life*8)),Math.min(1,(e.life-e.age)*5));
    for(const e of emitters.slice(0,CAP-n))put(e.kind,e.x,e.y,e.z,e.size,Math.floor(time*(e.kind==='smoke'?5:10))%8,.9);
    this.geometry.instanceCount=n;this.center.needsUpdate=this.info.needsUpdate=true;
  }
}
