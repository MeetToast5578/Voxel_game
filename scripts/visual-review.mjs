import {createServer} from 'vite';import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';
const server=await createServer({server:{host:'127.0.0.1',port:4182,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],report=[],scales=Array.from({length:16},(_,i)=>Math.round((.75+i*.05)*100)/100);mkdirSync('screenshots',{recursive:true});
try{
 const p=await browser.newPage({viewport:{width:1280,height:1100}});p.setDefaultTimeout(30000);p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto('http://127.0.0.1:4182/scripts/visual-fixtures.html');await p.waitForFunction(()=>window.fixturesReady);
 const fixtures=await p.evaluate(()=>window.fixtureReport);for(const f of fixtures){assert.ok(f.clearPixels>10,'Object missing: '+JSON.stringify(f));assert.equal(f.fogPixels,0,'Object bypasses fog: '+JSON.stringify(f));}
 await p.screenshot({path:'screenshots/visual-fog-fixtures.png'});console.log('GPU fog checks',JSON.stringify(fixtures));
 await p.setViewportSize({width:1280,height:800});
 await p.goto('http://127.0.0.1:4182/?seed=1&view=4&mode=creative&world=visual-review&new=1');await p.waitForFunction(()=>window.__game?.idle,null,{timeout:180000});
 assert.equal(await p.locator('#overlay').isVisible(),false);assert.equal(await p.locator('#frames').isVisible(),false);
 await p.getByRole('button',{name:'Resume',exact:true}).click();await p.waitForFunction(()=>!!document.pointerLockElement);await p.waitForSelector('.hotbar');
 assert.equal(await p.locator('#crosshair').isVisible(),true);await p.screenshot({path:'screenshots/visual-gameplay.png'});
 await p.keyboard.press('F3');await p.locator('#overlay').waitFor({state:'visible'});await p.keyboard.press('F3');await p.locator('#overlay').waitFor({state:'hidden'});
 await p.keyboard.press('e');await p.waitForSelector('.screen');assert.equal(await p.locator('.hud').count(),0);assert.equal(await p.locator('#crosshair').isVisible(),false);
 for(const [item,selector] of [['map','.minimap'],['compass','#compass']]){
  await p.evaluate(item=>{const n=window.__game;n.play.inventory.slots[0]={state:n.blocks.state(item),count:1};n.play.inventory.selected=0;n.play.version++;},item);
  await p.keyboard.press('e');await p.locator(selector).waitFor({state:'visible'});
  await p.keyboard.press('e');await p.waitForSelector('.screen');await p.locator(selector).waitFor({state:'hidden'});
 }
 const desktopIcon=await p.locator('.screen .slot img').first().evaluate(e=>e.getBoundingClientRect().width);assert.ok(desktopIcon>=30,'Desktop icon too small: '+desktopIcon);
 await p.screenshot({path:'screenshots/visual-inventory-desktop.png'});
 for(const width of [390,320,768])for(const scale of scales){
  await p.setViewportSize({width,height:844});await p.evaluate(scale=>{const u=document.querySelector('#ui');u.style.zoom=String(scale);u.style.setProperty('--gui-scale',String(scale));},scale);
  const bounds=await p.locator('.screen').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),client:e.clientWidth,scroll:e.scrollWidth}));
  assert.ok(bounds.rect.left>=0&&bounds.rect.right<=width+1&&bounds.rect.top>=0&&bounds.rect.bottom<=845,'Offscreen inventory: '+JSON.stringify({width,scale,bounds}));
  assert.ok(bounds.scroll<=bounds.client+1,'Inventory scrolls sideways: '+JSON.stringify({width,scale,bounds}));report.push({screen:'inventory',width,scale,bounds});
  if(width===390&&scale===1)await p.screenshot({path:'screenshots/visual-inventory-phone.png'});
 }
 // Check crafting and each workshop too: long labels and text fields must fit the same narrow viewport.
 for(const kind of ['survival','trade','forge','sign','frame']){
  await p.evaluate(kind=>{const n=window.__game,P=n.play;P.closeScreen();P.mode='survival';P.inventory.slots[0]={state:n.blocks.state('diamond_pickaxe'),count:1};P.inventory.slots[9]={state:n.blocks.state('diamond_chestplate'),count:1};if(kind==='survival')P.openScreen('inventory');else P.openWorkshop(kind,'0,0,0');},kind);
  await p.waitForSelector('.screen');
  for(const width of [390,320,768])for(const scale of scales){
   await p.setViewportSize({width,height:844});await p.evaluate(scale=>{const u=document.querySelector('#ui');u.style.zoom=String(scale);u.style.setProperty('--gui-scale',String(scale));},scale);
   const bounds=await p.locator('.screen').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),client:e.clientWidth,scroll:e.scrollWidth}));
   assert.ok(bounds.rect.left>=0&&bounds.rect.right<=width+1&&bounds.rect.top>=0&&bounds.rect.bottom<=845,'Offscreen '+kind+': '+JSON.stringify({width,scale,bounds}));
   assert.ok(bounds.scroll<=bounds.client+1,kind+' scrolls sideways: '+JSON.stringify({width,scale,bounds}));report.push({screen:kind,width,scale,bounds});
   if(width===390&&scale===1)await p.screenshot({path:'screenshots/visual-'+kind+'-phone.png'});
  }
 }
 const reviewMenu=async(kind,tabs)=>{for(const tab of tabs){
 await p.locator('nav[aria-label="Menu sections"]').getByRole('button',{name:tab,exact:true}).click();
 assert.equal(await p.locator('.menu-panel:visible').count(),1);
 await p.setViewportSize({width:1280,height:800});await p.evaluate(()=>{const u=document.querySelector('#ui');u.style.zoom='1';u.style.setProperty('--gui-scale','1');});
 await p.screenshot({path:'screenshots/visual-'+kind+'-'+tab.toLowerCase().replaceAll(' ','-')+'-desktop.png'});
 for(const width of [390,320,768])for(const scale of scales){
  await p.setViewportSize({width,height:844});await p.evaluate(scale=>{const u=document.querySelector('#ui');u.style.zoom=String(scale);u.style.setProperty('--gui-scale',String(scale));},scale);
  const bounds=await p.locator('.menu-shell').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),client:e.clientWidth,scroll:e.scrollWidth}));
  assert.ok(bounds.rect.left>=0&&bounds.rect.right<=width+1&&bounds.rect.top>=0&&bounds.rect.bottom<=845,'Offscreen '+kind+'/'+tab+': '+JSON.stringify({width,scale,bounds}));
  assert.ok(bounds.scroll<=bounds.client+1,kind+'/'+tab+' scrolls sideways: '+JSON.stringify({width,scale,bounds}));report.push({screen:kind+'/'+tab,width,scale,bounds});
  if(width===390&&scale===1)await p.screenshot({path:'screenshots/visual-'+kind+'-'+tab.toLowerCase().replaceAll(' ','-')+'-phone.png'});
 }}};
 await p.evaluate(()=>window.__game.play.closeScreen());await p.waitForSelector('.menu-shell');
 await reviewMenu('pause',['Journey','Settings','Worlds','Controls']);
 await p.goto('http://127.0.0.1:4182/');await p.waitForSelector('.menu.title');
 await p.getByLabel('World name',{exact:true}).fill('Keep my draft');await p.getByLabel('Seed',{exact:true}).fill('forest trail');
 await reviewMenu('title',['New adventure','Saved worlds','Settings','Controls']);
 await p.locator('nav').getByRole('button',{name:'New adventure',exact:true}).focus();await p.keyboard.press('Enter');
 assert.equal(await p.getByLabel('World name',{exact:true}).inputValue(),'Keep my draft');assert.equal(await p.getByLabel('Seed',{exact:true}).inputValue(),'forest trail');
 assert.deepEqual(errors,[]);writeFileSync('screenshots/visual-review.json',JSON.stringify({fixtures,desktopIcon,layouts:report},null,2));console.log('PASS: six actual object renderers match fog; F3, clean gameplay, modal overlays, readable icons and '+report.length+' responsive screen/GUI-scale layouts.');
}finally{await browser.close();await server.close();}
