// Web Audio engine (SPEC §6.20, §12.8; BUILD_PLAN TF11): bed loop with a crossfade, one-shot scheduler,
// ducking, scenes and cue playback, all driven by an `AudioMap`. No game imports (extraction candidate
// for `@pcg/game-kit`, BUILD_PLAN §8). Silent until `unlock()`; any file that fails to load falls back
// to a synthesized buffer so missing assets never break the page.
import type { AudioMap, AudioSrc } from './types';

/* eslint-disable @typescript-eslint/no-explicit-any -- nodes are duck-typed so tests can fake them */
/** The slice of the Web Audio API the engine uses, so tests can pass a fake. */
export interface AudioCtxLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  createGain(): any;
  createBuffer(channels: number, length: number, rate: number): any;
  createBufferSource(): any;
  createStereoPanner?(): any;
  decodeAudioData?(data: ArrayBuffer): Promise<any>;
}

export type AudioScene = 'lobby' | 'play' | 'reveal' | 'podium' | 'silent';

/** Renders placeholder samples (mono, −1..1) at the context's sample rate. */
export type SynthFn = (sampleRate: number, rng: () => number) => Float32Array;

export interface SynthSet<Cue extends string> {
  bed: SynthFn;
  /** One recipe per entry of `map.oneShots.srcs`, by index. */
  oneShots: readonly SynthFn[];
  cues: Record<Cue, SynthFn>;
}

export interface AudioEngineOptions<Cue extends string> {
  /** Returns the shared context, or null where Web Audio is missing (the engine then stays silent). */
  createContext: () => AudioCtxLike | null;
  map: AudioMap<Cue>;
  /** Uniform 0..1 (seeded in tests). */
  rng: () => number;
  synth?: SynthSet<Cue>;
  /** Fetch + decode one file; null on any failure. Default uses `fetch` and `decodeAudioData`. */
  loadBuffer?: (ctx: AudioCtxLike, url: string) => Promise<any | null>;
  /** Timer seam for tests; returns a cancel function. */
  setTimer?: (fn: () => void, ms: number) => () => void;
}

export interface PlayOptions {
  /** Stereo pan −1..1. */
  pan?: number;
}

export interface AudioEngine<Cue extends string> {
  /** Create/resume the context from a user gesture. Safe to call repeatedly. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  startBed(): void;
  startOneShots(): void;
  /** Stop bed and one-shots (they can be started again). */
  stop(): void;
  play(cue: Cue, opts?: PlayOptions): void;
  /** Dip the ambience by `db` for `ms` in total (attack + hold + release). */
  duck(ms?: number, db?: number): void;
  setScene(scene: AudioScene): void;
}

const FLOOR = 0.0001;
const SCENE_FADE_S = 0.3;
export const dbToGain = (db: number): number => 10 ** (db / 20);

