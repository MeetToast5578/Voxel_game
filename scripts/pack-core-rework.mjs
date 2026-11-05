// Every source contains ONE texture. Grass top and upright sides are separate all-green materials.
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='assets/woodland-ember/core-rework',manifest=JSON.parse(readFileSync(root+'/manifest.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 const result=await page.evaluate(async({manifest,sources})=>{
  const size=manifest.tileSize,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
  const tiles=[];
  for(const entry of manifest.entries){
   const img=new Image();img.src='data:image/png;base64,'+sources[entry.name];await img.decode();
   if(img.width!==img.height)throw Error(entry.name+' source must be square');
   ctx.clearRect(0,0,size,size);ctx.drawImage(img,0,0,img.width,img.height,0,0,size,size);
   const data=ctx.getImageData(0,0,size,size),base=data.data;
   for(let i=0;i<base.length;i+=4){base[i]&=248;base[i+1]&=248;base[i+2]&=248;base[i+3]=255;}
   // Normalize only declared repeating axes.
   for(const axis of entry.repeatAxes)for(let t=0;t<size;t++){
    const a=axis==='x'?t*size*4:t*4,b=axis==='x'?(t*size+size-1)*4:((size-1)*size+t)*4;
    for(let c=0;c<3;c++)base[a+c]=base[b+c]=((base[a+c]+base[b+c])>>1)&248;
   }
   const exportTile=(name,pixels,variant)=>{
    const palette=[],indices=[],map=new Map();
    for(let i=0;i<pixels.length;i+=4){const rgba=Array.from(pixels.subarray(i,i+4)),key=rgba.join(',');if(!map.has(key)){map.set(key,palette.length/4);palette.push(...rgba);}indices.push(map.get(key));}
    ctx.putImageData(new ImageData(pixels,size,size),0,0);
    tiles.push({name,palette,indices,png:canvas.toDataURL().split(',')[1],rgba:Array.from(pixels),source:entry.source,variant,repeatAxes:entry.repeatAxes});
   };
   exportTile(entry.name,new Uint8ClampedArray(base),null);
   entry.variations.forEach((name,v)=>{
    const pixels=new Uint8ClampedArray(base.length),dx=v*8,dy=entry.repeatAxes.includes('y')?v*8:0;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
     const border=x===0||x===size-1||entry.repeatAxes.includes('y')&&(y===0||y===size-1);
     const source=(border?y*size+x:((y+dy)%size)*size+(x+dx)%size)*4;
     pixels.set(base.subarray(source,source+4),(y*size+x)*4);
    }
    exportTile(name,pixels,v);
   });
  }
  // Inspection sheet: actual exported pixels and mixed-variant tiled swatches, never a packing input.
  const preview=document.createElement('canvas');preview.width=1100;preview.height=650;
  const pc=preview.getContext('2d');pc.fillStyle='#102b33';pc.fillRect(0,0,1100,650);pc.fillStyle='#eee4c9';pc.font='bold 25px sans-serif';pc.fillText('WOODLAND & EMBER · CORE REWORK',24,36);pc.font='14px sans-serif';pc.fillText('Separate 32×32 files · base tile / mixed-variant repeat check',24,62);pc.imageSmoothingEnabled=false;
  manifest.entries.forEach((entry,i)=>{
   const x=24+(i%4)*270,y=90+Math.floor(i/4)*275;
   const draw=(name,x,y,w)=>{const t=tiles.find(t=>t.name===name);ctx.putImageData(new ImageData(new Uint8ClampedArray(t.rgba),size,size),0,0);pc.drawImage(canvas,x,y,w,w);};
   draw(entry.name,x,y,96);
   for(let row=0;row<3;row++)for(let col=0;col<3;col++)draw(entry.variations[(row+col)%4]||entry.name,x+106+col*40,y+row*40,40);
   pc.fillStyle='#eee4c9';pc.font='bold 14px sans-serif';pc.fillText(entry.name,x,y+145);pc.font='12px sans-serif';pc.fillText('Repeat: '+entry.repeatAxes.join('/')+' · upright',x,y+166);
  });
  return{tiles,preview:preview.toDataURL().split(',')[1]};
 },{manifest,sources:Object.fromEntries(manifest.entries.map(e=>[e.name,readFileSync(root+'/'+e.source).toString('base64')]))});
 const packed={},index=[];mkdirSync(root+'/tiles',{recursive:true});
 for(const t of result.tiles){
  if(packed[t.name])throw Error('Duplicate texture '+t.name);
  const bytes=Buffer.alloc(t.indices.length*2);t.indices.forEach((v,i)=>bytes.writeUInt16LE(v,i*2));packed[t.name]={palette:t.palette,indices:bytes.toString('base64')};
  const file='tiles/'+t.name+'.png';writeFileSync(root+'/'+file,Buffer.from(t.png,'base64'));
  index.push({name:t.name,file,width:32,height:32,source:t.source,variant:t.variant,repeatAxes:t.repeatAxes,pixelSha256:createHash('sha256').update(Buffer.from(t.rgba)).digest('hex')});
 }
 writeFileSync(root+'/texture-index.json',JSON.stringify(index,null,2)+'\n');writeFileSync(root+'/textures.json',JSON.stringify(packed));writeFileSync('src/render/coreArt.json',JSON.stringify(packed));
 writeFileSync(root+'/preview.png',Buffer.from(result.preview,'base64'));
 console.log('Packed '+new Set(manifest.entries.map(e=>e.source)).size+' distinct source images into '+index.length+' separately named PNG/runtime tiles.');
}finally{await browser.close();}
