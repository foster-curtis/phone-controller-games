// RD5: enemy HP bars, the throw arc, the Warden's slam group swap and jump slam keys, the clip
// runtime's per-key group switch.
import { describe, expect, it } from 'vitest';
import type { Clip } from '../../../presentation/types';
import {
  DESTROYED_HOLD_MS,
  enemyBarWidth,
  enemyHasHpBar,
  flightProgress,
  hpBarShown,
  throwHeight,
} from '../buildLook';
import { sampleClip, blendSamples } from '../clip';
import { TILE_W } from '../camera';
import { JUMP_CROUCH_MS, JUMP_IMPACT_MS, JUMP_LIFT, SLAM_IMPACT_MS, clips } from '../clips/warden';
import { RIG_INFO } from '../gallery/rigInfo';

describe('enemy HP bars (SPEC §2.6)', () => {
  it('hidden at full HP, shown once damaged', () => {
    expect(hpBarShown(40, 40)).toBe(false);
    expect(hpBarShown(39, 40)).toBe(true);
  });

  it('none for Scrap mites or the Colossus; every other rig has one', () => {
    expect(enemyHasHpBar('mite', false)).toBe(false);
    expect(enemyHasHpBar('colossus', true)).toBe(false);
    for (const rig of ['drone', 'skitter', 'brute', 'bombard', 'wasp', 'stalker'])
      expect(enemyHasHpBar(rig, false), rig).toBe(true);
  });

  it('is wider for bigger enemies, within bounds', () => {
    const w = (rig: string) => enemyBarWidth(RIG_INFO[rig]!.hitbox, TILE_W);
    expect(w('brute')).toBeGreaterThan(w('drone'));
    expect(w('drone')).toBeGreaterThanOrEqual(w('skitter'));
    for (const rig of Object.keys(RIG_INFO)) {
      expect(w(rig)).toBeGreaterThanOrEqual(24);
      expect(w(rig)).toBeLessThanOrEqual(64);
    }
  });
});

describe('thrown builds (SPEC §7.5)', () => {
  it('start and end on the ground, peaking mid-throw', () => {
    expect(throwHeight(0, 5)).toBe(0);
    expect(throwHeight(1, 5)).toBeCloseTo(0);
    expect(throwHeight(0.5, 5)).toBeGreaterThan(throwHeight(0.2, 5));
  });

  it('flight progress clamps to 0..1', () => {
    expect(flightProgress(5, 10, 40)).toBe(0);
    expect(flightProgress(25, 10, 40)).toBe(0.5);
    expect(flightProgress(99, 10, 40)).toBe(1);
    expect(DESTROYED_HOLD_MS).toBeGreaterThan(0);
  });
});

describe('clip per-key group switch', () => {
  const clip: Clip = {
    durationMs: 100,
    loop: false,
    tracks: {
      a: [
        { t: 0, groups: { g: false } },
        { t: 50, groups: { g: true } },
      ],
    },
  };

  it('is off before the key, on from it, and absent when no key names the group', () => {
    expect(sampleClip(clip, 49).groups).toEqual({ g: false });
    expect(sampleClip(clip, 50).groups).toEqual({ g: true });
    expect(sampleClip({ ...clip, tracks: { a: [{ t: 0, rot: 3 }] } }, 10).groups).toBeUndefined();
  });

  it('a blend takes the incoming clip past the middle', () => {
    const on = sampleClip(clip, 60);
    const off = sampleClip(clip, 0);
    expect(blendSamples(off, on, 0.7).groups).toEqual({ g: true });
    expect(blendSamples(off, on, 0.3).groups).toEqual({ g: false });
  });
});

describe('Warden slam clips (art README "Redesign poses")', () => {
  const at = (name: string, t: number) => sampleClip(clips[name]!, t);
  const R = SLAM_IMPACT_MS;

  it('front and back swap to the slam group at the impact and back at the recover', () => {
    for (const view of ['front', 'back']) {
      const name = `attack@${view}`;
      expect(at(name, R - 5).groups?.slam).toBe(false);
      expect(at(name, R + 5).groups?.slam).toBe(true);
      expect(at(name, clips[name]!.durationMs).groups?.slam).toBe(false);
    }
  });

  it('hides the upright hammer and its glow while the head is down, and never flips sy negative', () => {
    for (const view of ['front', 'back']) {
      const name = `attack@${view}`;
      expect(at(name, R - 20).parts.get('hammer')!.alpha).toBe(1);
      expect(at(name, R + 20).parts.get('hammer')!.alpha).toBe(0);
      expect(at(name, R + 20).parts.get('hammer-glow')!.alpha).toBe(0);
      expect(at(name, clips[name]!.durationMs).parts.get('hammer')!.alpha).toBe(1);
      for (const keys of Object.values(clips[name]!.tracks))
        for (const k of keys) expect(k.sy ?? 1, `${name} sy`).toBeGreaterThan(0);
    }
  });

  it('hammer-down-glow pulses with the coil, brightest at the impact', () => {
    const glow = (t: number) => at('attack@front', t).parts.get('hammer-down-glow')!.glow;
    expect(glow(R)).toBeGreaterThan(glow(0));
    expect(glow(R)).toBeGreaterThan(glow(clips['attack@front']!.durationMs));
  });

  it('the side view lands the hammer on its short end (rot 64) with no group switch', () => {
    expect(at('attack@side', R).parts.get('hammer')!.rot).toBe(64);
    expect(at('attack@side', R).groups).toBeUndefined();
  });

  it('the jump slam crouches, lifts the torso 34 units, then lands with the same swap', () => {
    for (const view of ['side', 'front', 'back']) {
      const name = `super@${view}`;
      // RC2: 1/2 to 2/3 of RC1's 2.2 s clip.
      expect(clips[name]!.durationMs).toBeGreaterThanOrEqual(2200 / 2);
      expect(clips[name]!.durationMs).toBeLessThanOrEqual((2200 * 2) / 3);
      // The landing pose and the recover still fit after the impact.
      expect(clips[name]!.durationMs).toBeGreaterThan(JUMP_IMPACT_MS + 200);
      const crouch = at(name, JUMP_CROUCH_MS);
      const air = at(name, JUMP_IMPACT_MS - 200);
      const land = at(name, JUMP_IMPACT_MS + 10);
      expect(crouch.parts.get('torso')!.dy).toBeGreaterThan(0);
      expect(air.parts.get('torso')!.dy).toBe(-JUMP_LIFT);
      expect(land.parts.get('torso')!.dy).toBeGreaterThan(0);
      if (view === 'side') {
        expect(crouch.parts.get('frontleg')!.sy).toBeCloseTo(0.74);
        expect(land.parts.get('hammer')!.rot).toBe(64);
      } else {
        expect(crouch.parts.get('legs.l')?.sy ?? crouch.parts.get('legs.bl')?.sy).toBeCloseTo(0.74);
        expect(air.groups?.slam).toBe(false);
        expect(land.groups?.slam).toBe(true);
        expect(land.parts.get('hammer')!.alpha).toBe(0);
      }
    }
    expect(JUMP_LIFT).toBe(34);
  });
});
