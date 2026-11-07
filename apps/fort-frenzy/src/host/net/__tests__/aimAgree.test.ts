// FF7-fix-5 (C4, SPEC §10.1, §15.7): the phone's aimed release rule and the TV preview agree through the
// real tuple. The phone's gesture machine and encoders → the tuple → `tupleToInput` → the sim: wherever
// the thumb is, the TV shows the aim exactly when a release there would fire, along the aim it would
// fire with, and hides it exactly when a release would cancel.
import { describe, expect, it } from 'vitest';
import {
  AIM_DEAD_ZONE_PX,
  AIM_MAX_PX,
  aimGesture,
  createPhoneSender,
  encodeAimed,
  encodeAimedState,
  type AttackKey,
} from '../../../controller/input';
import { AIM_DEAD_ZONE, type InputTuple } from '../../../shared/messages';
import { harness } from '../../sim/__tests__/harness';
import { tupleToInput } from '../input';

type Gesture = Parameters<ReturnType<typeof aimGesture>['step']>[1];
/** A gesture input without its time (the rig stamps it); distributes over the union. */
type Untimed = Gesture extends infer G ? (G extends unknown ? Omit<G, 't'> : never) : never;

/** Absolute angle between two directions, radians. */
const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

function rig(key: AttackKey) {
  // Engineer (Ranger): aimed main; Quartermaster (Artificer): aimed super.
  const h = harness(1, 1, { classes: [key === 'main' ? 'engineer' : 'quartermaster'] });
  h.toCombat();
  h.holdSpawns();
  const sender = createPhoneSender(() => {});
  const m = aimGesture();
  let st = m.initial();
  let t = 0;
  const fired: { angle: number }[] = [];
  const shots = () => fired;
  /** Feeds one gesture input on the phone, then one sim step with the resulting tuple. */
  const feed = (i: Untimed, dt = 20) => {
    t += dt;
    const r = m.step(st, { ...i, t } as Gesture);
    st = r.state;
    encodeAimedState(sender, key, st);
    for (const o of r.out) encodeAimed(sender, key, o);
    h.pads[0]!.set(tupleToInput(sender.tuple() as InputTuple));
    h.p(0).superCharge = 1;
    fired.push(...h.collect('attack', 1).filter((e) => e.slot === key));
    return { out: r.out, preview: h.p(0)[key === 'main' ? 'mainAim' : 'superAim'] };
  };
  return { h, feed, shots, phase: () => st.phase };
}

describe('phone release rule = TV preview', () => {
  it('the phone grace zone is the shared fraction of the clamp', () => {
    expect(aimGesture().config.deadZonePx).toBe(AIM_DEAD_ZONE_PX);
    expect(AIM_DEAD_ZONE_PX).toBeCloseTo(AIM_DEAD_ZONE * AIM_MAX_PX, 9);
  });

  for (const key of ['main', 'super'] as const) {
    it(`${key}: around the zone edge, shown ⇔ a release there would fire, along that aim`, () => {
      const { feed } = rig(key);
      const m = aimGesture();
      feed({ type: 'down' });
      feed({ type: 'move', dx: 60, dy: 0 });
      for (let deg = 0; deg < 360; deg += 7) {
        const a = (deg * Math.PI) / 180;
        for (let r = AIM_DEAD_ZONE_PX - 2; r <= AIM_DEAD_ZONE_PX + 2; r += 0.05) {
          const dx = r * Math.cos(a);
          const dy = r * Math.sin(a);
          const { preview } = feed({ type: 'move', dx, dy });
          // What a release right here would do on the phone (a pure step; the hold goes on).
          const would = m.step({ phase: 'aiming', downAt: 0, x: dx, y: dy }, { type: 'up', t: 999 })
            .out[0]!;
          if (would.kind === 'fire') {
            expect(preview, `r=${r} deg=${deg}`).not.toBeNull();
            expect(turn(Math.atan2(preview!.y, preview!.x), a)).toBeLessThan(0.07);
          } else {
            expect(would.kind).toBe('cancel');
            expect(preview, `r=${r} deg=${deg}`).toBeNull();
          }
        }
      }
    });

    it(`${key} (a): out, in, out again → the preview is back and the release fires along it`, () => {
      const { feed, shots } = rig(key);
      feed({ type: 'down' });
      expect(feed({ type: 'move', dx: 0, dy: -50 }).preview).not.toBeNull();
      expect(feed({ type: 'move', dx: 3, dy: -4 }).preview).toBeNull();
      expect(feed({ type: 'move', dx: 2, dy: 2 }).preview).toBeNull();
      const back = feed({ type: 'move', dx: 40, dy: 30 }).preview!;
      expect(back).not.toBeNull();
      const shown = Math.atan2(back.y, back.x);
      expect(turn(shown, Math.atan2(30, 40))).toBeLessThan(0.02);
      const up = feed({ type: 'up', dx: 40, dy: 30 }, 300);
      expect(up.out).toEqual([{ kind: 'fire', x: 40, y: 30 }]);
      expect(up.preview).toBeNull();
      const s = shots();
      expect(s).toHaveLength(1);
      // Along the shown aim: the same tuple ints.
      expect(s[0]!.angle).toBeCloseTo(shown, 9);
    });

    it(`${key} (b): out, back in, release there → no attack`, () => {
      const { feed, shots } = rig(key);
      feed({ type: 'down' });
      feed({ type: 'move', dx: -50, dy: 0 });
      expect(feed({ type: 'move', dx: -10, dy: 8 }).preview).toBeNull();
      const up = feed({ type: 'up', dx: -10, dy: 8 }, 300);
      expect(up.out).toEqual([{ kind: 'cancel' }]);
      for (let i = 0; i < 60; i++) feed({ type: 'tick' });
      expect(shots()).toHaveLength(0);
    });

    it(`${key} (c): a release in the zone after the tap window, never dragged out → no attack`, () => {
      const { feed, shots } = rig(key);
      feed({ type: 'down' });
      expect(feed({ type: 'move', dx: 6, dy: -9 }).preview).toBeNull();
      const up = feed({ type: 'up', dx: 6, dy: -9 }, 300);
      expect(up.out).toEqual([{ kind: 'cancel' }]);
      for (let i = 0; i < 60; i++) feed({ type: 'tick' });
      expect(shots()).toHaveLength(0);
    });
  }
});
