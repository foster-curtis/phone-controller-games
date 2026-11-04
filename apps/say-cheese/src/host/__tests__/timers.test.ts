// Host timers (SPEC §8): deadlines on a clock that stops while the tab is hidden.
import { describe, expect, it } from 'vitest';
import { createHostTimers } from '../timers';

function fakeEnv() {
  let t = 0;
  let next = 1;
  const pending = new Map<number, { at: number; cb: () => void }>();
  return {
    env: {
      now: () => t,
      setTimeout: (cb: () => void, ms: number) => {
        const id = next++;
        pending.set(id, { at: t + ms, cb });
        return id;
      },
      clearTimeout: (h: unknown) => void pending.delete(h as number),
    },
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = [...pending].filter(([, p]) => p.at <= end).sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        const [id, p] = due[0]!;
        pending.delete(id);
        t = p.at;
        p.cb();
      }
      t = end;
    },
  };
}

describe('host timers', () => {
  it('fires once after ms', () => {
    const f = fakeEnv();
    const timers = createHostTimers(f.env);
    let fired = 0;
    timers.start('scatter', 1000, () => fired++);
    f.advance(999);
    expect(fired).toBe(0);
    f.advance(1);
    expect(fired).toBe(1);
    f.advance(5000);
    expect(fired).toBe(1);
  });

  it('restarting or clearing replaces the old timer', () => {
    const f = fakeEnv();
    const timers = createHostTimers(f.env);
    const log: string[] = [];
    timers.start('shoot', 1000, () => log.push('a'));
    timers.start('shoot', 2000, () => log.push('b'));
    timers.start('upload', 500, () => log.push('c'));
    timers.clear('upload');
    f.advance(3000);
    expect(log).toEqual(['b']);
  });

  it('pauses the clock and the timers while hidden', () => {
    const f = fakeEnv();
    const timers = createHostTimers(f.env);
    let fired = 0;
    timers.start('scatter', 1000, () => fired++);
    f.advance(400);
    timers.setPaused(true);
    expect(timers.paused).toBe(true);
    const frozen = timers.now();
    f.advance(10_000);
    expect(fired).toBe(0);
    expect(timers.now()).toBe(frozen);
    timers.setPaused(false);
    expect(timers.now()).toBe(frozen);
    f.advance(599);
    expect(fired).toBe(0);
    f.advance(1);
    expect(fired).toBe(1);
  });

  it('a timer started while paused waits for resume', () => {
    const f = fakeEnv();
    const timers = createHostTimers(f.env);
    let fired = 0;
    timers.setPaused(true);
    timers.start('upload', 100, () => fired++);
    f.advance(1000);
    expect(fired).toBe(0);
    timers.setPaused(false);
    f.advance(100);
    expect(fired).toBe(1);
  });

  it('dispose clears everything', () => {
    const f = fakeEnv();
    const timers = createHostTimers(f.env);
    let fired = 0;
    timers.start('a', 10, () => fired++);
    timers.dispose();
    f.advance(100);
    expect(fired).toBe(0);
  });
});
