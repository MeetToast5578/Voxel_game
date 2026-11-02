// Staged in-game review of sign text and a framed item, separate from the transaction smoke tests.
import {preview} from 'vite';import {chromium} from 'playwright';import {mkdirSync} from 'node:fs';
const server=await preview({preview:{port:4176,strictPort:true}});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto('http://localhost:4176/?seed=1&view=4&mode=creative&world=decor-review&new=1');await p.waitForFunction(()=>window.__game?.idle,null,{timeout:180000});
 await p.evaluate(()=>{
  const n=window.__game,b=n.player.body,x=Math.floor(b.x)+3,y=Math.floor(b.y)+7,z=Math.floor(b.z)+3,S=(k,v=0)=>n.blocks.state(k,v);
  for(let cy=y-2;cy<=y+3;cy++)for(let cz=z-3;cz<=z+2;cz++)for(let cx=x-3;cx<=x+3;cx++)n.setBlock(cx,cy,cz,0);
  for(let cy=y-1;cy<=y+1;cy++)for(let cx=x-2;cx<=x+2;cx++)n.setBlock(cx,cy,z+1,S('planks'));
  n.setBlock(x-1,y,z,S('sign',3));n.setBlock(x+1,y,z,S('item_frame',3));
  n.play.decorations.setSign(`${x-1},${y},${z}`,'Camp Ember\nTrading ahead');n.play.decorations.frames.set(`${x+1},${y},${z}`,{state:S('diamond'),count:1});
  const render=n.renderer.render.bind(n.renderer);n.renderer.render=time=>{n.renderer.camera.position.set(x+.5,y+.6,z-2);n.renderer.camera.rotation.set(-.025,Math.PI,0,'YXZ');render(time);};
  for(const id of ['ui','overlay','frames','crosshair'])document.querySelector('#'+id).style.display='none';
 });
 await p.waitForFunction(()=>window.__game.streamer.idle,null,{timeout:60000});await p.waitForTimeout(1200);
 mkdirSync('screenshots',{recursive:true});await p.screenshot({path:'screenshots/decorations-review.png'});
 if(errors.length)throw new Error(errors.join('\n'));console.log('In-game decoration review rendered without errors.');
}finally{await browser.close();server.httpServer.close();}
