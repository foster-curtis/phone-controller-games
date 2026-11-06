// FF7-fix-4 (early C4 note, SPEC §15.7): once a held aimed button counts as cancelled (it left the dead
// zone and came back, so a release would cancel), the TV's aim preview (`PlayerEnt.mainAim`/`superAim`)
// hides on that step and stays hidden until the button is let go and pressed again. A normal aimed
// hold still previews, and a release still fires or cancels by the phone's rule alone.
import { AIMED_DEFAULTS } from '@pcg/controller-kit';
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { AIM_DEAD_ZONE } from '../../../shared/messages';
import type { Vec2 } from '../../../content/types';
import type { PlayerInput } from '../types';
import { harness } from './harness';

type Slot = 'main' | 'super';
const OUT: Vec2 = { x: -0.6, y: 0.8 };
const INSIDE: Vec2 = { x: 0.05, y: -0.06 };

const keys = (slot: Slot) =>
  slot === 'main'
    ? ({ aim: 'mainAim', aiming: 'mainAiming' } as const)
    : ({ aim: 'superAim', aiming: 'superAiming' } as const);

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

describe('aim preview hides on cancel', () => {
  it('the sim dead zone is the phone gesture rule', () => {
    expect(AIM_DEAD_ZONE * AIMED_DEFAULTS.maxPx).toBeCloseTo(AIMED_DEFAULTS.deadZonePx, 9);
  });

  for (const def of content.characters) {
    for (const slot of ['main', 'super'] as const) {
      if (def.input[slot] !== 'aimed') continue;
      describe(`${def.id} ${slot}`, () => {
        it('a normal aimed hold previews every step', () => {
          const h = setup(def.id);
          for (let i = 0; i < 30; i++) expect(hold(h, slot, OUT)).toEqual(OUT);
          // A slow drag out: under the dead zone it shows nothing, once out it previews.
          expect(hold(h, slot, { x: 0, y: 0 }, false)).toBeNull();
          expect(hold(h, slot, { x: AIM_DEAD_ZONE, y: 0 })).toBeNull();
          expect(hold(h, slot, { x: 0.5, y: 0 })).toEqual({ x: 0.5, y: 0 });
        });

        it('a hold back in the dead zone hides on that step and until a new press', () => {
          const h = setup(def.id);
          expect(hold(h, slot, OUT)).toEqual(OUT);
          expect(hold(h, slot, INSIDE)).toBeNull();
          // Still held: dragging out again keeps it hidden for the rest of this hold.
          for (let i = 0; i < 20; i++) expect(hold(h, slot, OUT)).toBeNull();
          expect(hold(h, slot, { x: 0, y: 0 }, false)).toBeNull();
          // A new press previews again.
          expect(hold(h, slot, OUT)).toEqual(OUT);
        });
      });
    }
  }

  it('a cancelled preview does not change when a release fires', () => {
    const h = setup('warden');
    hold(h, 'main', OUT);
    hold(h, 'main', INSIDE);
    hold(h, 'main', OUT);
    expect(h.p(0).mainAim).toBeNull();
    // The phone dragged out again and released outside the dead zone: it fires as before.
    h.pads[0]!.tap('mainFires', { mainAim: OUT, mainAiming: false });
    expect(h.collect('attack', 120).filter((e) => e.slot === 'main').length).toBe(1);
  });
});
