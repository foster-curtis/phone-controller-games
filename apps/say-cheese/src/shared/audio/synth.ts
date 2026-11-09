// Web Audio synth for every Say Cheese sound (SPEC §3, §6.8; BUILD_PLAN §3 SC8): one shared
// AudioContext, short envelopes, no sound files (SPEC decision #17). Silent until `unlock()`.
import type { Sfx, SfxName } from '../sfx';

/* eslint-disable @typescript-eslint/no-explicit-any -- nodes are duck-typed so tests can fake them */
/** The slice of the Web Audio API the synth uses, so tests can pass a fake. */
export interface AudioCtxLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  createGain(): any;
  createOscillator(): any;
  createBuffer(channels: number, length: number, rate: number): any;
  createBufferSource(): any;
}

type Nav = { audioSession?: { type: string } };

export interface SfxOptions {
  /** Defaults to `new AudioContext()` (or `webkitAudioContext`). */
  createContext?: () => AudioCtxLike | null;
  /** Defaults to `navigator`. */
  nav?: Nav;
  /** Master gain, 0..1. */
  volume?: number;
}

type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth';

function defaultContext(): AudioCtxLike | null {
  const w = globalThis as unknown as {
    AudioContext?: new () => AudioCtxLike;
    webkitAudioContext?: new () => AudioCtxLike;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function createSfx(opts: SfxOptions = {}): Sfx {
  let ctx: AudioCtxLike | null = null;
  let master: any = null;
  let unlocked = false;
  let noise: unknown = null;

  /** One enveloped oscillator note: fast attack, exponential decay. */
  function tone(
    at: number,
    freq: number,
    dur: number,
    type: Wave,
    peak: number,
    endFreq = freq,
  ): void {
    const c = ctx!;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** A decaying white-noise burst (the shutter click). */
  function click(at: number, dur: number, peak: number): void {
    const c = ctx!;
    if (!noise) {
      const len = Math.floor(c.sampleRate * 0.15);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0) as Float32Array;
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      noise = buf;
    }
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = noise;
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(g);
    g.connect(master);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  const voices: Record<SfxName, (t: number) => void> = {
    beep: (t) => tone(t, 660, 0.12, 'square', 0.25),
    beepFinal: (t) => tone(t, 990, 0.3, 'square', 0.3),
    startBuzz: (t) => {
      tone(t, 220, 0.5, 'sawtooth', 0.3, 180);
      tone(t, 223, 0.5, 'sawtooth', 0.2, 183);
    },
    endBuzz: (t) => {
      tone(t, 160, 0.7, 'sawtooth', 0.32, 90);
      tone(t, 164, 0.7, 'square', 0.15, 92);
    },
    shutter: (t) => {
      click(t, 0.05, 0.6);
      click(t + 0.07, 0.07, 0.4);
    },
    develop: (t) => {
      tone(t, 1319, 0.35, 'sine', 0.22);
      tone(t + 0.09, 1760, 0.5, 'sine', 0.2);
    },
    sting: (t) => {
      [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.1, f, 0.45, 'triangle', 0.26));
    },
  };

  return {
    get unlocked() {
      return unlocked;
    },
    async unlock() {
      if (unlocked) return;
      try {
        // iOS 17+: play through the silent switch.
        const nav = opts.nav ?? (globalThis as { navigator?: Nav }).navigator;
        if (nav?.audioSession) nav.audioSession.type = 'playback';
        ctx ??= (opts.createContext ?? defaultContext)();
        if (!ctx) return;
        if (!master) {
          master = ctx.createGain();
          master.gain.value = opts.volume ?? 0.8;
          master.connect(ctx.destination);
        }
        await ctx.resume();
        unlocked = ctx.state !== 'suspended';
      } catch {
        unlocked = false;
      }
    },
    play(name) {
      if (!unlocked || !ctx) return;
      try {
        voices[name](ctx.currentTime + 0.005);
      } catch {
        // Audio is never load-bearing (SPEC §3).
      }
    },
  };
}
