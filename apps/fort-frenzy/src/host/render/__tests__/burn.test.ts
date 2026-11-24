// RD10-fix-1 (RC2 note 3): the flaming-arrows burn on an enemy is sized to its body, a fraction of
// its height with a cap, so it reads as a small flame on a mite and stays modest on the Colossus.
import { describe, expect, it } from 'vitest';
import { RIG_INFO } from '../gallery/rigInfo';
import { BODY_LOOK_FRACTION, BODY_LOOK_MAX_SCALE, bodyLookScale } from '../status';

/** The burn frames' height in sprite units (`burn-1`/`2` viewBox: 38; status.ts rounds to 40). */
const FRAME_H = 40;
const flameH = (rig: string) => bodyLookScale(RIG_INFO[rig]!.bodyH) * FRAME_H;

describe('burn scale by body size', () => {
  it('a mite and a Grunt get a flame in proportion to their body', () => {
    for (const rig of ['mite', 'drone']) {
      const h = RIG_INFO[rig]!.bodyH;
      expect(flameH(rig)).toBeCloseTo(BODY_LOOK_FRACTION * h, 6);
      expect(flameH(rig)).toBeLessThan(h / 2);
    }
    expect(flameH('mite') / flameH('drone')).toBeCloseTo(
      RIG_INFO.mite!.bodyH / RIG_INFO.drone!.bodyH,
      6,
    );
  });

  it('the Colossus is capped: a modest flame, no bigger than on a Brute', () => {
    expect(bodyLookScale(RIG_INFO.colossus!.bodyH)).toBe(BODY_LOOK_MAX_SCALE);
    expect(flameH('colossus')).toBeLessThan(RIG_INFO.colossus!.bodyH * 0.2);
    expect(flameH('colossus')).toBe(flameH('brute'));
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
      const h = RIG_INFO[rig]!.bodyH;
      expect(bodyLookScale(h)).toBeLessThanOrEqual(BODY_LOOK_MAX_SCALE);
      expect(bodyLookScale(h)).toBeLessThan(h / FRAME_H);
    }
  });
});
