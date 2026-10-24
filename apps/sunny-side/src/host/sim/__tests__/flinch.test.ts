import { describe, expect, it } from 'vitest';
import { egg, ofType, run, setup, speed } from './helpers';

// C3 "phantom flinch": at a round start an egg jumped as if its player had pressed something.
// The host wiring (M6/M3) runs `startRound` (all frozen) → 3-2-1 countdown with no sim steps and
// phone inputs dropped → unfreeze → step. The phone's press counters keep counting through the
// countdown, so the sim must not diff the new round's first sample against the previous round's
// baseline, and must not keep steering with the previous round's last stick.

/** Round 1 played with the phone's counters at (dash, slam) = (3, 2) and the stick held right. */
function afterRoundOne() {
  const s = setup(['a', 'b'], { a: [-150, 0], b: [150, 0] });
  const a = s.pads.a!;
  a.stick(100, 0).dash(3);
  a.slam();
  a.slam();
  run(s.sim, 120);
  return s;
}

/** Next round as the host runs it: everyone frozen, countdown (no steps), then unfreeze. */
function nextRound(s: ReturnType<typeof afterRoundOne>) {
  s.sim.startRound([
    { id: 'a', frozen: true },
    { id: 'b', frozen: true },
  ]);
  s.sim.setFrozen('a', false);
  s.sim.setFrozen('b', false);
}

describe('round start (phantom flinch regression)', () => {
  it("doesn't keep steering with the previous round's last stick", () => {
    const s = afterRoundOne();
    nextRound(s);
    // No input has arrived yet in the new round (the phone's next keepalive is up to 200 ms away).
    const events = run(s.sim, 10);
    expect(speed(egg(s.sim, 'a'))).toBe(0);
    expect(ofType(events, 'dash')).toHaveLength(0);
    expect(ofType(events, 'slam')).toHaveLength(0);
  });

  it('presses made during the countdown (unseen by the sim) never fire on the first sample', () => {
    const s = afterRoundOne();
    nextRound(s);
    // During the countdown the player tapped DASH and SLAM; the host dropped those samples. The
    // first sample forwarded after unfreeze carries the advanced counters and a neutral stick.
    const a = s.pads.a!;
    a.x = 0;
    a.y = 0;
    a.dashCount += 2;
    a.slamCount += 1;
    a.send();
    const events = run(s.sim, 10);
    expect(ofType(events, 'dash')).toHaveLength(0);
    expect(ofType(events, 'slam')).toHaveLength(0);
    expect(speed(egg(s.sim, 'a'))).toBe(0);
  });

  it('a real press after the first sample of the round still dashes', () => {
    const s = afterRoundOne();
    nextRound(s);
    const a = s.pads.a!;
    a.stick(0, 0);
    s.sim.step(); // baseline
    a.stick(100, 0).dash();
    const events = run(s.sim, 2);
    expect(ofType(events, 'dash')).toEqual([{ type: 'dash', id: 'a' }]);
    expect(egg(s.sim, 'a').vx).toBeGreaterThan(500);
  });

  it('a held stick sent after the unfreeze steers normally', () => {
    const s = afterRoundOne();
    nextRound(s);
    s.pads.a!.stick(0, 100);
    run(s.sim, 10);
    const e = egg(s.sim, 'a');
    expect(e.vy).toBeGreaterThan(50);
    expect(Math.abs(e.vx)).toBeLessThan(1e-9);
  });
});
