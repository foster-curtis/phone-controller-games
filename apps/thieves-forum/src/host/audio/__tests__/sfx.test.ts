// Forum audio map, synth set and Sfx tests (SPEC §6.20, §12.8; BUILD_PLAN TF11 acceptance).
import { describe, expect, it, vi } from 'vitest';
import { FakeContext, seeded } from '../../../shared/audio/__tests__/fakeContext';
import { SFX_CUES } from '../../../shared/sfx';
import { createForumAudioMap, FORUM_AUDIO_MAP, FORUM_ONE_SHOT_FILES } from '../map';
import { createSfx, installUnlock } from '../sfx';
import { FORUM_SYNTH } from '../synth';

describe('forum audio map', () => {
  it('has exactly the SfxCue set, with no grab or pickpocket cue', () => {
    const keys = Object.keys(FORUM_AUDIO_MAP.cues).sort();
    expect(keys).toEqual([...SFX_CUES].sort());
    expect(Object.keys(FORUM_SYNTH.cues).sort()).toEqual([...SFX_CUES].sort());
    expect(keys.filter((k) => /grab|pickpocket|steal|tip/i.test(k))).toEqual([]);
  });

  it('matches the SPEC §7 numbers and ducks only on THIEF!, whistle and catches', () => {
    expect(FORUM_AUDIO_MAP.oneShots.intervalMs).toEqual([2000, 6000]);
    expect(FORUM_AUDIO_MAP.duck.db).toBe(-8);
    expect(FORUM_AUDIO_MAP.duck.ms).toBe(1000);
    const ducking = Object.entries(FORUM_AUDIO_MAP.cues)
      .filter(([, c]) => c.ducks)
      .map(([k]) => k)
      .sort();
    expect(ducking).toEqual(['guardWhistle', 'stocksClank', 'thiefShout']);
    expect(FORUM_AUDIO_MAP.silentAmbienceIn).toEqual(['silent', 'reveal', 'podium']);
  });

  it('falls back to synth (src null) while files are absent, and uses URLs when present', () => {
    expect(FORUM_AUDIO_MAP.bed.src).toBeNull(); // nothing delivered yet (TF19)
    const m = createForumAudioMap({
      '/audio/forum/sfx/fanfare.mp3': '/assets/fanfare.mp3',
      '/audio/forum/bed/crowd-loop.mp3': '/assets/bed.mp3',
    });
    expect(m.cues.fanfare.src).toBe('/assets/fanfare.mp3');
    expect(m.cues.firework.src).toBeNull();
    expect(m.bed.src).toBe('/assets/bed.mp3');
  });

  it('has a synth recipe for every one-shot file', () => {
    expect(FORUM_SYNTH.oneShots).toHaveLength(FORUM_ONE_SHOT_FILES.length);
    expect(FORUM_AUDIO_MAP.oneShots.srcs).toHaveLength(FORUM_ONE_SHOT_FILES.length);
  });

  it('renders every recipe to finite, bounded, non-silent samples', () => {
    const all = [FORUM_SYNTH.bed, ...FORUM_SYNTH.oneShots, ...Object.values(FORUM_SYNTH.cues)];
    for (const fn of all) {
      const out = fn(8000, seeded(3));
      expect(out.length).toBeGreaterThan(100);
      let peak = 0;
      for (const v of out) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
      expect(peak).toBeGreaterThan(0.01);
      expect(peak).toBeLessThanOrEqual(1.5);
    }
  });
});

describe('createSfx', () => {
  it('is silent before unlock, plays synthesized cues after, and scenes silence the ambience', async () => {
    const ctx = new FakeContext();
    const sfx = createSfx({ createContext: () => ctx, rng: seeded(5) });
    sfx.play('roundBell');
    expect(ctx.sources).toHaveLength(0);
    await sfx.unlock();
    expect(sfx.unlocked).toBe(true);
    const bedSources = ctx.sources.length; // the bed started on unlock
    sfx.play('roundBell', { pan: -0.5 });
    expect(ctx.sources).toHaveLength(bedSources + 1);
    sfx.scene('podium');
    const amb = ctx.nodes[1]!.gain;
    expect(amb.calls.filter((c) => c.fn === 'ramp').at(-1)!.v).toBe(0);
    sfx.engine.stop();
  });
});

describe('installUnlock', () => {
  it('unlocks on the first gesture then removes its listeners', async () => {
    const handlers = new Map<string, () => void>();
    const target = {
      addEventListener: (t: string, f: () => void) => void handlers.set(t, f),
      removeEventListener: (t: string) => void handlers.delete(t),
    };
    let unlocked = false;
    const sfx = {
      get unlocked() {
        return unlocked;
      },
      unlock: vi.fn(async () => {
        unlocked = true;
      }),
    };
    installUnlock(target, sfx);
    expect([...handlers.keys()].sort()).toEqual(['click', 'keydown', 'pointerdown']);
    handlers.get('keydown')!();
    await Promise.resolve();
    await Promise.resolve();
    expect(sfx.unlock).toHaveBeenCalledTimes(1);
    expect(handlers.size).toBe(0);
  });
});
