// Synth unit tests with a fake AudioContext (BUILD_PLAN §3 SC8 acceptance).
import { describe, expect, it, vi } from 'vitest';
import { SFX_NAMES } from '../../sfx';
import { createSfx, type AudioCtxLike } from '../synth';

function fakeCtx() {
  let nodes = 0;
  const node = () => {
    nodes++;
    const param = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    return {
      gain: param(),
      frequency: param(),
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      getChannelData: () => new Float32Array(8192),
    };
  };
  const resume = vi.fn(() => Promise.resolve());
  const ctx = {
    currentTime: 1,
    sampleRate: 8000,
    state: 'running',
    destination: {},
    resume,
    createGain: node,
    createOscillator: node,
    createBuffer: node,
    createBufferSource: node,
  };
  return { ctx: ctx as unknown as AudioCtxLike, count: () => nodes, resume };
}

describe('createSfx', () => {
  it('play before unlock is a silent no-op', () => {
    const f = fakeCtx();
    const sfx = createSfx({ createContext: () => f.ctx, nav: {} });
    for (const n of SFX_NAMES) expect(() => sfx.play(n)).not.toThrow();
    expect(f.count()).toBe(0);
    expect(sfx.unlocked).toBe(false);
  });

  it('after unlock every sound schedules nodes', async () => {
    for (const name of SFX_NAMES) {
      const f = fakeCtx();
      const sfx = createSfx({ createContext: () => f.ctx, nav: {} });
      await sfx.unlock();
      expect(sfx.unlocked).toBe(true);
      const before = f.count();
      sfx.play(name);
      expect(f.count(), name).toBeGreaterThan(before);
    }
  });

  it('sets audioSession when present and skips it when absent', async () => {
    const nav = { audioSession: { type: 'auto' } };
    await createSfx({ createContext: () => fakeCtx().ctx, nav }).unlock();
    expect(nav.audioSession.type).toBe('playback');
    const bare = createSfx({ createContext: () => fakeCtx().ctx, nav: {} });
    await bare.unlock();
    expect(bare.unlocked).toBe(true);
  });

  it('stays locked when there is no AudioContext or resume fails', async () => {
    const none = createSfx({ createContext: () => null, nav: {} });
    await none.unlock();
    expect(none.unlocked).toBe(false);
    const f = fakeCtx();
    f.resume.mockRejectedValue(new Error('no'));
    const bad = createSfx({ createContext: () => f.ctx, nav: {} });
    await bad.unlock();
    expect(bad.unlocked).toBe(false);
    expect(() => bad.play('beep')).not.toThrow();
  });
});
