import {createServer} from 'vite';
import {readFileSync,writeFileSync} from 'node:fs';
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true}});
try{
 const {TILE_NAMES}=await vite.ssrLoadModule('/src/render/tilePixels.ts');
 const {BLOCKS}=await vite.ssrLoadModule('/src/engine/blocks.ts');
 const json=f=>JSON.parse(readFileSync(f,'utf8'));
 const core=json('assets/woodland-ember/core-rework/texture-index.json'),full=json('assets/woodland-ember/rework/texture-index.json');
 const updated=new Set([...core,...full].map(e=>e.name));
 const coverage={runtimeLayers:TILE_NAMES.length,reworkedLayers:TILE_NAMES.filter(n=>updated.has(n)).length,
  preservedLayers:TILE_NAMES.filter(n=>!updated.has(n)),
  expandedPack:{sourceImages:json('assets/woodland-ember/rework/manifest.json').sources.length,baseTiles:full.filter(e=>!e.derivedFrom).length,derivedExports:full.filter(e=>e.derivedFrom).length},
  types:BLOCKS.types.filter(t=>t.layer!=='none').map(t=>{
   const names=[...new Set(t.variantTiles??[...Object.values(t.tiles),...(t.front?[t.front]:[]),...(t.variantFaces?.flatMap(Object.values)??[])])];
   return{key:t.key,states:t.variants,item:!!t.item,shape:t.shape,tiles:names,reworked:names.every(n=>updated.has(n))};
  })};
 writeFileSync('assets/woodland-ember/rework/coverage.json',JSON.stringify(coverage,null,2)+'\n');
 console.log(JSON.stringify({layers:coverage.runtimeLayers,reworked:coverage.reworkedLayers,preserved:coverage.preservedLayers,types:coverage.types.length,fullyCoveredTypes:coverage.types.filter(t=>t.reworked).length,expandedPack:coverage.expandedPack},null,2));
}finally{await vite.close();}
