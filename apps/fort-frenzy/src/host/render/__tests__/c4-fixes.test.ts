// FF10-fix-2: runnable checks for the early C4 notes (BUILD_PLAN §3 fix milestones). Note 1: the Wasp
// flies at half its height. Note 2: content bodies (what our attacks hit, sim body.ts) match the
// drawn art, the Wasp's at its new flight height, the Colossus's kept low.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { neonKnightsHost } from '../../../themes/neon-knights/host';
import type { RigView } from '../../../themes/types';
import { WASP_ART_LIFT_TILES, WASP_FLIGHT_TILES, WASP_HOVER_TILES } from '../clips/wasp';
import { RIG_INFO } from '../gallery/rigInfo';

/** FF10's render hover over the art's lift (C3), tiles. */
const OLD_HOVER = 1.6;
const enemy = (id: string) => content.enemies.find((e) => e.id === id)!;
const side = (rig: string) => neonKnightsHost.rigs[rig]!.views.side as RigView;
/** Height of a rig point above its feet, tiles (80 sprite units). */
const heightOf = (rig: string, y: number) => (side(rig).foot[1] - y) / 80;

describe('C4 note 1: the Wasp flies at half its old height', () => {
  it('its hull flies half as high over its shadow as in FF10', () => {
    const old = WASP_ART_LIFT_TILES + OLD_HOVER;
    expect(WASP_FLIGHT_TILES).toBeCloseTo(old / 2, 9);
    expect(WASP_HOVER_TILES).toBeCloseTo(WASP_FLIGHT_TILES - WASP_ART_LIFT_TILES, 9);
    expect(WASP_HOVER_TILES).toBeGreaterThan(0);
    // The world and the gallery draw it at that hover.
    expect(RIG_INFO.wasp!.fly).toBe(WASP_HOVER_TILES);
  });

  it('its art lift is the hull’s underside over the rig’s foot', () => {
    // body.svg's underside is at y 30 (the part's pivot sits inside the hull, above it).
    expect(heightOf('wasp', 30)).toBeCloseTo(WASP_ART_LIFT_TILES, 9);
    expect(side('wasp').parts.body!.pivot[1]).toBeLessThan(30);
  });

  it('its body hitbox is at the new height', () => {
    const b = enemy('flyer').body!;
    expect(b.bottom).toBeCloseTo(WASP_FLIGHT_TILES, 2);
    expect(b.top).toBeGreaterThan(b.bottom);
  });
});

describe('C4 note 2: bodies cover the drawn body', () => {
  it('every enemy has a body reaching above its feet circle, below its rig’s top', () => {
    const rigFor = neonKnightsHost.rigFor.enemy;
    for (const e of content.enemies) {
      const b = e.body;
      expect(b, e.id).toBeDefined();
      expect(b!.top, e.id).toBeGreaterThan(b!.bottom);
      expect(b!.radius, e.id).toBeGreaterThan(0);
      if (e.flying) continue;
      expect(b!.bottom, e.id).toBe(0);
      const rig = rigFor[e.id];
      const top = side(rig).attach?.top;
      if (!top || rig === 'colossus') continue;
      // `top` rides the highest part (spikes, rotor, barrel); the body never pokes above it.
      const restTop = heightOf(rig, top.at[1]);
      expect(b!.top, e.id).toBeLessThanOrEqual(restTop + 0.02);
    }
  });

  it('the Colossus is bigger than its feet but its top stays well below its drawn head', () => {
    const c = enemy('colossus');
    expect(c.body!.radius).toBeGreaterThan(c.radius);
    const neck = heightOf('colossus', side('colossus').parts.head!.pivot[1]);
    expect(neck).toBeGreaterThan(1.5);
    expect(c.body!.top).toBeLessThan(neck * 0.6);
  });
});
