import { BLOCK_SIZE_M, LIGHTNING_FAR_M, LIGHTNING_MEAN_INTERVAL_S, LIGHTNING_NEAR_M, SOUND_SPEED_M_S, WEATHER_SAMPLE_S } from '../config';
import { columnIndex, localIndex, toChunk, toLocal } from '../core/coords';
import { BLOCKS } from '../engine/blocks';
import type { World } from '../engine/world';
import type { Atmosphere } from '../render/renderer';
import { Clock } from './clock';
import { climateTemperature, WeatherModel, type WeatherSample } from './weather';

/**
 * Time, weather and what they look like at the player: sun and moon, cloud cover easing between weather samples,
 * lightning in storms, and how far under ground the camera is (from the sky light where it stands).
 */
export class Environment {
  readonly clock: Clock;
  readonly weather: WeatherModel;
  sample: WeatherSample | null = null;
  private cloud = 0;
  private underground = 0;
  private flash = 0;
  private sinceSample = Infinity;
  private thunderIn = -1;
  readonly atmosphere: Atmosphere = {
    sun: [0, 1, 0], moonPhase: 0, cloudCover: 0, underground: 0, underwater: false, flash: 0, autumn: 0, summer: 0, starAngle: 0,
  };

  /**
   * `onThunder` plays the thunder of a strike; `onStrike` gets where it landed (cell x, z) the moment it flashes.
   */
  constructor(seed: number, dayTime: number, yearTime: number, private readonly onThunder: () => void = () => undefined,
    private readonly onStrike: (x: number, z: number) => void = () => undefined, private readonly rand: () => number = Math.random) {
    this.clock = new Clock(dayTime, yearTime);
    this.weather = new WeatherModel(seed);
  }

  /** Advances game time; call at the fixed update rate. */
  tick(dt: number): void {
    this.clock.advance(dt);
  }

  /** Updates the look of the sky for a frame, for a camera at cell (x, y, z). */
  frame(dt: number, x: number, y: number, z: number, world: World): Atmosphere {
    const column = world.column(toChunk(Math.floor(x)), toChunk(Math.floor(z)));
    this.sinceSample += dt;
    if (this.sinceSample >= WEATHER_SAMPLE_S && column) {
      this.sinceSample = 0;
      const climate = climateTemperature(column.climate[columnIndex(toLocal(Math.floor(x)), toLocal(Math.floor(z)))]!);
      this.sample = this.weather.sample(x * BLOCK_SIZE_M, z * BLOCK_SIZE_M, this.clock.yearTime, climate, y * BLOCK_SIZE_M);
    }
    const s = this.sample;
    const ease = Math.min(1, dt / 4);
    this.cloud += ((s?.cloudCover ?? 0) - this.cloud) * ease;
    // Under ground: the sky light where the camera is tells how open the sky is.
    const chunk = world.chunkAt(Math.floor(x), Math.floor(y), Math.floor(z));
    const cell = localIndex(toLocal(Math.floor(x)), toLocal(Math.floor(y)), toLocal(Math.floor(z)));
    const sky = chunk ? chunk.skyLight(cell) : 15;
    this.atmosphere.underwater = chunk !== undefined && BLOCKS.types[BLOCKS.typeIndex[chunk.get(cell)]!]!.layer === 'water';
    const target = Math.min(1, Math.max(0, (10 - sky) / 8));
    this.underground += (target - this.underground) * Math.min(1, dt * 2);
    // Lightning: strikes around the player in storms, mostly far off; near ones flash brighter and thunder sooner.
    this.flash = Math.max(0, this.flash - dt * 4);
    if (s?.storm && this.rand() < dt / LIGHTNING_MEAN_INTERVAL_S) {
      const d = LIGHTNING_NEAR_M + (LIGHTNING_FAR_M - LIGHTNING_NEAR_M) * this.rand() ** 2, angle = this.rand() * Math.PI * 2;
      this.flash = Math.max(this.flash, 1 - 0.6 * (d / LIGHTNING_FAR_M));
      this.thunderIn = d / SOUND_SPEED_M_S;
      this.onStrike(x + (Math.cos(angle) * d) / BLOCK_SIZE_M, z + (Math.sin(angle) * d) / BLOCK_SIZE_M);
    }
    if (this.thunderIn > 0 && (this.thunderIn -= dt) <= 0) this.onThunder();
    const a = this.atmosphere;
    this.clock.sunDirection(a.sun);
    a.moonPhase = this.clock.moonPhase;
    a.cloudCover = this.cloud;
    a.underground = this.underground;
    a.flash = this.flash * (1 - this.underground);
    const f = this.clock.foliage();
    a.autumn = f.autumn;
    a.summer = f.summer;
    a.starAngle = this.clock.dayTime * Math.PI * 2;
    return a;
  }

  /** What falls at the player now: rain or snow (sleet shows as rain), or nothing. */
  get falling(): 'none' | 'rain' | 'snow' {
    const p = this.sample?.precipitation ?? 'none';
    return p === 'none' ? 'none' : p === 'snow' ? 'snow' : 'rain';
  }
}
