// Reproducible mechanical export of generated atlas cells, plus runtime data and previews.
import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dropStrays} from './art-clean.mjs';
const root='assets/woodland-ember/expansion';
const manifest=JSON.parse(readFileSync(`${root}/manifest.json`,'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 await page.addScriptTag({content:dropStrays.toString()});
 for(const [group,sheet] of Object.entries(manifest)){
  if(!existsSync(`${root}/${group}-source.png`))throw new Error(`Missing ${group} source`);
  const data=await page.evaluate(async ({sheet,group,image})=>{
   const img=new Image();img.src='data:image/png;base64,'+image;await img.decode();
   const c=document.createElement('canvas');c.width=c.height=sheet.size;
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
   const cw=img.width/sheet.columns,ch=img.height/sheet.rows,inset=.035;
   // Some generated tree sheets include white separators and slightly uneven row spacing.
   // Find those separators before mechanical slicing rather than sampling a neighbour's border.
   let xb=Array.from({length:sheet.columns+1},(_,i)=>i*cw),yb=Array.from({length:sheet.rows+1},(_,i)=>i*ch);
   if(group==='trees'){
    const scan=document.createElement('canvas');scan.width=img.width;scan.height=img.height;
    const sc=scan.getContext('2d',{willReadFrequently:true});sc.drawImage(img,0,0);
    const rgba=sc.getImageData(0,0,img.width,img.height).data;
    const borders=(axis,parts,length,cross)=>{
     const runs=[];let begin=-1;
     for(let i=0;i<length;i++){
      let whites=0;
      for(let j=0;j<cross;j++){const o=(axis===0?j*img.width+i:i*img.width+j)*4;if(rgba[o]>215&&rgba[o+1]>215&&rgba[o+2]>200&&rgba[o+3]>200)whites++;}
      const line=whites/cross>.5;
      if(line&&begin<0)begin=i;
      if(!line&&begin>=0){if(begin>length*.02&&i<length*.98)runs.push((begin+i-1)/2);begin=-1;}
     }
     return runs.length===parts-1?[0,...runs,length]:null;
    };
    xb=borders(0,sheet.columns,img.width,img.height)||xb;
    yb=borders(1,sheet.rows,img.height,img.width)||yb;
   }
   const preview=document.createElement('canvas');preview.width=sheet.columns*144+32;preview.height=sheet.rows*148+100;
   const pctx=preview.getContext('2d');pctx.fillStyle='#172822';pctx.fillRect(0,0,preview.width,preview.height);pctx.fillStyle='#efdbad';pctx.font='bold 27px sans-serif';pctx.fillText('WOODLAND & EMBER · '+group.toUpperCase(),16,38);pctx.font='15px sans-serif';pctx.fillStyle='#bdcdbc';pctx.fillText('Packed asset pixels · '+sheet.size+' × '+sheet.size,16,65);
   const tiles=sheet.names.map((name,i)=>{
    ctx.clearRect(0,0,sheet.size,sheet.size);
    const col=i%sheet.columns,row=Math.floor(i/sheet.columns),w=xb[col+1]-xb[col],h=yb[row+1]-yb[row];
    ctx.drawImage(img,xb[col]+inset*w,yb[row]+inset*h,w*(1-2*inset),h*(1-2*inset),0,0,sheet.size,sheet.size);
    const pixels=ctx.getImageData(0,0,sheet.size,sheet.size);
    const opaque=group==='materials'||group==='creatures'||group==='effects'&&/^(water|lava)_/.test(name)||group==='trees'&&!/leaves|sapling/.test(name)||group==='future'&&/monster_|forge_top/.test(name);
    const repeat=group==='materials'||group==='trees'&&!/sapling/.test(name)||group==='effects'&&/^(water|lava)_/.test(name);
    const p=pixels.data,n=sheet.size;
    for(let j=0;j<p.length;j+=4){
     p[j]&=248;p[j+1]&=248;p[j+2]&=248;
     // Pixel-art assets use binary cutout alpha. UI preserves generated translucency.
     p[j+3]=opaque?255:group==='ui'?p[j+3]:p[j+3]>=160?255:0;
     if(!p[j+3])p[j]=p[j+1]=p[j+2]=0;
    }
    if(!opaque&&!repeat&&group!=='ui'&&group!=='effects')dropStrays(p,n); // Effects scatter droplets on purpose.
    if(repeat)for(let axis=0;axis<2;axis++)for(let t=0;t<n;t++){
     const a=axis===0?t*n*4:t*4,b=axis===0?(t*n+n-1)*4:((n-1)*n+t)*4;
     for(let k=0;k<4;k++){const v=Math.round((p[a+k]+p[b+k])/2);p[a+k]=p[b+k]=v;}
    }
    ctx.putImageData(pixels,0,0);
    const palette=[],indices=[],map=new Map();
    for(let j=0;j<p.length;j+=4){const rgba=Array.from(p.subarray(j,j+4)),key=rgba.join(',');if(!map.has(key)){map.set(key,palette.length/4);palette.push(...rgba);}indices.push(map.get(key));}
    const x=16+i%sheet.columns*144,y=92+Math.floor(i/sheet.columns)*148;
    pctx.fillStyle='#2e4038';pctx.fillRect(x,y,128,128);pctx.imageSmoothingEnabled=false;pctx.drawImage(c,x,y,128,128);pctx.font='10px sans-serif';pctx.fillStyle='#e6ecd9';pctx.fillText(name,x,y+141);
    return {name,palette,indices,png:c.toDataURL().split(',')[1],opaque};
   });
   return {tiles,preview:preview.toDataURL().split(',')[1]};
  },{sheet,group,image:readFileSync(`${root}/${group}-source.png`).toString('base64')});
  mkdirSync(`${root}/tiles/${group}`,{recursive:true});
  const packed={};
  for(const t of data.tiles){
   if(!t.indices.some(i=>t.palette[i*4+3]>0))throw new Error(`Empty ${t.name}`);
   const bytes=Buffer.alloc(t.indices.length*2);t.indices.forEach((v,i)=>bytes.writeUInt16LE(v,i*2));
   packed[t.name]={palette:t.palette,indices:bytes.toString('base64')};
   writeFileSync(`${root}/tiles/${group}/${t.name}.png`,Buffer.from(t.png,'base64'));
  }
  writeFileSync(`${root}/${group}.json`,JSON.stringify(packed));
  writeFileSync(`${root}/${group}-preview.png`,Buffer.from(data.preview,'base64'));
  console.log(`${group}: ${Object.keys(packed).length} tiles`);
 }
 // The sheet's water and lava cells do not tile; they are repainted from periodic noise.
 await import('./paint-fluids.mjs');
 const materials=JSON.parse(readFileSync(`${root}/materials.json`,'utf8'));
 const effects=JSON.parse(readFileSync(`${root}/effects.json`,'utf8'));
 const variations={...materials,...Object.fromEntries(Object.entries(effects).filter(([k])=>/^(water|lava)_/.test(k)))};
 writeFileSync('src/render/variationArt.json',JSON.stringify(variations));
 writeFileSync('src/render/variationNames.ts','// Generated by scripts/pack-expansion.mjs; names only, so workers do not bundle artwork.\nexport const EXTRA_TILE_NAMES: readonly string[] = '+JSON.stringify(Object.keys(variations))+';\n');
 await import('./export-runtime-art.mjs');
}finally{await browser.close();}
