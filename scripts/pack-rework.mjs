// Mechanical export only: alpha-isolated source cells, explicit measured rectangles, UV fitting and packing.
import {chromium} from 'playwright';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const root = 'assets/woodland-ember/rework';
const layouts = JSON.parse(readFileSync(root + '/source-layouts.json', 'utf8'));
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage']});
try {
  const page = await browser.newPage();
  const exportInBrowser = async ({layouts,seed=[],finalize=true}) => {
    const size = 32, tiles = [...seed], crops = [];
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', {willReadFrequently:true}); ctx.imageSmoothingEnabled = false;
    const varied = new Set(['snow','slate','basalt','deepslate','planks']);
    const cutouts = new Set(['glass','ladder','torch','lantern','beacon_side','campfire_side','moss','leaf_litter','lily_pad','frame_empty']);
    function emit(name, p, meta) {
      const rgba = new Uint8ClampedArray(p);
      for (let i=0;i<rgba.length;i+=4) {
        const a = meta.alpha==='opaque' || rgba[i+3]>=160 ? 255 : 0;
        for(let c=0;c<3;c++) rgba[i+c] = a ? rgba[i+c]&248 : 0;
        rgba[i+3] = a;
      }
      for(const axis of meta.repeatAxes) for(let t=0;t<size;t++) {
        const a=axis==='x'?t*128:t*4, b=axis==='x'?t*128+124:3968+t*4;
        for(let c=0;c<4;c++) rgba[a+c]=rgba[b+c]=c===3?(rgba[a+3]&&rgba[b+3]?255:0):((rgba[a+c]+rgba[b+c])>>1)&248;
        if(!rgba[a+3])for(let c=0;c<3;c++)rgba[a+c]=rgba[b+c]=0;
      }
      ctx.putImageData(new ImageData(rgba,32,32),0,0);
      tiles.push({...meta,name,rgba:Array.from(rgba),png:canvas.toDataURL().split(',')[1]});
      return rgba;
    }
    for(const source of layouts) {
      const img=new Image();img.src='data:image/png;base64,'+source.data;await img.decode();
      const src=document.createElement('canvas');src.width=img.width;src.height=img.height;
      const sc=src.getContext('2d',{willReadFrequently:true});sc.drawImage(img,0,0);
      const raw=sc.getImageData(0,0,img.width,img.height).data;
      for(let cell=0;cell<source.names.length;cell++) {
        if(source.skip?.includes(cell))continue;
        const name=source.names[cell],cw=img.width/source.cols,ch=img.height/source.rows;
        const left=Math.floor(cell%source.cols*cw),top=Math.floor(Math.floor(cell/source.cols)*ch);
        const right=Math.floor((cell%source.cols+1)*cw),bottom=Math.floor((Math.floor(cell/source.cols)+1)*ch);
        let x0=right,y0=bottom,x1=left,y1=top,count=0;
        for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(raw[(y*img.width+x)*4+3]>=200){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);count++;}
        if(!count)throw Error('Empty source cell '+name);
        const rect=[x0,y0,x1-x0+1,y1-y0+1],sheet=source.names.length>1;
        if(sheet && (x0-left<3||y0-top<3||right-x1<3||bottom-y1<3))throw Error('Missing transparent separation around '+name+' '+JSON.stringify(rect));
        const icon=source.kind==='equipment'||source.kind==='animation'||source.kind==='crop'||source.kind==='plant'&&!['moss','leaf_litter'].includes(name)||['torch','lantern','ladder'].includes(name);
        const alpha=icon||cutouts.has(name)||name.endsWith('_leaves')?'cutout':'opaque';
        if(!icon&&name!=='campfire_side'&&sheet&&Math.abs(rect[2]/rect[3]-1)>.18)throw Error('Non-square texture face '+name+' '+JSON.stringify(rect));
        const repeatAxes=source.kind==='terrain'||source.kind==='fluid'||name.endsWith('_bark')||name.endsWith('_planks')||name.endsWith('_leaves')||['saguaro_top','saguaro_side','moss','leaf_litter'].includes(name)?['x','y']:[];
        ctx.clearRect(0,0,32,32);
        if(alpha==='opaque'){
          const p=(Math.floor((y0+y1)/2)*img.width+Math.floor((x0+x1)/2))*4;
          ctx.fillStyle=`rgb(${raw[p]},${raw[p+1]},${raw[p+2]})`;ctx.fillRect(0,0,32,32);
        }
        let destination=[0,0,32,32];
        if(icon){
          // Crop stages share a source pixel scale. Do not enlarge tiny sprouts to the mature plant's height.
          const extent=source.kind==='crop'?Math.min(cw,ch)*.8:Math.max(rect[2],rect[3]);
          const scale=28/extent,w=Math.min(28,Math.max(1,Math.round(rect[2]*scale))),h=Math.min(28,Math.max(1,Math.round(rect[3]*scale)));
          const grounded=source.kind==='crop'||source.kind==='plant'&&name!=='lily_pad';
          destination=[Math.floor((32-w)/2),grounded?32-h:Math.floor((32-h)/2),w,h];
        }
        if(name==='campfire_side')destination=[0,20,32,12];
        ctx.drawImage(img,...rect,...destination);
        const iconPixels=name==='torch'||name==='lantern'?ctx.getImageData(0,0,32,32).data:null;
        const iconDestination=[...destination];
        // Existing thin-box world-unit UV contracts. Keep full sprites in the source sheet.
        if(name==='torch'||name==='lantern'){
          ctx.clearRect(0,0,32,32);destination=name==='torch'?[0,12,32,20]:[10,16,12,16];ctx.drawImage(img,...rect,...destination);
        }
        const meta={source:source.file,cell,sourceRect:rect,sourceDimensions:[img.width,img.height],destination,alpha,repeatAxes,category:source.kind,derivedFrom:null};
        const base=emit(name,ctx.getImageData(0,0,32,32).data,meta);
        if(iconPixels)emit(name+'_item',iconPixels,{...meta,derivedFrom:name,category:'equipment',destination:iconDestination});
        crops.push({name,...meta});
        if(varied.has(name))variants(name,base,meta);
      }
    }
    function variants(name,base,meta){
      for(let v=0;v<4;v++){
        const p=new Uint8ClampedArray(4096);
        for(let y=0;y<32;y++)for(let x=0;x<32;x++){
          const border=x===0||x===31||y===0||y===31;
          const at=(border?y*32+x:((y+v*8)%32)*32+(x+v*8)%32)*4;
          p.set(base.subarray(at,at+4),(y*32+x)*4);
        }
        emit(name+'_alt_'+v,p,{...meta,derivedFrom:name,variant:v});
      }
    }
    if(!finalize)return {tiles,crops,sequences:[]};
    for(const [name,parent]of [['planks','oak_planks'],['log_top','oak_end'],['log_side','oak_bark'],['leaves','oak_leaves'],['sapling','oak_sapling']]){
      const t=tiles.find(t=>t.name===parent);if(!t)continue;
      const p=emit(name,t.rgba,{...t,derivedFrom:parent,name:undefined,rgba:undefined,png:undefined});
      const made=tiles.at(-1);
      if(varied.has(name))variants(name,p,{...made,rgba:undefined,png:undefined,name:undefined});
    }
    // Authored flame frames are composited into fixed openings. Surrounding machinery never flickers.
    const flames=tiles.filter(t=>/^station_flame_\d$/.test(t.name));
    const door=tiles.find(t=>t.name==='door');
    const head=tiles.find(t=>t.name==='bed_head');
    if(head)for(let facing=0;facing<4;facing++){
      const image=document.createElement('canvas');image.width=image.height=32;image.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(head.rgba),32,32),0,0);
      ctx.clearRect(0,0,32,32);ctx.save();ctx.translate(16,16);ctx.rotate([Math.PI/2,-Math.PI/2,0,Math.PI][facing]);ctx.drawImage(image,-16,-16);ctx.restore();
      emit('bed_head_'+facing,ctx.getImageData(0,0,32,32).data,{...head,derivedFrom:'bed_head',facing,repeatAxes:[]});
    }
    if(door)for(let part=0;part<4;part++){
      const pixels=new Uint8ClampedArray(4096);
      for(let y=0;y<32;y++)for(let x=0;x<32;x++){
        const at=((3-part)*8+Math.floor(y/4))*128+x*4;
        pixels.set(door.rgba.slice(at,at+4),(y*32+x)*4);
      }
      emit('door_segment_'+part,pixels,{...door,derivedFrom:'door',segment:part,repeatAxes:[]});
    }
    const sequences=[];
    for(const name of ['water','lava']){
      const base=tiles.find(t=>t.name===name);if(!base)continue;
      const phases=name==='water'?[0,1,2,3,4,3,2,1]:[0,1,1,2,2,2,1,1],frames=[];
      for(let f=0;f<8;f++){
        const p=new Uint8ClampedArray(4096);
        for(let y=0;y<32;y++)for(let x=0;x<32;x++){
          // The edge is canonical; a complete cycle returns smoothly to the original pattern.
          const edge=x===0||x===31||y===0||y===31;
          const at=(edge?y*32+x:((y+phases[f])%32)*32+(x+phases[f])%32)*4;
          p.set(base.rgba.slice(at,at+4),(y*32+x)*4);
        }
        const frame=name+'_'+f;frames.push(frame);emit(frame,p,{...base,derivedFrom:name,category:'fluid-animation',frame:f});
      }
      sequences.push({tile:name,frames,fps:4,loop:true,opening:null});
    }
    for(const [name,baseName,rect,fps]of [
      ['furnace_front_lit','furnace_front',[8,19,16,9],8],
      ['forge_front','forge_front',[9,18,14,10],6],
      ['torch','torch',[12,12,8,7],8],
      ['lantern','lantern',[14,22,5,6],6]
    ]){
      const base=tiles.find(t=>t.name===baseName);if(!base||flames.length!==8)continue;
      const frameNames=[];
      for(let f=0;f<8;f++){
        ctx.putImageData(new ImageData(new Uint8ClampedArray(base.rgba),32,32),0,0);
        const flame=document.createElement('canvas');flame.width=flame.height=32;flame.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(flames[f].rgba),32,32),0,0);
        ctx.drawImage(flame,2,2,28,28,...rect);
        const frameName=name+'_'+f;frameNames.push(frameName);
        emit(frameName,ctx.getImageData(0,0,32,32).data,{...base,name:undefined,rgba:undefined,png:undefined,derivedFrom:baseName,category:'machine-animation',animation:name,frame:f,opening:rect,repeatAxes:[]});
      }
      sequences.push({tile:name,frames:frameNames,fps,loop:true,opening:rect});
    }
    // Authoring flame cells are intermediate overlays, not texture-array layers.
    return {tiles:tiles.filter(t=>!/^station_flame_/.test(t.name)),crops,sequences};
  };
  const exported=[],measured=[];
  // Bound decoded-image memory and transport size; source atlases are never all loaded at once.
  for(let offset=0;offset<layouts.length;offset+=4){
    const batch=await page.evaluate(exportInBrowser,{layouts:layouts.slice(offset,offset+4).map(e=>({...e,data:readFileSync(root+'/'+e.file).toString('base64')})),finalize:false});
    exported.push(...batch.tiles);measured.push(...batch.crops);
    await page.goto('about:blank');
  }
  const result=await page.evaluate(exportInBrowser,{layouts:[],seed:exported,finalize:true});result.crops=measured;
  const packed={},index=[];mkdirSync(root+'/tiles',{recursive:true});
  for(const tile of result.tiles){
    if(packed[tile.name])throw Error('Duplicate output '+tile.name);
    const palette=[],ids=[],map=new Map();
    for(let i=0;i<tile.rgba.length;i+=4){const rgba=tile.rgba.slice(i,i+4),key=rgba.join(',');if(!map.has(key)){map.set(key,palette.length/4);palette.push(...rgba);}ids.push(map.get(key));}
    const bytes=Buffer.alloc(ids.length*2);ids.forEach((id,i)=>bytes.writeUInt16LE(id,i*2));packed[tile.name]={palette,indices:bytes.toString('base64')};
    const file='tiles/'+tile.name+'.png';writeFileSync(root+'/'+file,Buffer.from(tile.png,'base64'));
    const {rgba,png,...meta}=tile;index.push({...meta,file,width:32,height:32,pixelSha256:createHash('sha256').update(Buffer.from(rgba)).digest('hex')});
  }
  writeFileSync(root+'/manifest.json',JSON.stringify({schema:1,tileSize:32,sources:layouts.map(({data,...e})=>e),crops:result.crops,animations:result.sequences},null,2)+'\n');
  writeFileSync(root+'/texture-index.json',JSON.stringify(index,null,2)+'\n');
  writeFileSync(root+'/textures.json',JSON.stringify(packed));writeFileSync('src/render/reworkArt.json',JSON.stringify(packed));
  writeFileSync('src/render/reworkNames.ts','// Generated by pack-rework.mjs; names only, no artwork in workers.\nexport const REWORK_ANIMATIONS = '+JSON.stringify(result.sequences.map(({tile,frames,fps})=>({tile,frames,fps})))+' as const;\nexport const REWORK_TILE_NAMES: readonly string[] = [...REWORK_ANIMATIONS.flatMap(a=>[...a.frames]),"harvested_wheat","harvested_carrot","harvested_potato","frame_backing","torch_item","lantern_item","bed_head",...Array.from({length:4},(_,i)=>"door_segment_"+i)];\n');
  console.log(`Packed ${layouts.length} source images into ${index.length} separate named 32x32 files; ${result.sequences.length} active animation sequences.`);
} finally {await browser.close();}
