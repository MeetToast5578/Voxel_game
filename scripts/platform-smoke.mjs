// Production-only offline/install and native inventory activation at a subdirectory URL.
import { preview } from 'vite';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots',{recursive:true});
import { chromium } from 'playwright';
const server=await preview({plugins:[{name:'platform-subpath',configurePreviewServer(s){
  s.middlewares.use((req,_res,next)=>{if(req.url?.startsWith('/voxel/'))req.url=req.url.slice('/voxel'.length);next();});
}}],preview:{port:4176,strictPort:true},logLevel:'warn'});
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const context=await browser.newContext({viewport:{width:640,height:360},hasTouch:true}),page=await context.newPage();
  await context.addInitScript(()=>localStorage.setItem('voxel-game-settings-v1',JSON.stringify({renderDistance:2})));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('http://localhost:4176/voxel/?seed=1&autostart=1&nosave=1');
  await page.waitForFunction(()=>window.__game?.ready,null,{timeout:90000});
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const cached=await page.evaluate(async()=>{
    const keys=await caches.keys(),cache=await caches.open(keys.find(k=>k.startsWith('voxel-shell-')));
    return (await cache.keys()).map(r=>new URL(r.url).pathname);
  });
  if(!cached.some(p=>p.includes('chunkWorker'))||!cached.some(p=>p.includes('horizonWorker'))||!cached.includes('/voxel/index.html'))throw Error(`incomplete offline cache: ${cached}`);
  for(const [width,height] of [[640,360],[1280,720],[1920,1080],[1000,700]]){
    await page.evaluate(()=>document.exitPointerLock());
    await page.waitForFunction(()=>!document.pointerLockElement);
    await page.setViewportSize({width,height});
    await page.locator('button.hud-inventory').click();
    const slot=page.locator('.inventory-bar button').first();await slot.focus();
    await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
    if(await page.evaluate(()=>window.__game.state().hotbar[0]!==0))throw Error('repeated Enter activated slot twice');
    await page.keyboard.press('Space');
    await page.locator('.inventory button').last().focus();
    await page.keyboard.press('Tab');
    if(!await page.getByRole('button',{name:'Close (E)',exact:true}).evaluate(el=>document.activeElement===el))throw Error('inventory focus escaped its modal');
    await page.getByRole('tab',{name:/^Blocks/}).click();
    const slab=page.getByRole('button',{name:'stone_slab, full stack',exact:true});
    if(width===640) await slab.tap();
    else { await slab.focus();await page.keyboard.press('Enter'); }
    const picked=await page.evaluate(()=>window.__game.state().hotbar[0]===window.__game.blockState('stone_slab'));
    if(!picked)throw Error('keyboard slab picker did not activate');
    // Native activation also accepts touch/synthetic clicks; right-button presses do not pick.
    await page.screenshot({path:`screenshots/building-interface-${width}x${height}.png`});
    await page.getByRole('button',{name:'Close (E)',exact:true}).click();
  }
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__game?.ready,null,{timeout:90000});
  if(!await page.evaluate(()=>window.__game.state().workers))throw Error('workers unavailable offline');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PLATFORM SMOKE PASSED: subpath shell/workers reload offline; inventory keyboard activation at four sizes');
} finally {await browser?.close();await server.httpServer.close();}
