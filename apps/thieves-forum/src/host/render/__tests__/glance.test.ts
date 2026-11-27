// TF1-fix-2 (user C1 follow-up; SPEC §6.6, §6.8, §12.2): glances aimed at the theft, sampled
// headless over every body facing × 8 target directions for the merchant and the citizen. Wind-up:
// the body keeps its facing and only the head turns a quarter (side head toward the target's side on
// a front/back body, front head on a side body). Look: body and head face the target. Caught →
// point at it from there; clear → body and head back to the original facing.
import { describe, expect, it } from 'vitest';
import { MANIFEST, RIGS } from '../assets';
import { CLIPS_BY_RIG } from '../clips/index';
import { sampleFrame } from '../drawn';
import {
  facingOf,
  facingToward,
  facingView,
  glanceSteps,
  planGlance,
  resolveGlance,
} from '../glance';
import type { Mat } from '../rigMath';
import {
  FACINGS,
  type Clip,
  type Facing4,
  type GlanceRig,
  type GlanceStep,
  type ViewId,
} from '../types';

const RIGS_GLANCING: GlanceRig[] = ['merchant', 'citizen'];

/** 8 target directions in world tiles (y down), with the facing that looks at each. */
const DIRS: { name: string; x: number; y: number; toward: Facing4 }[] = [
  { name: 'E', x: 1, y: 0, toward: 'right' },
  { name: 'SE', x: 1, y: 1, toward: 'right' },
  { name: 'S', x: 0, y: 1, toward: 'front' },
  { name: 'SW', x: -1, y: 1, toward: 'left' },
  { name: 'W', x: -1, y: 0, toward: 'left' },
  { name: 'NW', x: -1, y: -1, toward: 'left' },
  { name: 'N', x: 0, y: -1, toward: 'back' },
  { name: 'NE', x: 1, y: -1, toward: 'right' },
];

function clipOf(rig: GlanceRig, name: string, view: ViewId): Clip {
  const byName = CLIPS_BY_RIG[rig];
  const c = byName[`${name}@${view}`] ?? byName[name];
  if (!c) throw new Error(`${rig}/${name}@${view} missing`);
  return c;
}

/** The step's frame at time t (end of a one-shot by default). */
function frameOf(rig: GlanceRig, step: GlanceStep, t?: number) {
  const clip = clipOf(rig, step.clip, step.view);
  return sampleFrame(RIGS[rig], step.view, clip, t ?? clip.durationMs);
}

/** A part is drawn mirrored on screen when its matrix flips, xor the rig's own mirror. */
const flipped = (m: Mat, rigMirror: boolean) => m[0] * m[3] - m[1] * m[2] < 0 !== rigMirror;

