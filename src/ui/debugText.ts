import { BLOCK_SIZE_M, CHUNK_SIZE, SEA_LEVEL } from '../config';

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
  columns: number;
  jobsInFlight: number;
  tickRan: number;
  tickPending: number;
  randomTickRan: number;
  randomTickMs: number;
  biome: string;
  temperatureC: number;
  precipitationMm: number;
  weather: string;
  season: string;
  dayOfSeason: number;
  dayLengthMin: number;
  renderDistance: number;
}

/** Compass name for a yaw angle. Yaw 0 looks north (-Z); positive yaw turns toward west (-X). */
export function compassDirection(yaw: number): 'north' | 'west' | 'south' | 'east' {
  const turns = Math.round(yaw / (Math.PI / 2));
  const index = ((turns % 4) + 4) % 4;
  return (['north', 'west', 'south', 'east'] as const)[index]!;
}

/** Meters rounded to 0.1, without a "-0.0". */
function meters(blocks: number): string {
  return (Math.round(blocks * BLOCK_SIZE_M * 10) / 10 + 0).toFixed(1);
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
    `Block ${bx} ${by} ${bz}   Chunk ${Math.floor(bx / CHUNK_SIZE)}, ${Math.floor(by / CHUNK_SIZE)}, ${Math.floor(bz / CHUNK_SIZE)}`,
    `Meters ${meters(x)} / ${meters(y)} / ${meters(z)}   Elevation ${meters(y - SEA_LEVEL)} m`,
    `Facing ${compassDirection(info.yaw)} (yaw ${info.yaw.toFixed(2)}, pitch ${info.pitch.toFixed(2)})`,
    `Target ${info.target ? `${info.targetName} @ ${info.target.join(' ')}` : 'none'}`,
    `Biome ${info.biome}   Temperature ${info.temperatureC} °C   Rain ${info.precipitationMm} mm a year`,
    `Season ${info.season}, day ${info.dayOfSeason}   Weather ${info.weather}`,
    `Selected ${info.selectedBlock}`,
    `On ground ${yes(info.onGround)}   Flying ${yes(info.flying)}`,
    `Chunks loaded ${info.loaded}  meshed ${info.meshed}  pending ${info.pendingGen}/${info.pendingMesh}`,
    `Columns ${info.columns}   Jobs in flight ${info.jobsInFlight}`,
    `Ticks ran ${info.tickRan}  pending ${info.tickPending}`,
    `Random ticks ${info.randomTickRan}  (${info.randomTickMs.toFixed(2)} ms)`,
    `Render distance ${info.renderDistance}   Seed ${info.seed}`,
  ];
}
