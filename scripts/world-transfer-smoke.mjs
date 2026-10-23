// Real world-file download/import, atomic IDB failure rollback and stale-tab protection.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';
mkdirSync('screenshots',{recursive:true});
const server=await preview({preview:{port:4177,strictPort:true},logLevel:'warn'});
let browser;
const readDb=page=>page.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('voxel-game');open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{const db=open.result,tx=db.transaction(['meta','chunks'],'readonly');
    const meta=tx.objectStore('meta').getAll(),chunks=tx.objectStore('chunks').getAll();
    tx.oncomplete=()=>{resolve(JSON.stringify([meta.result,chunks.result]));db.close();};tx.onerror=()=>reject(tx.error);
  };
}));
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage(),errors=[];
  const watch=p=>p.on('pageerror',e=>errors.push(e.message));watch(page);
  await context.addInitScript(()=>localStorage.setItem('voxel-game-settings-v1',JSON.stringify({renderDistance:2})));
  await page.goto('http://localhost:4177/?autostart=0');
  await page.waitForFunction(()=>window.__game?.ready,null,{timeout:90000});
  await page.evaluate(()=>{const g=window.__game;g.setFlying(true);g.teleport(8.5,8394,8.5);});
  await page.waitForFunction(()=>window.__game.state().areaMeshed,null,{timeout:90000});
  await page.evaluate(async()=>{const g=window.__game;g.setIdle(true);
    for(const x of [8,24]){if(!g.setBlock(x,8390,8,10))throw Error('backup fixture not loaded');}
    g.setBlock(8,8391,8,1);g.setBlock(24,8391,8,g.blockState('stone_slab#1'));
    if(!await g.save())throw Error('initial world save failed');
  });
  const downloadEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export world',exact:true}).click();
  const download=await downloadEvent,backup=readFileSync(await download.path(),'utf8');
  const archive=JSON.parse(backup);if(!archive.chunks.some(c=>c.edits.some(e=>e[1]==='stone_slab#1')))throw Error('download lost slab state');
  const stale=await context.newPage();watch(stale);
  await stale.goto('http://localhost:4177/?autostart=0');await stale.waitForFunction(()=>window.__game?.ready,null,{timeout:90000});
  await stale.evaluate(()=>window.__game.setIdle(true));await page.bringToFront();
  await page.evaluate(async()=>{window.__game.setBlock(12,8391,8,12);if(!await window.__game.save())throw Error('changed world save failed');});
  const before=await readDb(page);
  const bad=await page.evaluate(()=>window.__game.importWorld('{"format":"invalid"}'));
  if(bad||await readDb(page)!==before)throw Error('invalid import changed the saved world');
  const rolledBack=await page.evaluate(async text=>{
    const original=IDBObjectStore.prototype.put;let chunks=0;
    IDBObjectStore.prototype.put=function(...args){if(this.name==='chunks'&&++chunks===2)throw new DOMException('forced write failure','DataCloneError');return original.apply(this,args);};
    try{return !await window.__game.importWorld(text);}finally{IDBObjectStore.prototype.put=original;}
  },backup);
  if(!rolledBack||await readDb(page)!==before)throw Error('failed replacement did not roll back old metadata/chunks');
  let confirmation=false;
  page.once('dialog',async dialog=>{confirmation=true;await dialog.accept();});
  const navigation=page.waitForURL(url=>url.search==='',{timeout:90000,waitUntil:'domcontentloaded'});
  await page.getByLabel('Import world backup',{exact:true}).setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(backup)});
  await navigation;await page.waitForFunction(()=>window.__game?.ready,null,{timeout:90000});
  const restored=await page.evaluate(()=>{const g=window.__game;return [g.getBlock(8,8391,8),g.getBlock(24,8391,8)===g.blockState('stone_slab#1'),g.getBlock(12,8391,8)];});
  if(!confirmation||restored[0]!==1||!restored[1]||restored[2]!==0)throw Error(`world restore failed: ${restored}`);
  const imported=await readDb(page);
  if(await stale.evaluate(()=>window.__game.save()))throw Error('stale tab overwrote imported world');
  if(await readDb(page)!==imported)throw Error('stale save modified imported data');
  await page.screenshot({path:'screenshots/world-backup-import.png'});
  if(errors.length)throw Error(errors.join('\n'));
  console.log('WORLD TRANSFER SMOKE PASSED: download, rejected invalid import, transactional rollback, confirmed restore and stale-tab guard');
} finally {await browser?.close();await server.httpServer.close();}
