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
  /** Where the player is, for the music: see `musicPlace`. */
  place?: MusicPlace;
}

/** Each place has its own music. */
export type MusicPlace = 'day' | 'night' | 'cave' | 'depths' | 'town' | 'boss';

/** The place for the music: a boss fight first, then the Ember Depths, caves, towns, and the time of day. */
export function musicPlace(s: { boss: boolean; depthM: number; depthsTopM: number; underground: boolean; town: boolean; day: boolean }): MusicPlace {
  return s.boss ? 'boss' : s.depthM < s.depthsTopM ? 'depths' : s.underground ? 'cave' : s.town ? 'town' : s.day ? 'day' : 'night';
}

/**
 * Each place's music: its root note (Hz), scale (semitones), seconds per beat, the voices of the melody and the held
 * note, and the seconds of silence between pieces (from, to). Boss music is fast, low and comes back quickly.
 */
export const THEMES: Readonly<Record<MusicPlace, { root: number; scale: readonly number[]; beat: number; lead: OscillatorType; bass: OscillatorType; gap: readonly [number, number] }>> = {
  day: { root: 196, scale: [0, 2, 4, 7, 9], beat: 1, lead: 'sine', bass: 'triangle', gap: [150, 330] },
  night: { root: 165, scale: [0, 2, 3, 7, 9], beat: 1.3, lead: 'triangle', bass: 'sine', gap: [150, 330] },
  cave: { root: 110, scale: [0, 3, 5, 7, 10], beat: 1.4, lead: 'sine', bass: 'triangle', gap: [120, 300] },
  depths: { root: 82, scale: [0, 1, 5, 7, 8], beat: 1.1, lead: 'triangle', bass: 'sawtooth', gap: [90, 200] },
  town: { root: 220, scale: [0, 2, 4, 5, 7, 9], beat: 0.7, lead: 'triangle', bass: 'sine', gap: [90, 200] },
  boss: { root: 98, scale: [0, 3, 5, 6, 7, 10], beat: 0.32, lead: 'square', bass: 'sawtooth', gap: [2, 5] },
};

/** A looping noise layer: filtered noise through a gain that eases toward a target. */
interface Layer {
  gain: GainNode;
}


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
    const place = s.place ?? (s.underground ? 'cave' : s.day ? 'day' : 'night');
    // A boss fight starts its music at once, and the music of the place it was stops mattering.
    if (place !== this.place && place === 'boss') this.nextMusic = Math.min(this.nextMusic, 1);
    this.place = place;
    if ((this.nextMusic -= dt) <= 0) {
      const gap = THEMES[place].gap;
      this.nextMusic = gap[0] + Math.random() * (gap[1] - gap[0]) + this.music(place);
    }
  }
  private place: MusicPlace = 'day';

  /** A short rising fanfare: a boss has fallen. */
  sting(): void {
    if (this.musicVolume <= 0) return;
    const v = 0.06 * this.musicVolume;
    [0, 4, 7, 12].forEach((semis, k) => this.tone(262 * 2 ** (semis / 12), k * 0.14, k === 3 ? 1.4 : 0.3, v, 'triangle'));
    this.nextMusic = Math.max(this.nextMusic, 20);
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

  /** A short piece in the place's theme: a melody over a held low note. Returns how long it lasts (s). */
  private music(place: MusicPlace): number {
    if (this.musicVolume <= 0) return 0;
    const { root, scale, beat, lead, bass } = THEMES[place], v = 0.035 * this.musicVolume * (lead === 'square' ? 0.5 : 1);
    const notes = 16 + Math.floor(Math.random() * 12);
    this.tone(root / 2, 0, notes * beat + 2, v * 0.8, bass);
    let degree = Math.floor(Math.random() * scale.length);
    for (let k = 0; k < notes; k++) {
      // A gentle walk up and down the scale, sometimes resting.
      degree = Math.max(0, Math.min(scale.length * 2 - 1, degree + Math.floor(Math.random() * 5) - 2));
      if (Math.random() < 0.2) continue;
      const semis = scale[degree % scale.length]! + 12 * Math.floor(degree / scale.length);
      this.tone(root * 2 ** (semis / 12), k * beat, beat * 1.8, v, lead);
    }
    return notes * beat;
  }
}
