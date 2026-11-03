// Clip runtime and rig composition math (SPEC §15.2).
import { describe, expect, it } from 'vitest';
import type { Clip, RigView } from '../../../themes/types';
import { applyOrder, blendSamples, clipTime, REST, sampleClip } from '../clip';
import { clips as colossus, COLOSSUS_ORDERS } from '../clips/colossus';
import { apply, composeView, decompose } from '../rigMath';

const clip: Clip = {
  durationMs: 1000,
  loop: true,
  tracks: {
    arm: [
      { t: 0, rot: 0 },
      { t: 500, rot: 20, dy: 4 },
      { t: 1000, rot: 0 },
    ],
  },
};

describe('clip sampling', () => {
  it('interpolates per field between the keys that set it, and wraps loops', () => {
    expect(sampleClip(clip, 250).parts.get('arm')!.rot).toBeCloseTo(10);
    expect(sampleClip(clip, 1250).parts.get('arm')!.rot).toBeCloseTo(10);
    // dy is only keyed at 500: held at both ends.
    expect(sampleClip(clip, 100).parts.get('arm')!.dy).toBe(4);
    expect(sampleClip(clip, 100).parts.get('arm')!.sx).toBe(1);
  });

  it('clamps one-shot clips at their end', () => {
    expect(clipTime({ ...clip, loop: false }, 5000)).toBe(1000);
    expect(clipTime(clip, -250)).toBe(750);
  });

  it('crossfades two samples', () => {
    const a = sampleClip(clip, 500);
    const b = { parts: new Map([['arm', { ...REST, rot: -20 }]]), order: null };
    expect(blendSamples(a, b, 0.5).parts.get('arm')!.rot).toBeCloseTo(0);
    expect(blendSamples(a, b, 1)).toBe(b);
  });

  it('applies per-key draw-order swaps in the named parts’ own slots', () => {
    expect(applyOrder(['a', 'far', 'b', 'near', 'c'], ['near', 'far'])).toEqual([
      'a',
      'near',
      'b',
      'far',
      'c',
    ]);
    expect(applyOrder(['a', 'b'], null)).toEqual(['a', 'b']);
  });

  it('swaps the Colossus legs at mid-stride, with the front leg scaled up', () => {
    const walk = colossus.walk!;
    const at = (u: number) => sampleClip(walk, u * walk.durationMs);
    expect(at(0.1).order).toEqual(COLOSSUS_ORDERS.FAR_FRONT);
    expect(at(0.3).order).toEqual(COLOSSUS_ORDERS.NEAR_FRONT);
    expect(at(0.8).order).toEqual(COLOSSUS_ORDERS.FAR_FRONT);
    const near = COLOSSUS_ORDERS.NEAR_FRONT;
    const far = COLOSSUS_ORDERS.FAR_FRONT;
    expect(far.indexOf('leg-far')).toBeGreaterThan(far.indexOf('torso'));
    expect(near.indexOf('leg-near')).toBeGreaterThan(near.indexOf('torso'));
    expect([...far].sort()).toEqual([...near].sort());
    expect(at(0.5).parts.get('leg-near')!.sx).toBeCloseTo(1.04);
    expect(at(0.0).parts.get('leg-far')!.sx).toBeCloseTo(1.04);
  });
});

describe('rig composition', () => {
  const view: RigView = {
    foot: [50, 100],
    order: ['torso', 'arm', 'hand'],
    parts: {
      torso: { frame: 'x/side/torso', pivot: [50, 80], at: [50, 80] },
      arm: { frame: 'x/side/arm', pivot: [60, 50], at: [60, 50], parent: 'torso' },
      hand: { frame: 'x/side/hand', pivot: [60, 70], at: [60, 70], parent: 'arm' },
    },
  };

  it('is the identity at rest (parts stack with no offsets)', () => {
    const mats = composeView(view, new Map());
    for (const m of mats.values()) {
      expect(apply(m, 12, 34)[0]).toBeCloseTo(12);
      expect(apply(m, 12, 34)[1]).toBeCloseTo(34);
    }
  });

  it('turns parts about their pivots, chained through parents', () => {
    const mats = composeView(view, new Map([['arm', { ...REST, rot: 90 }]]));
    // The arm turns 90° clockwise about (60, 50): its hand joint (60, 70) swings to (40, 50).
    const [hx, hy] = apply(mats.get('hand')!, 60, 70);
    expect(hx).toBeCloseTo(40);
    expect(hy).toBeCloseTo(50);
    const d = decompose(mats.get('hand')!, [60, 70]);
    expect(d.rotation).toBeCloseTo(Math.PI / 2);
    expect(d.scaleX).toBeCloseTo(1);
    // The torso, a parent, doesn't move.
    expect(apply(mats.get('torso')!, 0, 0)).toEqual([0, 0]);
  });

  it('carries a parent translation to its children', () => {
    const mats = composeView(view, new Map([['torso', { ...REST, dy: 5 }]]));
    expect(apply(mats.get('hand')!, 60, 70)[1]).toBeCloseTo(75);
  });
});
