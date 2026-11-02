import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../assets/woodland-ember/expansion/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
let count=0;
for(const [group,sheet] of Object.entries(manifest)){
 const pack=JSON.parse(readFileSync(new URL(`${group}.json`,root),'utf8'));
 assert.deepEqual(Object.keys(pack),sheet.names);
 assert.equal(sheet.names.length,sheet.columns*sheet.rows);
 for(const name of sheet.names){
  const path=new URL(`tiles/${group}/${name}.png`,root);
  assert.ok(existsSync(path),name);
  const png=readFileSync(path);assert.equal(png.readUInt32BE(16),sheet.size,name);assert.equal(png.readUInt32BE(20),sheet.size,name);
  const t=pack[name],b=Buffer.from(t.indices,'base64');assert.equal(b.length,sheet.size**2*2,name);
  for(let i=0;i<b.length;i+=2)assert.ok(b.readUInt16LE(i)*4+3<t.palette.length,name);
  count++;
 }
}
assert.equal(count,336);console.log('PASS: 336 named PNGs, grids, dimensions and packed palette indices.');
