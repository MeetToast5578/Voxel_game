export type SoundName = 'break' | 'place' | 'step' | 'splash' | 'thunder' | 'hurt';

interface Preset {
  /** Low-pass cutoff in Hz: lower sounds duller. */
  frequency: number;
  volume: number;
  /** Seconds until faded out. */
  duration: number;
}

const PRESETS: Record<SoundName, Preset> = {
  break: { frequency: 900, volume: 0.5, duration: 0.18 },
  place: { frequency: 1600, volume: 0.35, duration: 0.08 },
  step: { frequency: 500, volume: 0.15, duration: 0.06 },
  splash: { frequency: 700, volume: 0.3, duration: 0.35 },
  thunder: { frequency: 150, volume: 0.7, duration: 2.5 },
  hurt: { frequency: 300, volume: 0.6, duration: 0.25 },
};

/** Procedural sound effects: filtered noise bursts, so no audio files are needed. Ported from the old game. */
export class Sounds {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  /** Effects volume from the settings, 0..1. */
  volume = 1;

  /** Browsers only allow audio after a user gesture: call from a click. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.noise = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.5), this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    this.ctx.resume().catch(() => undefined);
  }

  play(name: SoundName, volume = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || ctx.state !== 'running' || this.volume <= 0) return;
    const p = PRESETS[name];
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = p.duration > this.noise.duration;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = p.frequency * (0.9 + Math.random() * 0.2);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.002, p.volume * volume * this.volume), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + p.duration);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);
    source.stop(t + p.duration);
  }
}