describe('aimed glance (TF1-fix-2)', () => {
  for (const rig of RIGS_GLANCING)
    for (const facing of FACINGS)
      for (const d of DIRS) {
        const label = `${rig} facing ${facing}, target ${d.name}`;
        it(label, () => {
          const plan = planGlance(rig, facing, d);
          const body = facingView(facing);
          expect(plan.facing).toBe(facing);
          expect(plan.toward).toBe(d.toward);

          // Wind-up: the body stays, the head alone turns a quarter, never to its back.
          const w = plan.windup;
          expect([w.view, w.mirror]).toEqual([body.view, body.mirror]);
          for (const t of [0, w.ms! / 2, w.ms!]) {
            const { drawn, mats } = frameOf(rig, w, t);
            expect(drawn.body, label).toBe(body.view);
            expect(drawn.from.tunic!.view).toBe(body.view);
            expect(drawn.from['leg-l']!.view).toBe(body.view);
            const head = drawn.from.head!.view;
            expect(head, `${label} head`).toBe(body.view === 'side' ? 'front' : 'side');
            expect(['front', 'side']).toContain(head);
            expect(drawn.from.hair!.view).toBe(head);
            if (body.view !== 'side') {
              // The side head turns toward the target's screen side (default right when dead on).
              const want = d.x < 0 ? 'left' : 'right';
              expect(plan.headSide).toBe(want);
              expect(flipped(mats.get('head')!, w.mirror), `${label} head side`).toBe(
                want === 'left',
              );
            } else {
              expect(plan.headSide).toBeNull();
            }
            for (const [part, f] of Object.entries(drawn.from))
              if (drawn.rp.parts[part]!.src)
                expect(MANIFEST.frames[`${rig}/${f.view}/${f.pose}/${part}`]).toBeDefined();
          }

          // Look: body and head together in the view facing the target.
          const lk = plan.look;
          const want = facingView(d.toward);
          expect([lk.view, lk.mirror]).toEqual([want.view, want.mirror]);
          const look = frameOf(rig, lk, 300);
          expect(look.drawn.body).toBe(want.view);
          for (const f of Object.values(look.drawn.from)) expect(f.view).toBe(want.view);
          expect(flipped(look.mats.get('head')!, lk.mirror)).toBe(lk.mirror);

          // Caught: point and shout at the target from the look facing.
          const [pt, ...restCaught] = resolveGlance(plan, 'caught');
          expect(restCaught).toEqual([]);
          expect(pt!.stage).toBe('point');
          expect(pt!.clip).toBe('point');
          expect(facingOf(pt!.view, pt!.mirror)).toBe(d.toward);
          const point = frameOf(rig, pt!, 0);
          expect(point.drawn.body).toBe(want.view);
          expect(clipOf(rig, 'point', pt!.view)).toBe(
            CLIPS_BY_RIG[rig][`point@${pt!.view}`] ?? CLIPS_BY_RIG[rig].point,
          );

          // Clear: body and head back in the original facing.
          const back = resolveGlance(plan, 'clear');
          const last = back[back.length - 1]!;
          expect(last.stage).toBe('turnBack');
          expect([last.view, last.mirror]).toEqual([body.view, body.mirror]);
          const end = frameOf(rig, last);
          expect(end.drawn.body).toBe(body.view);
          for (const f of Object.values(end.drawn.from)) expect(f.view).toBe(body.view);
          expect(flipped(end.mats.get('head')!, last.mirror)).toBe(last.mirror);

          expect(glanceSteps(plan, 'clear').map((s) => s.stage)).toEqual([
            'windup',
            'look',
            'turnBack',
          ]);
        });
      }

  it('the side of a dead-ahead or dead-behind head turn is deterministic', () => {
    for (const rig of RIGS_GLANCING)
      for (const facing of ['front', 'back'] as const)
        for (const dir of [
          { x: 0, y: 1 },
          { x: 0, y: -1 },
          { x: 0.05, y: -1 },
        ]) {
          expect(planGlance(rig, facing, dir).headSide).toBe('right');
          expect(planGlance(rig, facing, dir, { seed: 7 }).headSide).toBe('left');
          expect(planGlance(rig, facing, dir, { seed: 8 }).headSide).toBe('right');
          expect(planGlance(rig, facing, dir, { seed: 7 })).toEqual(
            planGlance(rig, facing, dir, { seed: 7 }),
          );
        }
  });

  it('a mirrored rig and a facing in radians plan the same glance', () => {
    expect(planGlance('merchant', Math.PI, { x: 0, y: 1 }).facing).toBe('left');
    expect(planGlance('citizen', -Math.PI / 2, { x: 0, y: 1 }).facing).toBe('back');
    expect(facingToward({ x: 2, y: -0.5 })).toBe('right');
    for (const f of FACINGS) expect(facingOf(facingView(f).view, facingView(f).mirror)).toBe(f);
  });

  it("the user's examples: merchant at the shelf, theft at the counter; NPC pickpocketed from behind", () => {
    // Merchant facing the back shelf (up-screen), thief at the counter behind him to the left.
    const m = planGlance('merchant', 'back', { x: -2, y: 1.5 });
    expect([m.windup.view, m.headSide]).toEqual(['back', 'left']);
    expect(m.toward).toBe('left');
    // Merchant serving at the counter (facing front), theft at the far end of the counter, right.
    const c = planGlance('merchant', 'front', { x: 3, y: 0.2 });
    expect([c.windup.view, c.headSide, c.toward]).toEqual(['front', 'right', 'right']);
    // NPC walking right, pickpocket behind: front head on the side body, then turns around.
    const n = planGlance('citizen', 'right', { x: -1, y: 0 });
    expect(frameOf('citizen', n.windup).drawn.from.head!.view).toBe('front');
    expect(n.toward).toBe('left');
    expect(resolveGlance(n, 'clear')[0]).toMatchObject({ view: 'side', mirror: false });
  });
});
