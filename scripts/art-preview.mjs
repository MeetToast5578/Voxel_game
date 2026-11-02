// A contact sheet of the exact packed game pixels, not the generated source presentation.
import {chromium} from 'playwright';
import {readFileSync,mkdirSync} from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1960},deviceScaleFactor:1});
 await page.setContent('<body style="margin:0"><canvas id="art" width="1440" height="1960"></canvas></body>');
 await page.evaluate(({pack,manifest})=>{
  const c=document.querySelector('canvas'),ctx=c.getContext('2d');
  ctx.fillStyle='#15221f';ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='#eee7cd';ctx.font='bold 38px sans-serif';ctx.fillText('WOODLAND & EMBER',32,54);
  ctx.font='18px sans-serif';ctx.fillStyle='#b4c8ad';ctx.fillText('Actual packed 32 × 32 game textures • v0.4.0 • 146 authored tiles',32,86);
  let top=120;
  for(const [group,names] of Object.entries(manifest)){
   ctx.font='bold 22px sans-serif';ctx.fillStyle='#e4b970';ctx.fillText(group.toUpperCase(),32,top+25);top+=42;
   names.forEach((name,i)=>{
    const x=32+i%12*116,y=top+Math.floor(i/12)*114;
    ctx.fillStyle='#25342e';ctx.fillRect(x,y,96,96);
    const p=pack[name],bin=atob(p.indices),rgba=new Uint8ClampedArray(4096);
    for(let j=0;j<1024;j++) {const index=bin.charCodeAt(j*2)|(bin.charCodeAt(j*2+1)<<8);rgba.set(p.palette.slice(index*4,index*4+4),j*4);}
    const tile=document.createElement('canvas');tile.width=tile.height=32;tile.getContext('2d').putImageData(new ImageData(rgba,32,32),0,0);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(tile,x,y,96,96);
    ctx.font='10px sans-serif';ctx.fillStyle='#e5e8d9';ctx.fillText(name,x,y+108);
   });
   top+=Math.ceil(names.length/12)*114+16;
  }
 },{pack:JSON.parse(readFileSync('src/render/woodlandArt.json','utf8')),manifest:JSON.parse(readFileSync('assets/woodland-ember/manifest.json','utf8'))});
 mkdirSync('screenshots',{recursive:true});
 await page.locator('canvas').screenshot({path:'screenshots/woodland-ember-contact-sheet.png'});
 console.log('screenshots/woodland-ember-contact-sheet.png');
} finally {await browser.close();}
