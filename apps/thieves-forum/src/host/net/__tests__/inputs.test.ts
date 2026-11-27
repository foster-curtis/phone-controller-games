// Phone input → `PlayerInput` with host-side staleness (SPEC §12.5, BUILD_PLAN §8 [TF0]).
import { describe, expect, it } from 'vitest';
import { BIT_CATCH, BIT_HOLD } from '../../../shared/messages';
import { createInputStore } from '../inputs';

const store = () => createInputStore({ inputStaleMs: 250, holdStaleMs: 500 });

describe('input store', () => {
  it('scales the stick and reads the bits', () => {
    const s = store();
    s.set('a', 100, -50, BIT_HOLD | BIT_CATCH, 1000);
    expect(s.sample(1000).get('a')).toEqual({
      move: { x: 1, y: -0.5 },
      hold: true,
      catch: true,
    });
  });

  it('zeroes the stick and catch after inputStaleMs, releases hold after holdStaleMs', () => {
    const s = store();
    s.set('a', 40, 40, BIT_HOLD | BIT_CATCH, 0);
    expect(s.sample(250).get('a')!.move).toEqual({ x: 0.4, y: 0.4 });
    const mid = s.sample(251).get('a')!;
    expect(mid).toEqual({ move: { x: 0, y: 0 }, hold: true, catch: false });
    expect(s.sample(501).get('a')!.hold).toBe(false);
  });

  it('forgets a phone that left', () => {
    const s = store();
    s.set('a', 1, 1, 0, 0);
    s.forget('a');
    expect(s.sample(0).size).toBe(0);
  });

  it('latches a Catch! tap that came and went between two samples (TF12)', () => {
    const store = createInputStore({ inputStaleMs: 250, holdStaleMs: 500 });
    store.set('p', 0, 0, 0, 0);
    expect(store.sample(1).get('p')!.catch).toBe(false);
    store.set('p', 0, 0, 2, 10); // down
    store.set('p', 0, 0, 0, 130); // up, before the next sample
    expect(store.sample(140).get('p')!.catch).toBe(true);
    expect(store.sample(157).get('p')!.catch).toBe(false);
  });
});
