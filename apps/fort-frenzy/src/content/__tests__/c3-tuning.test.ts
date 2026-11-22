// C3 tuning (FF7-fix-2, BUILD_PLAN §8): the Warden's slam and stomp got a slightly narrower spread and
// a slightly longer reach, and the Ranger's super a slightly larger radius. Pins the new numbers
// against the old ones so a later retune is a deliberate edit here too.
import { describe, expect, it } from 'vitest';
import { ranger, warden } from '../balance';

const OLD = {
  wardenMain: { range: 1.5, arcDeg: 120 },
  wardenSuper: { range: 3.2, arcDeg: 100 },
  rangerSuperRadius: 3,
};

describe('C3 knight tuning', () => {
  it('the Warden slam and stomp: ~15% narrower, ~15% longer', () => {
    expect(warden.main).toMatchObject({ range: 1.75, arcDeg: 102 });
    // The stomp's reach was retuned past C3's ~15% by the playtest balance (0fbe288): pin it as is.
    // RD3's jump slam: an arc as wide as the slam's, longer (§8.2).
    expect(warden.super).toMatchObject({ range: 4.7, arcDeg: warden.main.arcDeg });
    expect(warden.super.range).toBeGreaterThan(warden.main.range);
    expect(warden.super.damage).toBeLessThan(warden.main.damage);
    for (const [now, old] of [[warden.main, OLD.wardenMain]] as const) {
      expect(now.arcDeg / old.arcDeg).toBeGreaterThan(0.8);
      expect(now.arcDeg / old.arcDeg).toBeLessThan(0.9);
      expect(now.range / old.range).toBeGreaterThan(1.1);
      expect(now.range / old.range).toBeLessThan(1.2);
    }
  });

  it('the Ranger super: ~15% more radius', () => {
    expect(ranger.super.radius).toBe(3.5);
    expect(ranger.super.radius / OLD.rangerSuperRadius).toBeGreaterThan(1.1);
    expect(ranger.super.radius / OLD.rangerSuperRadius).toBeLessThan(1.2);
  });
});
