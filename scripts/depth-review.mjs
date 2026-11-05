import {readFileSync,writeFileSync} from 'node:fs';
const root='assets/woodland-ember/depth-review',json=p=>JSON.parse(readFileSync(p,'utf8'));
const before=json(root+'/before-hashes.json'),primary=json(root+'/repainted-materials.json');
const index=[...json('assets/woodland-ember/core-rework/texture-index.json'),...json('assets/woodland-ember/rework/texture-index.json')];
const changed=index.filter(e=>before[e.name]!==e.pixelSha256);
const result={version:'0.6.7',repaintedMaterials:primary.length,changedRuntimeExports:changed.length,retainedRuntimeExports:index.length-changed.length,
 materials:primary,changed:changed.map(e=>({name:e.name,source:e.source,derivedFrom:e.derivedFrom??null,before:before[e.name],after:e.pixelSha256})),
 retained:index.filter(e=>before[e.name]===e.pixelSha256).map(e=>e.name)};
writeFileSync(root+'/review.json',JSON.stringify(result,null,2)+'\n');
console.log(`Depth review: ${primary.length} repainted materials, ${changed.length} changed runtime exports, ${result.retainedRuntimeExports} retained exports.`);
