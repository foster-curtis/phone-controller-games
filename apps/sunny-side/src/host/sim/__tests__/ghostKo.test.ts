import { describe, expect, it } from 'vitest';
import { PULSE_WINDUP_STEPS } from '../ghost';
import type { SimEvent } from '../types';
import type { Setup } from './helpers';
import { makeGhost, ofType, pushOut, run, setup } from './helpers';

// 3 players → start radius ≈ 311.8. a sits near the right rim, b far left, g becomes the ghost.
const place = { a: [270, 0], b: [-200, 0], g: [0, 150] } as Record<string, [number, number]>;

function withGhost(): Setup {
  const s = setup(['a', 'b', 'g'], place);
  makeGhost(s.sim, 'g');
  return s;
}

/** Ghost g fires a pulse 40 px left of egg `id`; returns the tick the pulse fired on. */
function pulseAt(s: Setup, id: string): number {
  const e = s.sim.snapshot().eggs.find((x) => x.id === id)!;
  s.sim.place('g', e.x - 40, e.y);
  s.pads.g!.dash();
  for (let i = 0; i <= PULSE_WINDUP_STEPS; i++) {
    if (ofType(s.sim.step(), 'pulse').length) return s.sim.snapshot().tick;
  }
  throw new Error('no pulse');
}

function untilEliminated(s: Setup, id: string, max = 120): SimEvent & { type: 'eliminated' } {
  for (let i = 0; i < max; i++) {
    const out = ofType(s.sim.step(), 'eliminated').find((e) => e.id === id);
    if (out) return out;
  }
  throw new Error(`${id} never eliminated`);
}

describe('ghost knockouts (byGhost)', () => {
  it('a pulse ring-out with no egg touch is byGhost', () => {
    const s = withGhost();
    pulseAt(s, 'a');
    const out = untilEliminated(s, 'a');
    expect(out).toEqual({ type: 'eliminated', id: 'a', by: null, byGhost: true, respawnMs: 4000 });
  });

  it('egg credit wins: byGhost is false when a last toucher is credited', () => {
    const s = withGhost();
    // b dashes into a well inside the pan, then both are stopped and a is moved next to the rim.
    s.sim.place('a', 0, -150);
    s.sim.place('b', -120, -150);
    s.pads.b!.stick(100, 0).dash();
    let hit = false;
    for (let i = 0; i < 30 && !hit; i++) hit = ofType(s.sim.step(), 'collision').length > 0;
    expect(hit).toBe(true);
    s.pads.b!.stick(0, 0);
    for (const id of ['a', 'b']) {
      s.sim.setFrozen(id, true); // stops dead
      s.sim.setFrozen(id, false);
    }
    s.sim.place('b', -200, 0);
    s.sim.place('a', 270, 0);
    pulseAt(s, 'a');
    const out = untilEliminated(s, 'a');
    expect(out).toMatchObject({ by: 'b', byGhost: false });
  });

  it('a pulse more than 3 s before the elimination is not byGhost (exactly 3 s still is)', () => {
    const elimAfter = (delay: number) => {
      const s = withGhost();
      s.sim.place('a', 0, 120);
      const fired = pulseAt(s, 'a'); // pushed but stays on the pan
      run(s.sim, fired + delay - 1 - s.sim.snapshot().tick);
      const ev = ofType(pushOut(s.sim, 'a'), 'eliminated')[0]!;
      expect(s.sim.snapshot().tick - fired).toBe(delay);
      return ev;
    };
    expect(elimAfter(180)).toMatchObject({ by: null, byGhost: true });
    expect(elimAfter(181)).toMatchObject({ by: null, byGhost: false });
  });

  it('an egg the pulse missed is not byGhost', () => {
    const s = withGhost();
    pulseAt(s, 'a');
    const out = ofType(pushOut(s.sim, 'b'), 'eliminated')[0]!;
    expect(out).toMatchObject({ id: 'b', by: null, byGhost: false });
  });

  it('pulses still never set last touch', () => {
    const s = withGhost();
    pulseAt(s, 'a');
    expect(untilEliminated(s, 'a').by).toBeNull();
  });
});
