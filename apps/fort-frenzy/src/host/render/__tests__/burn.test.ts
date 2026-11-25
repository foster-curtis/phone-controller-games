// RD10-fix-1 (RC2 note 3): the flaming-arrows burn on an enemy is sized to its body, a fraction of
// its height with a cap. RD10-fix-2 (RC2 note "flames are now too small"): the size sits about halfway
// between the old full-height flame and RD10-fix-1's 0.45 × body, capped at 1.1× the frame.
import { describe, expect, it } from 'vitest';
import { RIG_INFO } from '../gallery/rigInfo';
import { BODY_LOOK_FRACTION, BODY_LOOK_MAX_SCALE, bodyLookScale } from '../status';

/** The burn frames' height in sprite units (`burn-1`/`2` viewBox: 38; status.ts rounds to 40). */
const FRAME_H = 40;
const bodyH = (rig: string) => RIG_INFO[rig]!.bodyH;
const flameH = (rig: string) => bodyLookScale(bodyH(rig)) * FRAME_H;
/** Before RD10-fix-1: the frame scaled to the full body height. */
const oldScale = (rig: string) => bodyH(rig) / FRAME_H;
/** RD10-fix-1: 0.45 of the body height, capped at 1.1× the frame. */
const fix1Scale = (rig: string) => Math.min(1.1, (0.45 * bodyH(rig)) / FRAME_H);

describe('burn scale by body size', () => {
  it('a Grunt and a Brute sit between the old size and the RD10-fix-1 size', () => {
    // Grunt: old 2.0, fix-1 0.9, now 1.4. Brute: old 3.125, fix-1 1.1, now 2.1875.
    for (const rig of ['drone', 'brute']) {
      const s = bodyLookScale(bodyH(rig));
      expect(s).toBeGreaterThan(fix1Scale(rig));
      expect(s).toBeLessThan(oldScale(rig));
    }
    expect(bodyLookScale(bodyH('drone'))).toBeCloseTo(1.4, 6);
    expect(bodyLookScale(bodyH('brute'))).toBeCloseTo(2.1875, 6);
  });

  it('is within 10% of the halfway height on a Grunt, Brute, Flyer and the Colossus', () => {
    for (const rig of ['drone', 'brute', 'wasp', 'colossus']) {
      const halfway = ((oldScale(rig) + fix1Scale(rig)) / 2) * FRAME_H;
      expect(Math.abs(flameH(rig) / halfway - 1)).toBeLessThan(0.1);
    }
  });

  it('a mite and a Grunt get a flame in proportion to their body', () => {
    for (const rig of ['mite', 'drone']) {
      expect(flameH(rig)).toBeCloseTo(BODY_LOOK_FRACTION * bodyH(rig), 6);
    }
    expect(flameH('mite') / flameH('drone')).toBeCloseTo(bodyH('mite') / bodyH('drone'), 6);
  });

  it('only the Colossus reaches the cap, and it stays well under its body height', () => {
    expect(bodyLookScale(bodyH('colossus'))).toBe(BODY_LOOK_MAX_SCALE);
    expect(flameH('colossus')).toBeLessThan(bodyH('colossus') * 0.6);
    expect(bodyLookScale(bodyH('brute'))).toBeLessThan(BODY_LOOK_MAX_SCALE);
  });

  it('never grows past the cap and is smaller on every enemy than the old full-height flame', () => {
    for (const rig of [
      'drone',
      'skitter',
      'brute',
      'bombard',
      'wasp',
      'mite',
      'stalker',
      'colossus',
    ]) {
      expect(bodyLookScale(bodyH(rig))).toBeLessThanOrEqual(BODY_LOOK_MAX_SCALE);
      expect(bodyLookScale(bodyH(rig))).toBeLessThan(oldScale(rig));
    }
  });
});
