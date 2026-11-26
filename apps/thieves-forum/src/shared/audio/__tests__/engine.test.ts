// Audio engine tests with a fake AudioContext (SPEC §6.20, §12.8; BUILD_PLAN TF11 acceptance).
import { describe, expect, it, vi } from 'vitest';
import { createAudioEngine, dbToGain, type AudioEngineOptions, type SynthFn } from '../engine';
import type { AudioMap } from '../types';
import { FakeContext, seeded } from './fakeContext';

type Cue = 'a' | 'b';

const map = (over: Partial<AudioMap<Cue>> = {}): AudioMap<Cue> => ({
  bed: { src: null, gainDb: -18, loopCrossfadeMs: 500 },
  oneShots: {
    srcs: ['x.mp3', 'y.mp3', null, null],
    intervalMs: [2000, 6000],
    gainDb: -12,
    gainJitterDb: 3,
    pitchJitter: 0.05,
    panRange: 0.8,
    noRepeat: true,
  },
  cues: {
    a: { src: null, gainDb: -6, ducks: true },
    b: { src: null, gainDb: -6, ducks: false },
  },
  duck: { db: -8, ms: 1000, attackMs: 100, releaseMs: 200 },
  silentAmbienceIn: ['reveal', 'podium'],
  ...over,
});

function setup(m = map(), extra: Partial<AudioEngineOptions<Cue>> = {}) {
  const ctx = new FakeContext();
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  const engine = createAudioEngine<Cue>({
    createContext: () => ctx,
    map: m,
    rng: seeded(7),
    loadBuffer: async () => null,
    setTimer: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => (t.live = false);
    },
    ...extra,
  });
  return { ctx, engine, timers };
}

