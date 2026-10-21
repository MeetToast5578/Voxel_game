// GPU regressions for weather lighting, lunar phases and the sky. No game save or external service is used.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server=await createServer({cacheDir:process.env.RENDER_SMOKE_CACHE_DIR,plugins:[{
  name:'render-smoke-three',
  resolveId(id){if(id==='virtual:render-smoke-three')return '\0virtual:render-smoke-three';},
  load(id){if(id==='\0virtual:render-smoke-three')return "export * from 'three';";},
}],server:{host:'127.0.0.1',port:5174,strictPort:true},logLevel:'warn'});
await server.listen();
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,
    args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1000,height:600}});
  await page.route('**/favicon.ico', route => route.fulfill({status:204}));
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  // Navigate to a source resource to establish the origin without starting a game or its worker pool.
  await page.goto('http://127.0.0.1:5174/src/config.ts');
  const results=await page.evaluate(async()=>{
    const {Sky}=await import('/src/render/sky.ts');
    const {Horizon}=await import('/src/render/horizon.ts');
    const THREE=await import('/@id/__x00__virtual:render-smoke-three');
    const {patchLightMaterial}=await import('/src/render/lightMaterial.ts');
    document.body.replaceChildren();document.body.style.cssText='background:#18222a;color:white;font:16px sans-serif;margin:20px';
    const output=document.createElement('div');output.style.cssText='display:flex;gap:16px;flex-wrap:wrap';document.body.append(output);
    const renderer=new THREE.WebGLRenderer({preserveDrawingBuffer:true});renderer.setSize(128,128);renderer.setClearColor(0);
    const target=new THREE.WebGLRenderTarget(128,128);const pixels=new Uint8Array(128*128*4);
    const camera=new THREE.OrthographicCamera(-1.2,1.2,1.2,-1.2,0.1,2000);
    const uniforms={uDaylight:{value:1},uWetness:{value:0}};
    const check=(condition,message)=>{if(!condition)throw Error(message);};
    const image=(scene,camera,label)=>{
      renderer.setRenderTarget(null);renderer.render(scene,camera);
      const panel=document.createElement('div');const img=document.createElement('img');img.src=renderer.domElement.toDataURL();img.width=128;panel.textContent=label;panel.append(document.createElement('br'),img);output.append(panel);
    };
    const read=(scene,camera)=>{renderer.setRenderTarget(target);renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,128,128,pixels);};
    const scene=new THREE.Scene();
    const geometry=new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2);
    geometry.deleteAttribute('normal'); // Actual chunk meshes have no normals; wet shading must work without them.
    const light=new THREE.Float32BufferAttribute([1,0,1,0,1,0,1,0],2);geometry.setAttribute('aLight',light);
    const material=new THREE.MeshBasicMaterial({color:0xffffff});patchLightMaterial(material,uniforms,true);
    const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);camera.position.set(0,2,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
    const center=()=>pixels[(64*128+64)*4];
    read(scene,camera);const dry=center();image(scene,camera,'Dry exposed top');
    uniforms.uWetness.value=1;read(scene,camera);const wet=center();image(scene,camera,'Wet exposed top');
    check(wet<dry*0.9&&wet>dry*0.5,`wet exposure failed: ${dry} -> ${wet}`);
    light.array.set([0.5,0,0.5,0,0.5,0,0.5,0]);light.needsUpdate=true;
    uniforms.uWetness.value=0;read(scene,camera);const shelteredDry=center();
    uniforms.uWetness.value=1;read(scene,camera);const shelteredWet=center();
    check(shelteredWet===shelteredDry,'rain darkened a sheltered top');
    light.array.set([1,0,1,0,1,0,1,0]);light.needsUpdate=true;
    const dryMaterial=new THREE.MeshBasicMaterial({color:0xffffff});patchLightMaterial(dryMaterial,uniforms,false);mesh.material=dryMaterial;
    read(scene,camera);check(center()===dry,'non-wettable item/water material was darkened or reused the wrong shader');
    const skyScene=new THREE.Scene();const sky=new Sky(skyScene);const skyCamera=new THREE.PerspectiveCamera(60,1,0.1,2000);
    skyCamera.lookAt(0,500,-500);
    // Sky colour must follow the day clock, and must not depend on distance from the world origin.
    const dome=skyScene.children[0];const other=skyScene.children.slice(1);other.forEach(o=>skyScene.remove(o));
    const mean=()=>{let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=pixels[i]+pixels[i+1]+pixels[i+2];return sum/(128*128*3);};
    sky.update(0.25,0,skyCamera);read(skyScene,skyCamera);const day=mean();image(skyScene,skyCamera,'Noon sky');
    skyCamera.position.set(4000,800,-2000);skyCamera.lookAt(4000,1300,-2500);sky.update(0.25,0,skyCamera);read(skyScene,skyCamera);const translated=mean();
    check(Math.abs(day-translated)<1,`sky changed with world position: ${day}, ${translated}`);
    sky.update(0.75,0,skyCamera);read(skyScene,skyCamera);const night=mean();image(skyScene,skyCamera,'Midnight sky');
    check(day>night*3,`day/night sky contrast failed: ${day}, ${night}`);
    skyScene.remove(dome);const moon=other[1];skyScene.add(moon);
    skyCamera.position.set(0,0,0);skyCamera.fov=1;skyCamera.updateProjectionMatrix();
    const counts=[];
    for(const phase of [0,0.25,0.5,0.75]){
      sky.update(0.75,phase/4,skyCamera);skyCamera.lookAt(moon.position);read(skyScene,skyCamera);
      let lit=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>80)lit++;counts.push(lit);image(skyScene,skyCamera,`Moon ${phase}`);
    }
    check(counts[0]===0&&counts[2]>1000,`new/full moon failed: ${counts}`);
    check(counts[1]>counts[2]*0.4&&counts[1]<counts[2]*0.6&&Math.abs(counts[1]-counts[3])<30,`quarter moons failed: ${counts}`);
    // A proxy can be higher than the true terrain. It must never cover nearby voxel geometry.
    const terrainScene=new THREE.Scene(), horizon=new Horizon(terrainScene,1,false);
    horizon.setData({positions:new Float32Array([159,1,-1,159,1,1,161,1,-1,161,1,1]),
      colors:new Float32Array([1,0,0,1,0,0,1,0,0,1,0,0]), indices:new Uint32Array([0,1,2,2,1,3]),
      centerX:0,centerZ:0,inner:0,overlap:16,radius:8192});
    horizon.update(0,0,8,true);
    camera.position.set(160,10,0);camera.up.set(0,0,-1);camera.lookAt(160,0,0);
    read(terrainScene,camera);
    check(pixels[(64*128+64)*4]>200,'horizon fixture was not rendered');
    const realGround=new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0x0000ff}));
    realGround.position.set(160,0,0);terrainScene.add(realGround);read(terrainScene,camera);
    check(pixels[(64*128+64)*4+2]>200&&pixels[(64*128+64)*4]<5,'coarse horizon occluded true voxel terrain');
    image(terrainScene,camera,'True terrain wins over higher horizon proxy');
    sky.dispose();geometry.dispose();material.dispose();dryMaterial.dispose();target.dispose();renderer.dispose();
    return {dry,wet,shelteredDry,shelteredWet,day,night,translated,moonLitPixels:counts};
  });
  if(errors.length)throw Error(errors.join('\n'));
  mkdirSync('screenshots',{recursive:true});await page.screenshot({path:'screenshots/render-regressions.png',fullPage:true});
  console.log(JSON.stringify(results));console.log('RENDER SMOKE PASSED');
}finally{await browser?.close();await server.close();}
