import {preview} from 'vite';import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
const server=await preview({preview:{port:4175,strictPort:true}});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];mkdirSync('screenshots',{recursive:true});
try{
 const p=await browser.newPage({viewport:{width:1280,height:900}});p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto('http://localhost:4175/?seed=1&view=4&mode=creative&world=features-smoke&new=1');await p.waitForFunction(()=>window.__game?.idle,null,{timeout:180000});
 const keys=await p.evaluate(()=>{
  const n=window.__game,b=n.player.body,x=Math.floor(b.x),y=Math.floor(b.y),z=Math.floor(b.z),S=k=>n.blocks.state(k);
  // Set up reachable fixtures via the game's normal edit path; transactions are exercised through the UI.
  n.play.feet=[b.x,b.y,b.z];
  const points={trade:[x+2,y,z],forge:[x+4,y,z],sign:[x+2,y,z+2],frame:[x+4,y,z+2]};
  for(const [kind,v] of Object.entries(points)){
    n.setBlock(v[0],v[1]-1,v[2],S('stone'));
    if(kind==='sign'||kind==='frame')n.setBlock(v[0],v[1],v[2]+1,S('planks'));
    n.setBlock(...v,n.blocks.state({trade:'trading_post',forge:'ember_forge',sign:'sign',frame:'item_frame'}[kind],kind==='sign'||kind==='frame'?3:0));
  }
  n.play.inventory.clear();for(const [i,key,count] of [[9,'iron_pickaxe',1],[10,'ember_crystal',12],[11,'wheat',16],[12,'iron_ingot',8],[13,'diamond',1]])n.play.inventory.slots[i]={state:S(key),count};
  return Object.fromEntries(Object.entries(points).map(([k,v])=>[k,v.join(',')]));
 });
 await p.evaluate(k=>window.__game.play.openWorkshop('trade',k),keys.trade);await p.waitForSelector('.trade-list');
 await p.locator('.trade-list button').nth(0).click();await p.locator('.trade-list button').nth(0).click();await p.locator('.trade-list button').nth(3).click();
 assert.equal(await p.evaluate(()=>window.__game.play.inventory.count(window.__game.blocks.state('wheat'))),6);
 await p.screenshot({path:'screenshots/trading.png'});
 await p.evaluate(k=>{window.__game.play.closeScreen();window.__game.play.openWorkshop('forge',k);},keys.forge);
 await p.getByRole('button',{name:/Iron pickaxe/}).click();await p.getByText('Level 1/3',{exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>window.__game.play.inventory.slots[9].upgrade),1);await p.screenshot({path:'screenshots/forge.png'});
 await p.evaluate(k=>{window.__game.play.closeScreen();window.__game.play.openWorkshop('sign',k);},keys.sign);
 await p.getByLabel('Sign text').fill('');await p.getByLabel('Sign text').pressSequentially('Camp Ember');await p.getByLabel('Sign text').press('Enter');await p.getByLabel('Sign text').pressSequentially('Trading ahead');await p.getByRole('button',{name:'Save sign',exact:true}).click();
 await p.evaluate(k=>window.__game.play.openWorkshop('frame',k),keys.frame);await p.getByRole('button',{name:'Diamond',exact:true}).click();
 assert.equal(await p.evaluate(k=>window.__game.play.decorations.frames.get(k)?.count,keys.frame),1);
 await p.evaluate(async()=>{window.__game.play.closeScreen();await window.__game.save();});
 await p.goto('http://localhost:4175/?view=4&world=features-smoke');await p.waitForFunction(()=>window.__game?.idle,null,{timeout:180000});
 const saved=await p.evaluate(keys=>({sign:window.__game.play.decorations.signs.get(keys.sign),frame:window.__game.blocks.stateName(window.__game.play.decorations.frames.get(keys.frame).state),upgrade:window.__game.play.inventory.slots[9]?.upgrade}),keys);
 assert.deepEqual(saved,{sign:'Camp Ember\nTrading ahead',frame:'diamond',upgrade:1});
 await p.evaluate(keys=>{
  const n=window.__game,[x,y,z]=keys.sign.split(',').map(Number);
  n.player.flying=true;n.setView(x+1.5,y+1,z-1.2,Math.PI,-.08);
  // A review camera frames the wall decorations independently of the player's collision box.
  const render=n.renderer.render.bind(n.renderer);n.renderer.render=(time)=>{n.renderer.camera.position.set(x+1.5,y+.7,z-1.2);n.renderer.camera.rotation.set(-.08,Math.PI,0,'YXZ');render(time);};
  for(let cx=x-1;cx<=x+3;cx++)for(let cy=y-1;cy<=y+2;cy++)n.setBlock(cx,cy,z-1,0);
  document.querySelector('#ui').style.display='none';document.querySelector('#overlay').style.display='none';document.querySelector('#frames').style.display='none';
  const [fx,fy,fz]=keys.forge.split(',').map(Number);n.setBlock(fx-2,fy,fz-1,n.blocks.state('campfire'));
 },keys);
 await p.waitForTimeout(1200);await p.screenshot({path:'screenshots/signs-and-frames.png'});
 const recovered=await p.evaluate(key=>{const n=window.__game,[x,y,z]=key.split(',').map(Number);n.setBlock(x,y,z,0);return {empty:!n.play.decorations.frames.has(key),drops:n.play.drops.list.filter(d=>n.blocks.type(d.stack.state).key==='diamond').reduce((sum,d)=>sum+d.stack.count,0)};},keys.frame);
 assert.deepEqual(recovered,{empty:true,drops:1});
 assert.deepEqual(errors,[]);console.log('PASS: trading both ways, forge upgrade, sign editing, framed item, persistent reload and frame-break recovery; no browser errors.');
}finally{await browser.close();server.httpServer.close();}
