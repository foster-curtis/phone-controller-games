// Scatter countdown beep schedule (SPEC §6.2, §6.8; BUILD_PLAN §8 SC5-fix-2).
import { describe, expect, it } from 'vitest';
import { COUNTDOWN_BEEP_FROM, countdownBeep, createCountdownBeeper } from '../countdown';
import type { SfxName } from '../sfx';

describe('countdownBeep', () => {
  it('beeps at 5, 4, 3, 2 and plays the final beep at 1', () => {
    expect([6, 5, 4, 3, 2, 1, 0].map(countdownBeep)).toEqual([
      null,
      'beep',
      'beep',
      'beep',
      'beep',
      'beepFinal',
      null,
    ]);
    expect(COUNTDOWN_BEEP_FROM).toBe(5);
  });

  it('ignores fractions and negatives', () => {
    expect(countdownBeep(2.5)).toBeNull();
    expect(countdownBeep(-1)).toBeNull();
  });
});

describe('createCountdownBeeper', () => {
  const run = (ticks: number[]) => {
    const played: SfxName[] = [];
    const b = createCountdownBeeper((n) => played.push(n));
    for (const ms of ticks) b.tick(ms);
    return { played, b };
  };

  it('plays one sound per whole second of a 5 s countdown, ticked every 200 ms', () => {
    const ticks: number[] = [];
    for (let ms = 5000; ms >= 0; ms -= 200) ticks.push(ms);
    expect(run(ticks).played).toEqual(['beep', 'beep', 'beep', 'beep', 'beepFinal']);
  });

  it('never repeats a second, and beeps again after reset', () => {
    const { played, b } = run([3000, 2900, 2999, 2000]);
    expect(played).toEqual(['beep', 'beep']);
    b.reset();
    b.tick(1000);
    b.tick(900);
    expect(played).toEqual(['beep', 'beep', 'beepFinal']);
  });

  it('a longer countdown stays silent until 5 s are left', () => {
    expect(run([10_000, 8000, 6000, 5000]).played).toEqual(['beep']);
  });
});
