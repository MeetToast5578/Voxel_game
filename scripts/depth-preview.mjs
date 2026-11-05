// Compare the actual 32px exports; this sheet is never a runtime packing input.
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const groups=[
 {label:'Original reference',tiles:JSON.parse(readFileSync('src/render/woodlandArt.json'))},
 {label:'Previous rework',tiles:JSON.parse(readFileSync('assets/woodland-ember/depth-review/before-grass.json'))},
 {label:'Updated',tiles:JSON.parse(readFileSync('src/render/coreArt.json'))}
];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const p=await browser.newPage();
 const png=await p.evaluate(groups=>{
  const c=document.createElement('canvas');c.width=720;c.height=590;const x=c.getContext('2d');x.fillStyle='#102b33';x.fillRect(0,0,720,590);x.fillStyle='#eee4c9';x.font='bold 24px sans-serif';x.fillText('Woodland & Ember · grass definition',20,35);x.imageSmoothingEnabled=false;
  groups.forEach((g,col)=>{
   x.fillStyle='#eee4c9';x.font='bold 17px sans-serif';x.fillText(g.label,col*240+20,70);
   ['grass_top','grass_side'].forEach((name,row)=>{
    const t=g.tiles[name],b=atob(t.indices),rgba=new Uint8ClampedArray(4096);for(let i=0;i<1024;i++){const j=(b.charCodeAt(i*2)|b.charCodeAt(i*2+1)<<8)*4;rgba.set(t.palette.slice(j,j+4),i*4);}
    const tile=document.createElement('canvas');tile.width=tile.height=32;tile.getContext('2d').putImageData(new ImageData(rgba,32,32),0,0);
    const dx=col*240+20,dy=90+row*245;x.drawImage(tile,dx,dy,192,192);x.fillStyle='#eee4c9';x.font='15px sans-serif';x.fillText(row?'Upright side blades':'Overhead grass',dx,dy+216);
   });
  });
  return c.toDataURL().split(',')[1];
 },groups);writeFileSync('assets/woodland-ember/depth-review/grass-definition.png',Buffer.from(png,'base64'));
}finally{await browser.close();}
