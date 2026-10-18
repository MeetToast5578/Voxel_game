import { FOG_HUMIDITY_HAZE, FOG_VALLEY_DEPTH_M, FOG_VALLEY_STRENGTH } from '../config';
import { clamp } from '../core/math';
import { smoothstep } from './time';

/** Humidity haze all day, with denser fog in low ground around sunrise (t=0). */
export function atmosphericFogStrength(timeOfDay: number, humidity: number, valleyDepthM: number): number {
  const t=((timeOfDay % 1)+1)%1;
  const dawnDistance=Math.min(t,1-t);
  const dawn=1-smoothstep(0.02,0.12,dawnDistance);
  const valley=clamp(valleyDepthM/FOG_VALLEY_DEPTH_M,0,1);
  return clamp(humidity,0,1)*(FOG_HUMIDITY_HAZE+FOG_VALLEY_STRENGTH*dawn*valley);
}
