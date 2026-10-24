import { clamp } from '../core/math';
import { MIN_RENDER_DISTANCE } from '../config';

const FAST_FRAME_S = 1 / 60;
const SLOW_FRAME_S = 1 / 30;
/** Chunk work never drops below this share of its budget, so the world still loads on slow machines. */
export const MIN_WORK_SHARE = 0.5;

/**
 * T-J6: the share of the generation and mesh budgets a frame can spend, from the smoothed frame time: all of it at
 * 60 fps, falling to MIN_WORK_SHARE at 30 fps or slower, so loading does not make a slow frame slower still.
 */
export function chunkWorkShare(frameS: number): number {
  return clamp(1 - ((frameS - FAST_FRAME_S) / (SLOW_FRAME_S - FAST_FRAME_S)) * (1 - MIN_WORK_SHARE), MIN_WORK_SHARE, 1);
}

/**
 * T-J6 memory cap: the render distance to use next. Over `cap` loaded chunks it steps one chunk closer; once well
 * under (RECOVER of the cap) it steps back toward the chosen distance. Never below MIN_RENDER_DISTANCE.
 */
export function cappedRenderDistance(current: number, chosen: number, loadedChunks: number, cap: number): number {
  if (loadedChunks > cap) return Math.max(MIN_RENDER_DISTANCE, current - 1);
  if (current < chosen && loadedChunks < cap * RECOVER) return current + 1;
  return Math.min(current, chosen);
}
const RECOVER = 0.6;
