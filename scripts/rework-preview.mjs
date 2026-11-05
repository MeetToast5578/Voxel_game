import {chromium} from 'playwright';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const root='assets/woodland-ember/rework',index=JSON.parse(readFileSync(root+'/texture-index.json'));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const p=await browser.newPage();mkdirSync(root+'/previews',{recursive:true});
 for(const [group,entries]of Object.entries(Object.groupBy(index.filter(e=>!e.derivedFrom||e.name.endsWith('_item')),e=>e.category))){
  const png=await p.evaluate(async({group,entries})=>{
   const width=1120,cell=140,canvas=document.createElement('canvas');canvas.width=width;canvas.height=70+Math.ceil(entries.length/8)*150;
   const c=canvas.getContext('2d');c.fillStyle='#102b33';c.fillRect(0,0,canvas.width,canvas.height);c.fillStyle='#eee4c9';c.font='bold 24px sans-serif';c.fillText('Woodland & Ember · '+group+' · actual 32×32 exports',20,37);c.imageSmoothingEnabled=false;
   for(let i=0;i<entries.length;i++){
    const e=entries[i],x=i%8*cell+15,y=70+Math.floor(i/8)*150,img=new Image();img.src='data:image/png;base64,'+e.data;await img.decode();
    c.fillStyle='#25454c';c.fillRect(x,y,108,108);c.drawImage(img,x+6,y+6,96,96);c.fillStyle='#eee4c9';c.font='12px monospace';
    const words=e.name.split('_');let line='',row=0;for(const word of words){if((line+word).length>16){c.fillText(line,x,y+123+row*13);row++;line='';}line+=(line?'_':'')+word;}c.fillText(line,x,y+123+row*13);
   }
   return canvas.toDataURL().split(',')[1];
  },{group,entries:entries.map(e=>({...e,data:readFileSync(root+'/'+e.file).toString('base64')}))});
  writeFileSync(root+'/previews/'+group+'.png',Buffer.from(png,'base64'));
 }
 console.log('Wrote labeled previews from the individual runtime PNGs.');
}finally{await browser.close();}
