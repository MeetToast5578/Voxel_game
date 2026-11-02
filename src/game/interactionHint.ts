import { BLOCKS } from '../engine/blocks';
const actions:Readonly<Record<string,string>>={chest:'Open chest',ancient_chest:'Open ancient chest',furnace:'Open furnace',lit_furnace:'Open furnace',crafting_table:'Craft',door:'Open / close',bed:'Set spawn / sleep',trading_post:'Trade',ember_forge:'Upgrade equipment',sign:'Edit sign',item_frame:'Display / take item',beacon:'Light beacon'};
/** Uses the same reachable target as block interaction. No prompt for unsupported actions. */
export function blockInteractionHint(state:number, placement?:{crouchKey:string;crouching:boolean}):string {
 const t=BLOCKS.type(state),action=actions[t.key];
 if(placement?.crouching)return `${t.name} · Right click: Place held block`;
 const hint=action?`${t.name} · Right click: ${action}`:t.key==='campfire'?'Campfire · Hold raw food to cook':t.name;
 return action&&placement?`${hint} · ${placement.crouchKey}+Right click: Place`:hint;
}
