// Optional BENCHMARK_SEED selects the surface fixture; BENCHMARK_PROFILE=1 runs 30 passes for CPU profiling.
// Run sequentially with browser tests idle: node scripts/benchmark.mjs [--assert-generation-budget] [--assert-mesh-budget]
// The worker executes the game's actual pure modules. Region/cold-column/spawn preparation is timed separately.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

if (isMainThread) {
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {workerData:{seed:Number(process.env.BENCHMARK_SEED || 1),profile:process.env.BENCHMARK_PROFILE === '1'}});
    let report;
    worker.once('message', value => { report = value; });
    worker.once('error', reject);
    worker.once('exit', code => {
      if (code !== 0) reject(new Error(`benchmark worker exited ${code}`));
      else if (!report) reject(new Error('benchmark worker exited without measurements'));
      else resolve(report);
    });
  });
  console.log(JSON.stringify(result,null,2));
  // On GitHub Actions the job log is not always retrievable; annotations are readable from the run page and the API,
  // so a red budget names its measured numbers instead of only "exit code 1".
  const onActions = process.env.GITHUB_ACTIONS === 'true';
  const annotate = (level, title, message) => {
    if (onActions) console.log(`::${level} title=${title}::${String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
  };
  const ms = value => (Number.isFinite(value) ? value.toFixed(3) : String(value));
  const passes = summary => `pass means [${summary.passMeansMs.map(ms).join(', ')}] ms, median ${ms(summary.medianMs)} ms, max ${ms(summary.maxMs)} ms`;
  const summary = `${result.runtime}, ${result.surfaceChunks} chunks: meshing mean ${ms(result.meshing.meanMs)} ms (${passes(result.meshing)}); `
    + `generation mean ${ms(result.generation.meanMs)} ms (${passes(result.generation)}); mesh sha256 ${result.meshSha256}`;
  annotate('notice', 'benchmark', summary);
  const overBudget = (summary, budget) => !Number.isFinite(summary.meanMs) || summary.meanMs > budget;
  if (process.argv.includes('--assert-generation-budget') && overBudget(result.generation, 3)) {
    annotate('error', 'generation budget', `${summary}; budget 3 ms`);
    throw new Error(`warm surface chunk generation exceeds 3 ms: mean ${ms(result.generation.meanMs)} ms; ${passes(result.generation)}`);
  }
  if (process.argv.includes('--assert-mesh-budget') && overBudget(result.meshing, 3)) {
    annotate('error', 'mesh budget', `${summary}; budget 3 ms`);
    throw new Error(`surface chunk meshing exceeds 3 ms: mean ${ms(result.meshing.meanMs)} ms; ${passes(result.meshing)}`);
  }
} else {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const vite=await createServer({root,configFile:false,server:{middlewareMode:true},optimizeDeps:{noDiscovery:true}});
  try {
    const {TerrainGenerator}=await vite.ssrLoadModule('/src/world/generator.ts');
    const {Chunk}=await vite.ssrLoadModule('/src/world/chunk.ts');
    const {ClimateSampler}=await vite.ssrLoadModule('/src/world/shape.ts');
    const {simulateRegion,climateHeightSource}=await vite.ssrLoadModule('/src/world/region.ts');
    const {findSpawnColumn}=await vite.ssrLoadModule('/src/world/spawn.ts');
    const {buildChunkMesh}=await vite.ssrLoadModule('/src/render/mesher.ts');
    const {neighborIndex}=await vite.ssrLoadModule('/src/world/light.ts');
    const summary=values=>({samples:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,
      medianMs:[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)],maxMs:Math.max(...values)});
    const timed=fn=>{const t=performance.now();fn();return performance.now()-t;};
    const regions=[];
    for(let x=0;x<3;x++){
      const climate=new ClimateSampler(1337);
      regions.push(timed(()=>simulateRegion(climateHeightSource((x,z)=>climate.fields(x,z)),x,0)));
    }
    const spawns=[];
    for(let seed=1;seed<=30;seed++)spawns.push(timed(()=>findSpawnColumn(new TerrainGenerator(seed))));
    const coldTops=[];
    for(let x=0;x<12;x++){
      const g=new TerrainGenerator(1);
      for(const dx of [-32,32])for(const dz of [-32,32])g.regionAt(x*16+dx,dz); // Warm all regions within feature reach.
      coldTops.push(timed(()=>g.columnTops(x,0)));
    }
    const g=new TerrainGenerator(workerData.seed), chunks=new Map(),tops=new Map();
    const topAt=(x,z)=>{const key=`${x},${z}`;if(!tops.has(key))tops.set(key,g.columnTops(x,z));return tops.get(key);};
    const blockAt=(x,y,z)=>{const key=`${x},${y},${z}`;if(!chunks.has(key)){const c=new Chunk(x,y,z);g.generateChunk(c);chunks.set(key,c.blocks);}return chunks.get(key);};
    const jobs=[];
    for(let z=0;z<5;z++)for(let x=0;x<10;x++){
      const y=Math.floor(topAt(x,z)[8*16+8]/16),n=new Array(27),t=[];
      for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)n[neighborIndex(dx,dy,dz)]=blockAt(x+dx,y+dy,z+dz);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)t.push(topAt(x+dx,z+dz));
      jobs.push({x,y,z,n,t});
    }
    for(const job of jobs.slice(0,10)){g.generateChunk(new Chunk(job.x,job.y,job.z));buildChunkMesh(job.n,job.t,job.y,{seed:workerData.seed,cx:job.x,cz:job.z});}
    const generation=[],meshing=[];const hash=createHash('sha256');
    for(let pass=0;pass<(workerData.profile ? 30 : 3);pass++){
      generation.push(timed(()=>{for(const job of jobs)g.generateChunk(new Chunk(job.x,job.y,job.z));})/jobs.length);
      meshing.push(timed(()=>{for(const job of jobs)buildChunkMesh(job.n,job.t,job.y,{seed:workerData.seed,cx:job.x,cz:job.z});})/jobs.length);
    }
    for(const job of jobs){const mesh=buildChunkMesh(job.n,job.t,job.y,{seed:workerData.seed,cx:job.x,cz:job.z});
      for(const layer of [mesh.solid,mesh.translucent])for(const field of ['positions','uvs','colors','light','indices']){
        const values=layer[field];hash.update(Buffer.from(values.buffer,values.byteOffset,values.byteLength));
      }
    }
    parentPort.postMessage({runtime:process.version,worker:true,seed:workerData.seed,coldColumnSeed:1,regionSeed:1337,surfaceChunks:jobs.length,
      regionSimulation:summary(regions),spawnSearch:summary(spawns),coldColumnTopsWithWarmRegion:summary(coldTops),
      generation:{...summary(generation),meanMs:generation.reduce((a,b)=>a+b,0)/generation.length,passMeansMs:generation},
      meshing:{...summary(meshing),meanMs:meshing.reduce((a,b)=>a+b,0)/meshing.length,passMeansMs:meshing},meshSha256:hash.digest('hex')});
  } finally {await vite.close();}
}
