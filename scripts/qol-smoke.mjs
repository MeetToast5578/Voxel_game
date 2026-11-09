import {preview} from 'vite';import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
const server=await preview({preview:{port:4177,strictPort:true}}),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.goto('http://localhost:4177/?seed=1&view=4&mode=creative&world=qol-smoke&new=1');await p.waitForFunction(()=>window.__game?.idle,null,{timeout:180000});
 await p.evaluate(()=>window.__game.play.openScreen('inventory'));await p.getByLabel('Search blocks and items').fill('birch');
 assert.equal(await p.locator('.screen .palette .slot').count(),4);mkdirSync('screenshots',{recursive:true});await p.screenshot({path:'screenshots/qol-search.png'});
 await p.evaluate(()=>{const n=window.__game,P=n.play,S=k=>n.blocks.state(k);P.closeScreen();P.mode='survival';P.inventory.clear();P.inventory.slots[9]={state:S('iron_pickaxe'),count:1,wear:39,upgrade:2};P.inventory.slots[10]={state:S('dirt'),count:20};const slots=new Array(27).fill(null);slots[0]={state:S('dirt'),count:60};P.chests.set('0,0,0',slots);P.openChest='0,0,0';P.openScreen('chest');});
 await p.getByRole('dialog',{name:'Chest',exact:true}).waitFor();
 await p.locator('.bag-pane .grid').nth(1).locator('.slot').nth(1).click({modifiers:['Shift']});
 assert.deepEqual(await p.evaluate(()=>window.__game.play.chests.get('0,0,0').slice(0,2).map(s=>s.count)),[64,16]);
 await p.locator('.bag-pane .grid').nth(1).locator('.slot').nth(0).focus();await p.keyboard.press('Shift+Enter');
 assert.deepEqual(await p.evaluate(()=>{const s=window.__game.play.chests.get('0,0,0')[2];return [s.wear,s.upgrade];}),[39,2]);
 await p.evaluate(()=>{const n=window.__game,P=n.play;P.closeScreen();n.setBlock(0,0,0,n.blocks.state('furnace'));P.openFurnace='0,0,0';P.furnaces.set('0,0,0',{input:null,fuel:null,output:{state:n.blocks.state('iron_ingot'),count:20},burn:0,progress:0});P.cursor={state:n.blocks.state('iron_ingot'),count:60};P.openScreen('furnace');});
 const output=p.getByRole('button',{name:/^Furnace output/});await output.click();assert.deepEqual(await p.evaluate(()=>{const P=window.__game.play;return [P.cursor.count,P.furnaces.get('0,0,0').output.count];}),[64,16]);
 await p.evaluate(()=>{window.__game.play.cursor=null;});await output.click({button:'right'});assert.equal(await p.evaluate(()=>window.__game.play.cursor.count),1);
 await p.evaluate(()=>{window.__game.play.cursor=null;});await output.click({modifiers:['Shift']});assert.equal(await p.evaluate(()=>window.__game.play.furnaces.get('0,0,0').output),null);
 await p.evaluate(()=>{const P=window.__game.play;P.closeScreen();P.inventory.clear();P.inventory.slots[9]={state:window.__game.blocks.state('log'),count:3};P.openScreen('inventory',2);});
 await p.getByLabel('Search recipes').fill('planks');assert.equal(await p.locator('.recipe-tile').count(),1);
 await p.locator('.recipe-tile').click();await p.getByRole('button',{name:/^All \(3\)/}).click();assert.equal(await p.evaluate(()=>window.__game.play.inventory.count(window.__game.blocks.state('planks'))),12);
 await p.getByLabel('Search recipes').fill('torch');assert.equal(await p.locator('.recipe-tile').count(),0);await p.getByLabel('Show all',{exact:true}).check();assert.equal(await p.locator('.recipe-tile').count(),1);
 await p.evaluate(()=>{const n=window.__game,b=n.player.body,x=Math.floor(b.x),z=Math.floor(b.z),y=Math.floor(n.player.eyeY);n.play.closeScreen();n.play.mode='creative';n.player.flying=true;n.setView(x+.5,b.y,z+.5,0,0);for(let j=1;j<=2;j++)n.setBlock(x,y,z-j,0);n.setBlock(x,y,z-3,n.blocks.state('ember_forge'));});
 await p.getByRole('button',{name:'Resume',exact:true}).click();await p.waitForFunction(()=>!!document.pointerLockElement);
 await p.locator('#interaction-hint').filter({hasText:'Right click: Upgrade equipment'}).waitFor();assert.equal(await p.locator('.slot-key').count(),9);
 assert.deepEqual(errors,[]);console.log('PASS: palette/recipe searches, Shift-click and keyboard transfer, equipment metadata, safe furnace withdrawal, bulk craft, hotbar keys and a reachable interaction prompt.');
}finally{await browser.close();server.httpServer.close();}
