import {chromium} from 'playwright';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{const page=await browser.newPage();const tiles=await page.evaluate(async image=>{
 const img=new Image();img.src='data:image/png;base64,'+image;await img.decode();
 const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
 return ['post_top','post_side','post_front','forge_top','forge_side','forge_front'].map((name,i)=>{
  ctx.clearRect(0,0,32,32);const w=img.width/3,h=img.height/2;
  ctx.drawImage(img,(i%3+.02)*w,(Math.floor(i/3)+.02)*h,w*.96,h*.96,0,0,32,32);
  const p=ctx.getImageData(0,0,32,32),palette=[],indices=[],map=new Map();
  for(let o=0;o<p.data.length;o+=4){p.data[o+3]=255;const rgba=Array.from(p.data.subarray(o,o+4));const key=rgba.join(',');if(!map.has(key)){map.set(key,palette.length/4);palette.push(...rgba);}indices.push(map.get(key));}
  ctx.putImageData(p,0,0);return{name,palette,indices,png:c.toDataURL().split(',')[1]};
 });
},readFileSync('assets/woodland-ember/stations-source.png').toString('base64'));
 const packed={};mkdirSync('assets/woodland-ember/stations',{recursive:true});for(const t of tiles){const b=Buffer.alloc(2048);t.indices.forEach((v,i)=>b.writeUInt16LE(v,i*2));packed[t.name]={palette:t.palette,indices:b.toString('base64')};writeFileSync(`assets/woodland-ember/stations/${t.name}.png`,Buffer.from(t.png,'base64'));}writeFileSync('src/render/stationArt.json',JSON.stringify(packed));console.log('Six opaque station faces packed.');
}finally{await browser.close();}
