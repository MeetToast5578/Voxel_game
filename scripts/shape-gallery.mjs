// Screenshots of every creature model in its poses: screenshots/shapes-N.png. Usage: node scripts/shape-gallery.mjs
import {createServer} from 'vite';import {chromium} from 'playwright';import {mkdirSync} from 'node:fs';
mkdirSync('screenshots',{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:4181,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(let n=0;n<6;n++){const p=await browser.newPage({viewport:{width:1500,height:1050}});p.on('pageerror',e=>console.log('ERR',String(e)));
await p.goto(`http://127.0.0.1:4181/scripts/shape-gallery.html?page=${n}`);await p.waitForFunction(()=>window.ready,{timeout:60000});await p.screenshot({path:`screenshots/shapes-${n}.png`,fullPage:true});await p.close();}}
finally{await browser.close();await server.close();}
