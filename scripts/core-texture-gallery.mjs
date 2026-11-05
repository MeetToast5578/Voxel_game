import {createServer}from'vite';import{chromium}from'playwright';import assert from'node:assert/strict';import{mkdirSync,writeFileSync}from'node:fs';
const server=await createServer({server:{host:'127.0.0.1',port:4184,strictPort:true}});await server.listen();const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 mkdirSync('screenshots',{recursive:true});const results=[],errors=[];
 const allViews=['blocks','faces','shapes','repeats','rocks','ores','trees','stations','plants','items','animations','fluids'];
 const selected=process.argv.slice(2);for(const view of selected)assert.ok(allViews.includes(view),'Unknown gallery view '+view);
 for(const view of selected.length?selected:allViews){
  const p=await browser.newPage({viewport:{width:1140,height:900}});p.on('pageerror',e=>errors.push(String(e)));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto('http://127.0.0.1:4184/scripts/core-texture-gallery.html?view='+view);await p.waitForFunction(()=>window.galleryReady,null,{timeout:60000});
  const result=await p.evaluate(()=>window.coreGallery);assert.ok(result.cases.every(c=>c.icon||c.quads>0));
  for(const q of result.probes)assert.ok(q.green>=8,q.shape+' '+q.angle+' is not entirely grass: '+JSON.stringify(q));
  for(const q of result.timingProbes){assert.ok(q.error<=2,'Incorrect fluid blend or station timing: '+JSON.stringify(q));assert.ok(q.change>0,'Consecutive frames do not animate: '+q.block);}
  for(const q of result.waterProbes){assert.equal(q.error,0,'Water draws extra boundaries: '+JSON.stringify(q));assert.ok(q.visible>100,'Water boundary vanished: '+JSON.stringify(q));}
  for(const q of result.gapProbes){assert.ok(q.checked>1000,'Empty fluid seam check: '+JSON.stringify(q));assert.equal(q.holes,0,'Open fluid seam: '+JSON.stringify(q));}
  if(view==='fluids')for(const kind of ['water','lava'])assert.ok(result.gapProbes.some(q=>q.kind===kind&&q.brokenHoles>0),'Seam check cannot detect the original '+kind+' gap');
  if(view==='animations')for(const block of ['water','lava','lit_furnace','ember_forge','torch','lantern'])assert.ok(new Set(result.cases.filter(c=>c.block===block).map(c=>c.render)).size>=3,'Animation is not playing: '+block);
  result.cases.forEach(c=>delete c.render);results.push(result);await p.screenshot({path:'screenshots/core-textures-'+view+'.png',fullPage:true});await p.close();
 }
 assert.deepEqual(errors,[]);writeFileSync('screenshots/core-texture-checks.json',JSON.stringify(results,null,2));console.log('PASS: '+results.reduce((n,r)=>n+r.cases.length,0)+' actual mesh/icon/animation cases; all six grass cube/slab faces verified from GPU pixels.');
}finally{await browser.close();await server.close();}
