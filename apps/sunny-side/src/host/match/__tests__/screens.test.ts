import { describe, expect, it } from 'vitest';
import type { ScreenKind } from '../../../shared/messages';
import { ceilSecondsMs } from '../screens';
import { setup } from './fakeSim';

/** Record<ScreenKind, …> makes TS fail here if a Screen variant is added and not listed. */
const ALL_KINDS: Record<ScreenKind, true> = {
  lobby: true,
  countdown: true,
  playing: true,
  eliminated: true,
  ghost: true,
  spectating: true,
  results: true,
  matchEnd: true,
  gamePaused: true,
  left: true,
};

describe('screens', () => {
  it('every Screen variant is emitted by a full match', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.join('c');
    h.readyAll();
    h.match.hostAction('start'); // countdown
    h.runMs(3000); // playing
    h.join('s'); // spectating
    h.eliminate('c', 'a'); // eliminated
    h.runMs(5000);
    h.sim.queue({ type: 'ghostSpawned', id: 'c' });
    h.step(); // ghost
    h.match.setHostVisible(false); // gamePaused
    h.match.setHostVisible(true);
    h.msg('b', { t: 'leave' }); // left; b's egg is removed → a alone on the pan → results
    expect(h.match.view().phase).toBe('results');
    h.msg('c', { t: 'leave' });
    for (let r = 0; r < 3 && h.match.view().phase !== 'matchEnd'; r++) {
      h.match.hostAction('next');
      h.runMs(3000);
      h.eliminate('s', 'a');
    }
    expect(h.match.view().phase).toBe('matchEnd');

    const emitted = new Set(h.sent.map((s) => s.screen.kind));
    expect([...emitted].sort()).toEqual(Object.keys(ALL_KINDS).sort());
  });

  it('screens are sent per phone and only when they change', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    expect(h.sent.every((s) => s.to !== undefined)).toBe(true);
    const n = h.sent.length;
    h.step(60);
    expect(h.sent.length).toBe(n);
  });

  it('carries base fields: leader flag, round, target, own profile, sorted standings', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    h.eliminate('b', 'a');
    const s = h.last('b');
    expect(s).toMatchObject({
      kind: 'results',
      isLeader: false,
      round: 1,
      targetScore: 15,
      name: 'Egg 2',
      color: 'cobalt',
    });
    expect(s.standings.map((x) => [x.playerId, x.score])).toEqual([
      ['a', 4],
      ['b', 0],
    ]);
  });

  it('a player who joined but got no egg sees spectating, not playing', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c']) h.join(id);
    h.match.playerLeft('c');
    h.readyAll();
    h.match.hostAction('start');
    h.match.playerRejoined('c', 'key-c');
    expect(h.last('c').kind).toBe('spectating');
    h.runMs(3000);
    expect(h.last('c').kind).toBe('spectating');
  });

  it('ceilSecondsMs rounds up to whole seconds, min 1 s', () => {
    expect(ceilSecondsMs(3000)).toBe(3000);
    expect(ceilSecondsMs(2999.9)).toBe(3000);
    expect(ceilSecondsMs(2000)).toBe(2000);
    expect(ceilSecondsMs(1e-12)).toBe(1000);
    expect(ceilSecondsMs(0)).toBe(1000);
  });
});
