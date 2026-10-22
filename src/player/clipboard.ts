import { CLIPBOARD_MAX_CELLS, CLIPBOARD_MAX_EDGE } from '../config';
import { BlockId } from '../world/blocks';
import type { EditCell } from '../world/editQueue';
import type { Cell, Box } from './volumes';

interface CopySource { isLoadedAt(x:number,y:number,z:number):boolean; getBlock(x:number,y:number,z:number):number; }
/** Session-only snapshot, independent of later source edits. Air is omitted; paste never clears existing builds. */
export class BuildClipboard {
  private first: Cell | null = null;
  private blocks: { x:number;y:number;z:number;id:number }[] = [];
  private size: Cell | null = null;
  status = 'Ctrl/Cmd+C: choose two corners; Ctrl/Cmd+V: paste';
  get count(): number { return this.blocks.length; }
  get anchor(): Cell | null { return this.first ? {...this.first} : null; }
  cancel(): void { this.first = null; this.status = this.count ? `${this.count} blocks copied; Ctrl/Cmd+V to paste` : 'Copy selection cancelled'; }
  select(cell: Cell, world: CopySource): boolean {
    if (![cell.x,cell.y,cell.z].every(Number.isSafeInteger)) return false;
    if (!this.first) { this.first = {...cell}; this.status = 'First corner set; Ctrl/Cmd+C on the opposite corner'; return true; }
    const box:Box={min:{x:Math.min(cell.x,this.first.x),y:Math.min(cell.y,this.first.y),z:Math.min(cell.z,this.first.z)},
      max:{x:Math.max(cell.x,this.first.x),y:Math.max(cell.y,this.first.y),z:Math.max(cell.z,this.first.z)}};
    const size={x:box.max.x-box.min.x+1,y:box.max.y-box.min.y+1,z:box.max.z-box.min.z+1};
    if (Math.max(size.x,size.y,size.z)>CLIPBOARD_MAX_EDGE || size.x*size.y*size.z>CLIPBOARD_MAX_CELLS) {
      this.status=`Selection exceeds ${CLIPBOARD_MAX_EDGE} blocks per side`; return false;
    }
    const blocks:typeof this.blocks=[];
    for(let y=box.min.y;y<=box.max.y;y++)for(let z=box.min.z;z<=box.max.z;z++)for(let x=box.min.x;x<=box.max.x;x++) {
      if(!world.isLoadedAt(x,y,z)) {this.status='Selection contains unloaded terrain; move closer and retry';return false;}
      const id=world.getBlock(x,y,z);
      if(id!==BlockId.AIR)blocks.push({x:x-box.min.x,y:y-box.min.y,z:z-box.min.z,id});
    }
    this.blocks=blocks;this.size=size;this.first=null;
    this.status=`${blocks.length} blocks copied (${size.x}×${size.y}×${size.z}); Ctrl/Cmd+V to paste`;
    return true;
  }
  preview(cell:Cell):Box|null {
    if(!this.first)return null;
    const a=this.first,min={x:Math.min(a.x,cell.x),y:Math.min(a.y,cell.y),z:Math.min(a.z,cell.z)},max={x:Math.max(a.x,cell.x),y:Math.max(a.y,cell.y),z:Math.max(a.z,cell.z)};
    return Math.max(max.x-min.x,max.y-min.y,max.z-min.z)<CLIPBOARD_MAX_EDGE ? {min,max} : null;
  }
  paste(origin:Cell): EditCell[] {
    return this.blocks.map(c=>({x:origin.x+c.x,y:origin.y+c.y,z:origin.z+c.z,id:c.id,clear:false}));
  }
  bounds(origin:Cell): Box | null {
    return this.size ? {min:{...origin},max:{x:origin.x+this.size.x-1,y:origin.y+this.size.y-1,z:origin.z+this.size.z-1}} : null;
  }
}
