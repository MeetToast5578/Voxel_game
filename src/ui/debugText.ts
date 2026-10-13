/** The fields the debug overlay shows (a subset of Game.debugState()). */
export interface DebugInfo {
  fps: number;
  seed: number;
  position: number[];
  yaw: number;
  pitch: number;
  onGround: boolean;
  flying: boolean;
  target: number[] | null;
  targetName: string | null;
  selectedBlock: string;
  loaded: number;
  meshed: number;
  pendingGen: number;
  pendingMesh: number;
  renderDistance: number;
}

/** Compass name for a yaw angle. Yaw 0 looks north (-Z); positive yaw turns toward west (-X). */
export function compassDirection(yaw: number): 'north' | 'west' | 'south' | 'east' {
  const turns = Math.round(yaw / (Math.PI / 2));
  const index = ((turns % 4) + 4) % 4;
  return (['north', 'west', 'south', 'east'] as const)[index]!;
}

/** Lines of text for the F3 overlay. Pure, so it can be unit-tested. */
export function formatDebugLines(info: DebugInfo): string[] {
  const [x = 0, y = 0, z = 0] = info.position;
  const bx = Math.floor(x);
  const by = Math.floor(y);
  const bz = Math.floor(z);
  const yes = (b: boolean) => (b ? 'yes' : 'no');
  return [
    `FPS ${info.fps}`,
    `XYZ ${x.toFixed(2)} / ${y.toFixed(2)} / ${z.toFixed(2)}`,
    `Block ${bx} ${by} ${bz}   Chunk ${Math.floor(bx / 16)} ${Math.floor(bz / 16)}`,
    `Facing ${compassDirection(info.yaw)} (yaw ${info.yaw.toFixed(2)}, pitch ${info.pitch.toFixed(2)})`,
    `Target ${info.target ? `${info.targetName} @ ${info.target.join(' ')}` : 'none'}`,
    `Selected ${info.selectedBlock}`,
    `On ground ${yes(info.onGround)}   Flying ${yes(info.flying)}`,
    `Chunks loaded ${info.loaded}  meshed ${info.meshed}  pending ${info.pendingGen}/${info.pendingMesh}`,
    `Render distance ${info.renderDistance}   Seed ${info.seed}`,
  ];
}
