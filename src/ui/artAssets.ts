const urls = import.meta.glob<string>('../../assets/woodland-ember/expansion/tiles/{ui,future,hands}/*.png', { eager:true,query:'?url',import:'default' });
export function artUrl(group:'ui'|'future'|'hands',name:string):string {
  const url=urls[`../../assets/woodland-ember/expansion/tiles/${group}/${name}.png`];
  if(!url)throw new Error(`Missing UI artwork ${group}/${name}`);
  return url;
}
/** Set CSS URLs once; nine-slice borders preserve corners while menus resize. */
export function installAeroTheme():void {
  for(const [token,asset] of Object.entries({panel:'panel_navy',slot:'slot_normal',selected:'slot_selected',hover:'slot_hover',button:'button_normal',buttonHover:'button_hover',toast:'panel_toast',tip:'panel_tooltip'}))
    document.documentElement.style.setProperty(`--aero-${token}`,`url("${artUrl('ui',asset)}")`);
}