export async function decodeFromUrl(ctx: AudioCtxLike, url: string): Promise<any | null> {
  try {
    if (!ctx.decodeAudioData || typeof fetch !== 'function') return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const defaultTimer = (fn: () => void, ms: number): (() => void) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

/** Generic fallback when a map entry has no synth recipe: a short soft blip. */
const beep: SynthFn = (rate) => {
  const out = new Float32Array(Math.floor(rate * 0.12));
  for (let i = 0; i < out.length; i++)
    out[i] = Math.sin((2 * Math.PI * 660 * i) / rate) * (1 - i / out.length) * 0.4;
  return out;
};

export function createAudioEngine<Cue extends string>(
  opts: AudioEngineOptions<Cue>,
): AudioEngine<Cue> {
  const { map, rng } = opts;
  const loadBuffer = opts.loadBuffer ?? decodeFromUrl;
  const timer = opts.setTimer ?? defaultTimer;

  let ctx: AudioCtxLike | null = null;
  let unlocked = false;
  let unlocking: Promise<void> | null = null;
  let master: any = null;
  let ambience: any = null; // scene + duck gain for the bed and the one-shots
  let scene: AudioScene = 'lobby';
  let wantBed = false;
  let wantOneShots = false;
  let bedRunning = false;
  let cancelBed: (() => void) | null = null;
  let cancelShot: (() => void) | null = null;
  let lastShot = -1;
  const buffers = new Map<string, any>();
  const requested = new Set<string>();

  const silent = (s: AudioScene) => map.silentAmbienceIn.includes(s);

  /** Buffer for a key: the loaded file once it arrived, else a synthesized stand-in. */
  function bufferFor(key: string, src: AudioSrc, synth: SynthFn | undefined): any {
    const have = buffers.get(key);
    if (have) return have;
    const c = ctx!;
    const data = (synth ?? beep)(c.sampleRate, rng);
    const standIn = c.createBuffer(1, data.length, c.sampleRate);
    standIn.getChannelData(0).set(data);
    if (!src) {
      buffers.set(key, standIn); // no file: the placeholder is final
    } else if (!requested.has(key)) {
      requested.add(key);
      // A failed load keeps the placeholder for good, so nothing is re-synthesized per play.
      loadBuffer(c, src).then(
        (b) => buffers.set(key, b ?? standIn),
        () => buffers.set(key, standIn),
      );
    }
    return standIn;
  }

  function voice(buf: any, out: any, gain: number, rate: number, pan: number, when: number) {
    const c = ctx!;
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buf;
    if (src.playbackRate) src.playbackRate.value = rate;
    g.gain.value = gain;
    src.connect(g);
    let tail: any = g;
    if (pan !== 0 && c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      tail = p;
    }
    tail.connect(out);
    src.start(when);
    return { src, gain: g };
  }

  function scheduleBed(at: number): void {
    const b = map.bed;
    const buf = bufferFor('bed', b.src, opts.synth?.bed);
    const dur: number = buf.duration ?? buf.length / buf.sampleRate;
    const xf = Math.min(b.loopCrossfadeMs / 1000, dur / 2);
    const peak = dbToGain(b.gainDb);
    const v = voice(buf, ambience, FLOOR, 1, 0, at);
    v.gain.gain.setValueAtTime(FLOOR, at);
    v.gain.gain.linearRampToValueAtTime(peak, at + xf);
    v.gain.gain.setValueAtTime(peak, at + dur - xf);
    v.gain.gain.linearRampToValueAtTime(FLOOR, at + dur);
    const next = at + dur - xf; // the next copy fades in as this one fades out
    cancelBed = timer(
      () => {
        if (bedRunning) scheduleBed(next);
      },
      Math.max(0, (next - ctx!.currentTime) * 1000 - 250),
    );
  }

  function pickShot(): number {
    const n = map.oneShots.srcs.length;
    if (n <= 1 || !map.oneShots.noRepeat) return Math.floor(rng() * n);
    let i = Math.floor(rng() * (n - 1));
    if (i >= lastShot) i++; // skip the last index without bias
    return i;
  }

  function playShot(): void {
    const o = map.oneShots;
    if (!ctx || o.srcs.length === 0 || silent(scene)) return;
    const i = pickShot();
    lastShot = i;
    const buf = bufferFor(`shot${i}`, o.srcs[i]!, opts.synth?.oneShots[i]);
    const db = o.gainDb + (rng() * 2 - 1) * o.gainJitterDb;
    const rate = 1 + (rng() * 2 - 1) * o.pitchJitter;
    const pan = (rng() * 2 - 1) * o.panRange;
    voice(buf, ambience, dbToGain(db), rate, pan, ctx.currentTime);
  }

  function nextShot(): void {
    const [lo, hi] = map.oneShots.intervalMs;
    cancelShot = timer(
      () => {
        playShot();
        if (wantOneShots) nextShot();
      },
      lo + rng() * (hi - lo),
    );
  }

  /** Ramp the ambience gain to the scene's level (also ends any duck in progress). */
  function applyScene(): void {
    if (!ctx) return;
    const g = ambience.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues?.(now);
    g.setValueAtTime(g.value ?? 1, now);
    g.linearRampToValueAtTime(silent(scene) ? 0 : 1, now + SCENE_FADE_S);
  }

  const api: AudioEngine<Cue> = {
    get unlocked() {
      return unlocked;
    },
    unlock() {
      if (unlocked) return Promise.resolve();
      unlocking ??= (async () => {
        const c = opts.createContext();
        if (!c) return;
        try {
          if (c.state === 'suspended') await c.resume();
        } catch {
          return;
        }
        ctx = c;
        master = c.createGain();
        master.connect(c.destination);
        ambience = c.createGain();
        ambience.connect(master);
        unlocked = true;
        applyScene();
        if (wantBed) api.startBed();
        if (wantOneShots) api.startOneShots();
      })().finally(() => {
        unlocking = null;
      });
      return unlocking;
    },
    startBed() {
      wantBed = true;
      if (!ctx || bedRunning) return;
      bedRunning = true;
      scheduleBed(ctx.currentTime);
    },
    startOneShots() {
      wantOneShots = true;
      if (!ctx || cancelShot) return;
      nextShot();
    },
    stop() {
      wantBed = wantOneShots = false;
      bedRunning = false;
      cancelBed?.();
      cancelShot?.();
      cancelBed = cancelShot = null;
    },
    play(cue, popts = {}) {
      if (!unlocked || !ctx) return;
      const def = map.cues[cue];
      if (!def) return;
      const buf = bufferFor(`cue:${cue}`, def.src, opts.synth?.cues[cue]);
      voice(buf, master, dbToGain(def.gainDb), 1, popts.pan ?? 0, ctx.currentTime);
      if (def.ducks) api.duck();
    },
    duck(ms = map.duck.ms, db = map.duck.db) {
      if (!unlocked || !ctx || silent(scene)) return;
      const g = ambience.gain;
      const now = ctx.currentTime;
      const atk = map.duck.attackMs / 1000;
      const rel = map.duck.releaseMs / 1000;
      const hold = Math.max(0, ms / 1000 - atk - rel);
      const low = dbToGain(db);
      // Re-ducking mid-duck restarts from the current level, so overlapping cues don't stack.
      g.cancelScheduledValues?.(now);
      g.setValueAtTime(g.value ?? 1, now);
      g.linearRampToValueAtTime(low, now + atk);
      g.setValueAtTime(low, now + atk + hold);
      g.linearRampToValueAtTime(1, now + atk + hold + rel);
    },
    setScene(next) {
      scene = next;
      applyScene();
    },
  };
  return api;
}