describe('audio engine', () => {
  it('play before unlock is a silent no-op', async () => {
    const { ctx, engine } = setup();
    engine.play('a');
    engine.duck();
    expect(ctx.nodes).toHaveLength(0);
    await engine.unlock();
    engine.play('a');
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.resumed).toBe(1);
  });

  it('stays silent when there is no Web Audio', async () => {
    const engine = createAudioEngine<Cue>({
      createContext: () => null,
      map: map(),
      rng: seeded(1),
    });
    await engine.unlock();
    engine.play('a');
    expect(engine.unlocked).toBe(false);
  });

  it('draws one-shot intervals within 2-6 s', async () => {
    const { ctx, engine, timers } = setup();
    engine.startOneShots(); // before unlock: deferred
    await engine.unlock();
    engine.setScene('play');
    for (let i = 0; i < 200; i++) {
      const t = timers.filter((x) => x.live).at(-1)!;
      expect(t.ms).toBeGreaterThanOrEqual(2000);
      expect(t.ms).toBeLessThanOrEqual(6000);
      t.live = false;
      const before = ctx.sources.length;
      t.fn();
      expect(ctx.sources.length).toBe(before + 1);
    }
  });

  it('never picks the same pool index twice in a row, and varies pan, pitch and gain', async () => {
    const synthLen = [100, 200, 300, 400];
    const synth = {
      bed: (() => new Float32Array(10)) as SynthFn,
      oneShots: synthLen.map(
        (n): SynthFn =>
          () =>
            new Float32Array(n),
      ),
      cues: {
        a: (() => new Float32Array(5)) as SynthFn,
        b: (() => new Float32Array(5)) as SynthFn,
      },
    };
    const { ctx, engine, timers } = setup(map(), { synth });
    engine.startOneShots();
    await engine.unlock();
    engine.setScene('play');
    let last = -1;
    const rates = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const t = timers.filter((x) => x.live).at(-1)!;
      t.live = false;
      t.fn();
      const src = ctx.sources.at(-1)!;
      const idx = synthLen.indexOf(src.buffer!.length);
      expect(idx).not.toBe(-1);
      expect(idx).not.toBe(last);
      last = idx;
      rates.add(src.playbackRate.value);
      expect(Math.abs(src.playbackRate.value - 1)).toBeLessThanOrEqual(0.05);
    }
    expect(rates.size).toBeGreaterThan(50);
    const pans = ctx.nodes.filter((n) => n.kind === 'pan').map((n) => n.pan.value);
    expect(Math.max(...pans.map(Math.abs))).toBeLessThanOrEqual(0.8);
    expect(Math.min(...pans)).toBeLessThan(0);
    expect(Math.max(...pans)).toBeGreaterThan(0);
  });

  it('ducks to -8 dB and back in about one second', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    engine.setScene('play');
    ctx.currentTime = 10;
    engine.play('a'); // ducks: true
    const amb = ctx.nodes[1]!.gain; // [master, ambience, ...]
    const ramps = amb.calls.filter((c) => c.fn === 'ramp' && c.t >= 10);
    expect(ramps).toHaveLength(2);
    expect(ramps[0]!.v).toBeCloseTo(dbToGain(-8), 5);
    expect(ramps[1]!.v).toBe(1);
    expect(ramps[1]!.t - 10).toBeCloseTo(1, 5);
    // A non-ducking cue leaves the ambience alone.
    const n = amb.calls.length;
    engine.play('b');
    expect(amb.calls).toHaveLength(n);
  });

  it("setScene('reveal') silences the ambience, and one-shots stop sounding", async () => {
    const { ctx, engine, timers } = setup();
    engine.startOneShots();
    await engine.unlock();
    engine.setScene('reveal');
    const amb = ctx.nodes[1]!.gain;
    expect(amb.calls.filter((c) => c.fn === 'ramp').at(-1)!.v).toBe(0);
    const t = timers.filter((x) => x.live).at(-1)!;
    const before = ctx.sources.length;
    t.fn();
    expect(ctx.sources).toHaveLength(before);
    // Cues still play under the reveal (that is the point of ducking the ambience out).
    engine.play('b');
    expect(ctx.sources).toHaveLength(before + 1);
    engine.setScene('play');
    expect(amb.calls.filter((c) => c.fn === 'ramp').at(-1)!.v).toBe(1);
  });

  it('starts the bed with a loop crossfade at fixed gain', async () => {
    const synth = {
      bed: (() => new Float32Array(8 * 8000)) as SynthFn, // 8 s at 8 kHz
      oneShots: [],
      cues: {
        a: (() => new Float32Array(5)) as SynthFn,
        b: (() => new Float32Array(5)) as SynthFn,
      },
    };
    const { ctx, engine, timers } = setup(map(), { synth });
    engine.startBed();
    await engine.unlock();
    expect(ctx.sources).toHaveLength(1);
    const g = ctx.sources[0]!.out as { gain: { calls: { fn: string; v?: number; t: number }[] } };
    const ramps = g.gain.calls.filter((c) => c.fn === 'ramp');
    expect(ramps[0]!.v).toBeCloseTo(dbToGain(-18), 5);
    expect(ramps[0]!.t).toBeCloseTo(0.5, 5); // fade in over the crossfade
    expect(ramps[1]!.t).toBeCloseTo(8, 5);
    // The next copy starts one crossfade before this one ends.
    ctx.currentTime = 7;
    timers
      .filter((t) => t.live)
      .at(-1)!
      .fn();
    expect(ctx.sources[1]!.started).toBeCloseTo(7.5, 5);
  });

  it('falls back to the synth when a file is missing or fails to decode', async () => {
    const recipe = vi.fn<SynthFn>(() => new Float32Array(50));
    const synth = {
      bed: (() => new Float32Array(10)) as SynthFn,
      oneShots: [],
      cues: { a: recipe, b: (() => new Float32Array(5)) as SynthFn },
    };
    const loadBuffer = vi.fn(async () => {
      throw new Error('404');
    });
    const m = map();
    m.cues.a.src = 'missing.mp3';
    const { ctx, engine } = setup(m, { synth, loadBuffer });
    await engine.unlock();
    engine.play('a');
    expect(loadBuffer).toHaveBeenCalledWith(ctx, 'missing.mp3');
    expect(recipe).toHaveBeenCalled();
    expect(ctx.sources.at(-1)!.buffer!.length).toBe(50);
  });

  it('uses the loaded file once it has decoded', async () => {
    const file = { length: 9, sampleRate: 8000, duration: 9 / 8000 };
    const m = map();
    m.cues.a.src = 'a.mp3';
    const { ctx, engine } = setup(m, { loadBuffer: async () => file });
    await engine.unlock();
    engine.play('a'); // kicks the load, plays the stand-in
    await Promise.resolve();
    await Promise.resolve();
    engine.play('a');
    expect(ctx.sources.at(-1)!.buffer).toBe(file);
  });

  it('stop() cancels the schedulers', async () => {
    const { engine, timers } = setup();
    engine.startBed();
    engine.startOneShots();
    await engine.unlock();
    engine.stop();
    expect(timers.some((t) => t.live)).toBe(false);
  });
});
