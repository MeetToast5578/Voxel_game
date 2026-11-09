// Runtime subsets and aliases: keep source sheets independent of gameplay registry names.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const root='assets/woodland-ember/expansion/';
const load=n=>JSON.parse(readFileSync(root+n+'.json','utf8'));
const trees=load('trees'),hands=load('hands'),future=load('future'),skins=load('creatures'),effects=load('effects');
function crop(tile,x,y,w,h,inputSize=32){
 const source=Buffer.from(tile.indices,'base64'),indices=Buffer.alloc(2048);
 for(let j=0;j<32;j++)for(let i=0;i<32;i++)indices.writeUInt16LE(source.readUInt16LE(((y+Math.floor(j*h/32))*inputSize+x+Math.floor(i*w/32))*2),(j*32+i)*2);
 return {palette:tile.palette,indices:indices.toString('base64')};
}
for(const name of ['pine','acacia','jungle_giant','palm'])trees[name+'_sapling']=crop(hands[name+'_sapling'],0,0,64,64,64);
for(const [key,art] of [['desert_stalker','desert_monster'],['swamp_hollow','swamp_monster'],['snow_prowler','snow_monster']])for(const part of ['body','face','legs'])skins[key+'_'+part]=future[art+'_'+part];
skins.trader_body=skins.skulker_body;skins.trader_legs=skins.skulker_legs;skins.trader_face=crop(future.map_trader,4,0,24,24);
const refined='assets/woodland-ember/refinement/creatures.json';
if(existsSync(refined))Object.assign(skins,JSON.parse(readFileSync(refined,'utf8')));
const workshops={};for(const key of ['village_sign','ember_forge','ember_forge_top','sign','frame_empty','trade_coin','ember_pickaxe','ember_chestplate'])workshops[key]=future[key];
for(const [file,data] of Object.entries({treeArt:trees,workshopArt:workshops,effectArt:Object.fromEntries(Object.entries(effects).filter(([k])=>!k.startsWith('water_')&&!k.startsWith('lava_')))}))writeFileSync(`src/render/${file}.json`,JSON.stringify(data));
console.log('Runtime trees, mobs, workshops and effects exported.');
