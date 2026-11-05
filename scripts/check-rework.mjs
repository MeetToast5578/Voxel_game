import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../assets/woodland-ember/rework/',import.meta.url);
const json=url=>JSON.parse(readFileSync(url,'utf8'));
const manifest=json(new URL('manifest.json',root)),index=json(new URL('texture-index.json',root)),packed=json(new URL('textures.json',root));
assert.deepEqual(packed,json(new URL('../src/render/reworkArt.json',import.meta.url)));
assert.deepEqual(Object.keys(packed).sort(),index.map(e=>e.name).sort());
assert.deepEqual(readdirSync(new URL('tiles/',root)).sort(),index.map(e=>e.file.slice(6)).sort());
for(const e of manifest.crops){
  const [x,y,w,h]=e.sourceRect,[width,height]=e.sourceDimensions;
  assert.ok(w>0&&h>0&&x>=0&&y>=0&&x+w<=width&&y+h<=height,e.name);
  const source=manifest.sources.find(s=>s.file===e.source);assert.ok(source,e.name);
  assert.equal(source.names[e.cell],e.name);
  if(source.names.length>1){
    const cw=width/source.cols,ch=height/source.rows,col=e.cell%source.cols,row=Math.floor(e.cell/source.cols);
    assert.ok(x>=col*cw+2&&y>=row*ch+2&&x+w<=(col+1)*cw-2&&y+h<=(row+1)*ch-2,'Source cell bleed: '+e.name);
  }
}
for(const e of index){
  const png=readFileSync(new URL(e.file,root));assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[32,32],e.name);
  const tile=packed[e.name],indices=Buffer.from(tile.indices,'base64'),pixels=Buffer.alloc(4096);
  assert.equal(indices.length,2048,e.name);
  for(let i=0;i<1024;i++){
    const p=indices.readUInt16LE(i*2)*4;assert.ok(p+3<tile.palette.length,e.name);
    for(let c=0;c<4;c++)pixels[i*4+c]=tile.palette[p+c];
  }
  assert.equal(createHash('sha256').update(pixels).digest('hex'),e.pixelSha256,e.name);
}
console.log(`Rework: ${manifest.sources.length} source images; ${manifest.crops.length} measured separated assets; ${index.length} runtime PNGs; ${manifest.animations.length} bound loops.`);
