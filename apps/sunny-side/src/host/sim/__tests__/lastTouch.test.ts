import { describe, expect, it } from 'vitest';
import { LastTouch } from '../lastTouch';
import type { SimWorld } from '../world';
import type { Setup } from './helpers';
import { makeGhost, ofType, pushOut, run, setup } from './helpers';

describe('LastTouch', () => {
  it('credits within 3 s (180 steps) and gives null after', () => {
    const lt = new LastTouch(180);
    lt.touch('a', 'b', 10);
    expect(lt.creditFor('b', 10)).toBe('a');
    expect(lt.creditFor('a', 190)).toBe('b');
    expect(lt.creditFor('b', 190)).toBe('a');
    expect(lt.creditFor('b', 191)).toBeNull();
    expect(lt.creditFor('c', 11)).toBeNull();
    lt.touch('c', 'b', 100);
    expect(lt.creditFor('b', 200)).toBe('c');
    lt.clear();
    expect(lt.creditFor('b', 101)).toBeNull();
  });
});

/** a dashes into b; both are frozen right after contact so nothing else touches. Returns the hit tick. */
function hit(s: Setup): number {
  s.pads.a!.stick(100, 0).dash();
  for (let i = 0; i < 30; i++) {
    const events = s.sim.step();
    if (ofType(events, 'collision').length > 0) {
      s.sim.setFrozen('a', true);
      s.sim.setFrozen('b', true);
      s.pads.a!.stick(0, 0);
      return s.sim.snapshot().tick;
    }
  }
  throw new Error('no hit');
}

function stepsUntil(sim: SimWorld, tick: number): void {
  run(sim, tick - sim.snapshot().tick);
}

describe('knockout credit (sim)', () => {
  const place = { a: [-150, 0], b: [-40, 0] } as Record<string, [number, number]>;

  it('credits the last egg toucher within 3 s, null after', () => {
    for (const [delay, expected] of [
      [179, 'a'],
      [180, 'a'],
      [181, null],
    ] as const) {
      const s = setup(['a', 'b'], place);
      const t0 = hit(s);
      stepsUntil(s.sim, t0 + delay - 1);
      const out = ofType(pushOut(s.sim, 'b'), 'eliminated'); // eliminated at t0 + delay
      expect(out).toEqual([
        { type: 'eliminated', id: 'b', by: expected, byGhost: false, respawnMs: 4000 },
      ]);
    }
  });

  it('an untouched egg rings out with no credit', () => {
    const s = setup(['a', 'b'], place);
    expect(ofType(pushOut(s.sim, 'b'), 'eliminated')[0]!.by).toBeNull();
  });

  describe('ghost pulses never set or reset last touch', () => {
    // c becomes a ghost first; a and b stay apart until a's dash.
    const place3 = { a: [-150, 0], b: [-40, 0], c: [0, 150] } as Record<string, [number, number]>;

    function withGhost() {
      const s = setup(['a', 'b', 'c'], place3);
      makeGhost(s.sim, 'c');
      return s;
    }

    /** Park the ghost on b and pulse; returns the tick the pulse fired. */
    function pulseB(s: Setup): number {
      const b = s.sim.bodyOf('b')!.position;
      s.sim.place('c', b.x - 30, b.y);
      s.pads.c!.dash();
      for (let i = 0; i < 40; i++) {
        if (ofType(s.sim.step(), 'pulse').length > 0) return s.sim.snapshot().tick;
      }
      throw new Error('no pulse');
    }

    it('a pulse on an untouched egg gives no credit', () => {
      const s = withGhost();
      pulseB(s);
      expect(ofType(pushOut(s.sim, 'b'), 'eliminated')[0]!.by).toBeNull();
    });

    it('a pulse keeps the living attacker’s credit', () => {
      const s = withGhost();
      const t0 = hit(s);
      pulseB(s);
      stepsUntil(s.sim, t0 + 150);
      expect(ofType(pushOut(s.sim, 'b'), 'eliminated')[0]!.by).toBe('a');
    });

    it('a pulse does not refresh the 3 s window', () => {
      const s = withGhost();
      const t0 = hit(s);
      run(s.sim, 100);
      const tp = pulseB(s);
      expect(tp).toBeGreaterThan(t0);
      stepsUntil(s.sim, t0 + 181);
      expect(ofType(pushOut(s.sim, 'b'), 'eliminated')[0]!.by).toBeNull();
    });
  });
});
