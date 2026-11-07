// FF7-fix-5 (C4 note, SPEC §10.1, §15.7; was FF7-fix-4's latch): a held aimed button's TV preview
// (`PlayerEnt.mainAim`/`superAim`) shows while the aim is outside the center grace zone and hides while
// it is back inside; dragging out again shows it again. A release inside cancels (no fire from the
// phone), a release outside fires along the shown aim. Every class, main and super aimed buttons.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { AIM_DEAD_ZONE } from '../../../shared/messages';
import type { Vec2 } from '../../../content/types';
import type { PlayerInput } from '../types';
import { harness } from './harness';

type Slot = 'main' | 'super';
const OUT: Vec2 = { x: -0.6, y: 0.8 };
const OUT2: Vec2 = { x: 0.8, y: 0.6 };
const INSIDE: Vec2 = { x: 0.1, y: -0.12 };

const keys = (slot: Slot) =>
  slot === 'main'
    ? ({ aim: 'mainAim', aiming: 'mainAiming', fires: 'mainFires' } as const)
    : ({ aim: 'superAim', aiming: 'superAiming', fires: 'superFires' } as const);

function setup(classId: (typeof content.characters)[number]['id']) {
  const h = harness(1, 1, { classes: [classId] });
  h.toCombat();
  h.holdSpawns();
  return h;
}

function hold(h: ReturnType<typeof setup>, slot: Slot, aim: Vec2, aiming = true) {
  const k = keys(slot);
  h.pads[0]!.set({ [k.aim]: aim, [k.aiming]: aiming } as Partial<PlayerInput>);
  h.run(1);
  return h.p(0)[k.aim];
}

/** A release: the aiming flag drops, with a fire (outside) or without one (inside = cancel). */
function release(h: ReturnType<typeof setup>, slot: Slot, aim: Vec2 | null) {
  const k = keys(slot);
  h.p(0).superCharge = 1;
  if (aim) h.pads[0]!.tap(k.fires, { [k.aim]: aim, [k.aiming]: false } as Partial<PlayerInput>);
  else h.pads[0]!.set({ [k.aiming]: false } as Partial<PlayerInput>);
  return h.collect('attack', 240).filter((e) => e.slot === slot);
}

describe('aim preview: hidden only while in the grace zone', () => {
  it('the grace zone is a small center window, wider than the kit default for a thumb', () => {
    expect(AIM_DEAD_ZONE).toBeGreaterThan(0.12);
    expect(AIM_DEAD_ZONE).toBeLessThanOrEqual(0.3);
  });

  for (const def of content.characters) {
    for (const slot of ['main', 'super'] as const) {
      if (def.input[slot] !== 'aimed') continue;
      describe(`${def.id} ${slot}`, () => {
        it('a normal aimed hold previews every step; at the zone edge it shows nothing', () => {
          const h = setup(def.id);
          for (let i = 0; i < 30; i++) expect(hold(h, slot, OUT)).toEqual(OUT);
          expect(hold(h, slot, { x: 0, y: 0 }, false)).toBeNull();
          expect(hold(h, slot, { x: AIM_DEAD_ZONE, y: 0 })).toBeNull();
          expect(hold(h, slot, { x: 0.5, y: 0 })).toEqual({ x: 0.5, y: 0 });
        });

        it('(a) out, back in, out again: the preview comes back and the release fires along it', () => {
          const h = setup(def.id);
          expect(hold(h, slot, OUT)).toEqual(OUT);
          expect(hold(h, slot, INSIDE)).toBeNull();
          expect(h.p(0)[slot].held).toBe('cancelled');
          for (let i = 0; i < 10; i++) expect(hold(h, slot, INSIDE)).toBeNull();
          expect(hold(h, slot, OUT2)).toEqual(OUT2);
          expect(h.p(0)[slot].held).toBe('out');
          const shots = release(h, slot, OUT2);
          expect(shots.length).toBe(1);
          expect(shots[0]!.angle).toBeCloseTo(Math.atan2(OUT2.y, OUT2.x), 6);
          expect(h.p(0)[keys(slot).aim]).toBeNull();
        });

        it('(b) out, back in, release there: no attack', () => {
          const h = setup(def.id);
          hold(h, slot, OUT);
          expect(hold(h, slot, INSIDE)).toBeNull();
          expect(release(h, slot, null)).toHaveLength(0);
          expect(h.p(0)[keys(slot).aim]).toBeNull();
        });

        it('(c) a hold that never leaves the zone: no preview, no attack', () => {
          const h = setup(def.id);
          // The phone never sets the aiming flag for a press still in the zone.
          expect(hold(h, slot, { x: 0, y: 0 }, false)).toBeNull();
          expect(release(h, slot, null)).toHaveLength(0);
        });
      });
    }
  }
});
