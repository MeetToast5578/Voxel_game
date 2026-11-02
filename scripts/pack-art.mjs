// Mechanical atlas slicing/nearest-neighbour packing. Artwork is generated separately.
// Run after editing source atlases: node scripts/pack-art.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('assets/woodland-ember/manifest.json', 'utf8'));
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
const page = await browser.newPage();
const packed = {};
try {
 for (const [group, columns, rows] of [['terrain',8,7],['items',8,8],['cutouts',6,5]]) {
  const image = readFileSync(`assets/woodland-ember/${group}-source.png`).toString('base64');
  const tiles = await page.evaluate(async ({image, names, columns, rows, group}) => {
   const img = new Image(); img.src = 'data:image/png;base64,'+image; await img.decode();
   const canvas = document.createElement('canvas'); canvas.width=canvas.height=32;
   const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.imageSmoothingEnabled=false;
   return names.map((name,i)=>{
    ctx.clearRect(0,0,32,32);
    const cw=img.width/columns,ch=img.height/rows,inset=0.02;
    // Discard two percent at each grid boundary to exclude neighbouring-cell bleed in the generated source.
    ctx.drawImage(img,(i%columns+inset)*cw,(Math.floor(i/columns)+inset)*ch,cw*(1-2*inset),ch*(1-2*inset),0,0,32,32);
    // Thin boxes sample a subrectangle of a full-cell UV, so fit the art to that rectangle.
    if (name === 'torch' || name === 'lantern') {
     const copy=document.createElement('canvas'); copy.width=copy.height=32;
     copy.getContext('2d').drawImage(canvas,0,0);
     ctx.clearRect(0,0,32,32);
     if(name==='torch') ctx.drawImage(copy,0,0,32,32,0,12,32,20);
     else ctx.drawImage(copy,0,0,32,32,10,16,12,16);
    }
    const p=ctx.getImageData(0,0,32,32).data;
    // Match opposite edge texels on repeating natural materials; never blend furniture frames.
    const repeat = group==='terrain' && !/chest|table|furnace|door|bed_|campfire|beacon/.test(name);
    if(repeat){
     for(let axis=0;axis<2;axis++) for(let t=0;t<32;t++) {
      const a=axis===0?t*32*4:t*4, b=axis===0?(t*32+31)*4:(31*32+t)*4;
      for(let k=0;k<3;k++){const v=Math.round((p[a+k]+p[b+k])/2);p[a+k]=p[b+k]=v;}
     }
    }
    const colours=[], indices=[]; const palette=new Map();
    for(let j=0;j<p.length;j+=4){
     // Binary cutout alpha avoids coloured semi-transparent edge halos. Quantize to 5-bit RGB.
     const a=group==='terrain'?255:p[j+3]>=160?255:0;
     const rgba=a? [p[j]&248,p[j+1]&248,p[j+2]&248,a]:[0,0,0,0];
     const key=rgba.join(',');
     if(!palette.has(key)){palette.set(key,colours.length); colours.push(rgba);}
     indices.push(palette.get(key));
    }
    return {name,colours,indices};
   });
  },{image,names:manifest[group],columns,rows,group});
  for(const {name,colours,indices} of tiles) {
   packed[name]={palette:colours.flat(),indices:Buffer.from(new Uint16Array(indices).buffer).toString('base64')};
  }
 }
 writeFileSync('src/render/woodlandArt.json',JSON.stringify(packed));
 console.log(`Packed ${Object.keys(packed).length} authored 32x32 tiles.`);
} finally {await browser.close();}
