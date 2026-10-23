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
    const uniforms={uDaylight:{value:1},uWetness:{value:0},uWind:{value:0},uWindTime:{value:0}};
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
    // A near voxel must draw normally, then disappear into the proxy before the load edge.
    // Alpha-test still cuts leaf texels before distance hashing; held items use the full shader.
    const transitionScene=new THREE.Scene();transitionScene.background=new THREE.Color(0x0000ff);
    const transitionGeometry=new THREE.PlaneGeometry(20,20).rotateX(-Math.PI/2);
    transitionGeometry.setAttribute('aLight',new THREE.Float32BufferAttribute([1,0,1,0,1,0,1,0],2));
    const transitionMaterial=new THREE.MeshBasicMaterial({color:0xff0000,alphaTest:0.5,alphaHash:true});
    const fade={value:new THREE.Vector2(180,200)};
    patchLightMaterial(transitionMaterial,uniforms,false,fade);
    const transitionMesh=new THREE.Mesh(transitionGeometry,transitionMaterial);transitionMesh.position.x=160;transitionScene.add(transitionMesh);
    const transitionCamera=new THREE.PerspectiveCamera(30,1,0.1,1000);
    transitionCamera.position.set(0,100,0);transitionCamera.lookAt(160,0,0);
    uniforms.uDaylight.value=1;read(transitionScene,transitionCamera);
    check(center()>200&&pixels[(64*128+64)*4+2]<5,'near voxel did not render before transition');
    fade.value.set(140,150);read(transitionScene,transitionCamera);
    check(center()<5&&pixels[(64*128+64)*4+2]>200,'voxel perimeter did not fade into proxy/background');
    fade.value.set(150,170);read(transitionScene,transitionCamera);
    let redPixels=0,bluePixels=0;
    for(let y=56;y<72;y++)for(let x=56;x<72;x++){
      const i=(y*128+x)*4;if(pixels[i]>200)redPixels++;if(pixels[i+2]>200)bluePixels++;
    }
    check(redPixels>20&&bluePixels>20,`transition is a hard alpha-test cut: ${redPixels}/${bluePixels}`);
    image(transitionScene,transitionCamera,'Hashed voxel/proxy transition');
    fade.value.set(0,0);read(transitionScene,transitionCamera);
    check(center()>200,'voxel-only fallback retained the horizon fade');
    // Wind (T-F5): a swaying quad moves toward +X (screen right here), by 0.2 to 1 block at full wind.
    const swayScene=new THREE.Scene();const swayGeometry=new THREE.PlaneGeometry(0.4,0.4).rotateX(-Math.PI/2);
    swayGeometry.setAttribute('aLight',new THREE.Float32BufferAttribute([1,0,1,0,1,0,1,0],2));
    swayGeometry.setAttribute('aSway',new THREE.Float32BufferAttribute([1,1,1,1],1));
    const swayMaterial=new THREE.MeshBasicMaterial({color:0xffffff});patchLightMaterial(swayMaterial,uniforms,false,undefined,true);
    swayScene.add(new THREE.Mesh(swayGeometry,swayMaterial));camera.position.set(0,2,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
    const litColumn=()=>{let sum=0,n=0;for(let i=0;i<128*128;i++)if(pixels[i*4]>200){sum+=i%128;n++;}return n?sum/n:-1;};
    uniforms.uWind.value=0;read(swayScene,camera);const still=litColumn();
    uniforms.uWind.value=1;uniforms.uWindTime.value=3;read(swayScene,camera);const windy=litColumn();image(swayScene,camera,'Foliage in full wind');
    check(still>60&&still<68&&windy-still>8,`wind sway failed: ${still} -> ${windy}`);
    swayGeometry.dispose();swayMaterial.dispose();
    transitionGeometry.dispose();transitionMaterial.dispose();
    sky.dispose();geometry.dispose();material.dispose();dryMaterial.dispose();target.dispose();renderer.dispose();
    return {still,windy,dry,wet,shelteredDry,shelteredWet,day,night,translated,moonLitPixels:counts};
  });
  if(errors.length)throw Error(errors.join('\n'));
  mkdirSync('screenshots',{recursive:true});await page.screenshot({path:'screenshots/render-regressions.png',fullPage:true});
  console.log(JSON.stringify(results));console.log('RENDER SMOKE PASSED');
}finally{await browser?.close();await server.close();}
