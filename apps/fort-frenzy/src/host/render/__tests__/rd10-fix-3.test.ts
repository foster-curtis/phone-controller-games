// RD10-fix-3 (RC3 note 1, SPEC §9, §9.6): the Wasp is drawn larger so it reads next to a Grunt, with
// its hull no higher (a little lower) over its shadow; its shadow, status sizes and body hitbox follow.
import { describe, expect, it } from 'vitest';
import { flyer as flyerDef } from '../../../content/balance';
import {
  WASP_ART_LIFT_TILES,
  WASP_C4_FLIGHT_TILES,
  WASP_DEATH_DROP,
  WASP_FLIGHT_TILES,
  WASP_HOVER_TILES,
  WASP_SCALE,
} from '../clips/wasp';
import { RIG_INFO } from '../gallery/rigInfo';

/** C4's Wasp (before RD10-fix-3): rig info and content body. */
const C4_INFO = { hitbox: 0.32, bodyH: 50, shadow: [18, 10.8] };
const C4_BODY = { radius: 0.43, bottom: 1.37, top: 1.76 };

describe('RC3: the Wasp is drawn larger', () => {
  it('draws at 1.4×, its shadow and sizes scaled to match', () => {
    const w = RIG_INFO.wasp!;
    expect(WASP_SCALE).toBe(1.4);
    expect(w.scale).toBe(WASP_SCALE);
    expect(w.shadow[0]).toBeCloseTo(C4_INFO.shadow[0]! * WASP_SCALE, 9);
    expect(w.shadow[1]).toBeCloseTo(C4_INFO.shadow[1]! * WASP_SCALE, 9);
    expect(w.bodyH).toBeCloseTo(C4_INFO.bodyH * WASP_SCALE, 9);
    expect(w.hitbox).toBeCloseTo(C4_INFO.hitbox * WASP_SCALE, 9);
    // Bigger than before, still smaller than a Grunt's body.
    expect(w.bodyH).toBeLessThan(RIG_INFO.drone!.bodyH);
    // No other rig has a draw scale.
    for (const [id, info] of Object.entries(RIG_INFO))
      if (id !== 'wasp') expect(info.scale).toBeUndefined();
  });

  it('its hull flies no higher over its shadow than before, about 10% lower', () => {
    expect(WASP_FLIGHT_TILES).toBeLessThanOrEqual(WASP_C4_FLIGHT_TILES);
    expect(WASP_FLIGHT_TILES / WASP_C4_FLIGHT_TILES).toBeCloseTo(0.9, 9);
    // Drawn: the scaled art lift plus the hover is the flight height (the hover is negative now).
    expect(WASP_ART_LIFT_TILES * WASP_SCALE + RIG_INFO.wasp!.fly!).toBeCloseTo(
      WASP_FLIGHT_TILES,
      9,
    );
    expect(RIG_INFO.wasp!.fly).toBe(WASP_HOVER_TILES);
    // The status looks' "legs" are the gap under the hull, so a burn sits on the hull.
    expect(RIG_INFO.wasp!.legH * (1 / 80) + WASP_HOVER_TILES).toBeCloseTo(WASP_FLIGHT_TILES, 9);
  });

  it('its death drop lands the parts on its ground point (art units, drawn scaled)', () => {
    expect(WASP_DEATH_DROP * WASP_SCALE).toBeCloseTo(WASP_HOVER_TILES * 80, 9);
  });

  it('its body hitbox is C4’s scaled by the drawing, at the new flight height', () => {
    const b = flyerDef.body;
    expect(b.bottom).toBeCloseTo(WASP_FLIGHT_TILES, 2);
    expect(b.radius).toBeCloseTo(C4_BODY.radius * WASP_SCALE, 1);
    expect(b.top - b.bottom).toBeCloseTo((C4_BODY.top - C4_BODY.bottom) * WASP_SCALE, 2);
    // Walking and collisions keep the feet circle (§9 body hitboxes).
    expect(flyerDef.radius).toBe(0.3);
  });
});
