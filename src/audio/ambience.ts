import type { Sounds } from './sounds';

/** What the ambience listens to, each frame. */
export interface Surroundings {
  /** 0..1: how exposed to the wind (out in the open, high up). */
  wind: number;
  /** 0..1: rain falling on or near the player (not under a roof). */
  rain: number;
  /** 0..1: running or still water close by. */
  water: number;
  underground: boolean;
  day: boolean;
  /** Plants around (forest, grassland): birds by day, insects at night. */
  wildlife: boolean;
}

/** A looping noise layer: filtered noise through a gain that eases toward a target. */
interface Layer {
  gain: GainNode;
}

const PENTATONIC_MAJOR = [0, 2, 4, 7, 9];
const PENTATONIC_MINOR = [0, 3, 5, 7, 10];

/**
 * Sound of the place: wind, rain, water, cave drips, birds and insects, and now and then a short generated piece of
 * music (calm up top, darker under ground). Everything is synthesised; there are no audio files.
 */
export class Ambience {
  private layers: Record<'wind' | 'rain' | 'water', Layer> | null = null;
  /** Seconds until the next bird call, insect trill or drip, and until the next piece of music. */
  private nextCritter = 2;
  private nextMusic = 30;
  musicVolume = 0.5;

  constructor(private readonly sounds: Sounds) {}

  private build(ctx: AudioContext, noise: AudioBuffer): Record<'wind' | 'rain' | 'water', Layer> {
    const layer = (type: BiquadFilterType, frequency: number, q = 1): Layer => {
      const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      src.buffer = noise;
      src.loop = true;
      src.playbackRate.value = 0.7 + Math.random() * 0.3;
      filter.type = type;
      filter.frequency.value = frequency;
      filter.Q.value = q;
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
      return { gain };
    };
    return { wind: layer('lowpass', 420, 0.7), rain: layer('highpass', 2500), water: layer('bandpass', 900, 0.6) };
  }

  update(dt: number, s: Surroundings): void {
    const r = this.sounds.running;
    if (!r) return;
    this.layers ??= this.build(r.ctx, r.noise);
    const v = this.sounds.volume, t = r.ctx.currentTime;
    this.layers.wind.gain.gain.setTargetAtTime(0.06 * s.wind * v, t, 0.8);
    this.layers.rain.gain.gain.setTargetAtTime(0.05 * s.rain * v, t, 0.5);
    this.layers.water.gain.gain.setTargetAtTime(0.05 * s.water * v, t, 0.5);
    if ((this.nextCritter -= dt) <= 0) {
      this.nextCritter = 1.5 + Math.random() * 5;
      if (s.underground) this.drip();
      else if (s.wildlife && s.day) this.bird();
      else if (s.wildlife) this.insect();
    }
    if ((this.nextMusic -= dt) <= 0) {
      this.nextMusic = 150 + Math.random() * 180;
      this.music(s.underground);
    }
  }

  private tone(freq: number, start: number, duration: number, volume: number, type: OscillatorType = 'sine', slide = 1): void {
    const r = this.sounds.running;
    if (!r) return;
    const t = r.ctx.currentTime + start, osc = r.ctx.createOscillator(), gain = r.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + Math.min(0.05, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(r.ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private bird(): void {
    const base = 1800 + Math.random() * 1600, v = 0.03 * this.sounds.volume;
    for (let k = 0, n = 2 + Math.floor(Math.random() * 4); k < n; k++) this.tone(base * (1 + Math.random() * 0.3), k * 0.12, 0.09, v, 'sine', 1.3);
  }

  private insect(): void {
    const v = 0.012 * this.sounds.volume;
    for (let k = 0; k < 8; k++) this.tone(4200 + Math.random() * 300, k * 0.05, 0.03, v, 'square');
  }

  private drip(): void {
    this.tone(900 + Math.random() * 700, 0, 0.15, 0.04 * this.sounds.volume, 'sine', 0.5);
  }

  /** A short piece: a slow melody over a held low note, on a pentatonic scale. */
  private music(dark: boolean): void {
    if (this.musicVolume <= 0) return;
    const root = dark ? 110 : 196, scale = dark ? PENTATONIC_MINOR : PENTATONIC_MAJOR, v = 0.035 * this.musicVolume;
    const beat = dark ? 1.4 : 1, notes = 16 + Math.floor(Math.random() * 12);
    this.tone(root / 2, 0, notes * beat + 2, v * 0.8, 'triangle');
    let degree = Math.floor(Math.random() * scale.length);
    for (let k = 0; k < notes; k++) {
      // A gentle walk up and down the scale, sometimes resting.
      degree = Math.max(0, Math.min(scale.length * 2 - 1, degree + Math.floor(Math.random() * 5) - 2));
      if (Math.random() < 0.2) continue;
      const semis = scale[degree % scale.length]! + 12 * Math.floor(degree / scale.length);
      this.tone(root * 2 ** (semis / 12), k * beat, beat * 1.8, v, 'sine');
    }
  }
}
