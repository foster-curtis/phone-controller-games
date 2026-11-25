// The footman's sword slash (SPEC §2.4; RD9-fix-3, RC3): the blade, composed through torso and hand,
// turns ≥ 90° from wind-up to follow-through, crosses the aim at the impact and is back at rest by the
// end, in every view; the clip keeps the old stab's length and impact, and the facing holds through it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import rig from '../../../../art/neon-knights/rigs/footman.json';
import type { RigDef, RigView, ViewId } from '../../../presentation/types';
import { heldAim } from '../aim';
import { sampleClip } from '../clip';
import {
  clips,
  SLASH_FOLLOW_MS,
  SLASH_IMPACT_MS,
  SLASH_MS,
  SLASH_WINDUP_MS,
} from '../clips/footman';
import { attachPoint, composeView, partPoint } from '../rigMath';

const def = rig as unknown as RigDef;
const VIEWS: ViewId[] = ['side', 'front', 'back'];
/** The footman has no poses (that's the Ranger), so every view is a plain RigView. */
const viewOf = (v: ViewId) => def.views[v] as RigView;

/** The blade from the hand's wrist pivot to its tip (the `blade` attach), in rig units. */
function blade(view: ViewId, t: number) {
  const v = viewOf(view);
  const mats = composeView(v, sampleClip(clips[`attack@${view}`]!, t).parts);
  const wrist = partPoint(v, mats, 'hand', v.parts.hand!.pivot)!;
  const tip = attachPoint(v, mats, 'blade')!;
  return { tip, deg: (Math.atan2(tip[1] - wrist[1], tip[0] - wrist[0]) * 180) / Math.PI };
}

const turn = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

describe('footman sword slash (RD9-fix-3)', () => {
  it('keeps the stab’s length and impact, and the views share it', () => {
    expect(SLASH_MS).toBe(300);
    expect(SLASH_IMPACT_MS).toBe(90);
    expect(SLASH_WINDUP_MS).toBeLessThan(SLASH_IMPACT_MS);
    expect(SLASH_FOLLOW_MS).toBeGreaterThan(SLASH_IMPACT_MS);
    for (const v of VIEWS) {
      expect(clips[`attack@${v}`]!.durationMs, v).toBe(SLASH_MS);
      expect(clips[`attack@${v}`]!.loop, v).toBe(false);
    }
    expect(clips.attack).toBe(clips['attack@side']);
  });

  it.each(VIEWS)('%s: the blade sweeps ≥ 90° (≤ 140°) from wind-up to follow-through', (v) => {
    const sweep = Math.abs(turn(blade(v, SLASH_WINDUP_MS).deg, blade(v, SLASH_FOLLOW_MS).deg));
    expect(sweep).toBeGreaterThanOrEqual(90);
    expect(sweep).toBeLessThanOrEqual(140);
    // One way through the cut: every step turns the same direction.
    const dir = Math.sign(turn(blade(v, SLASH_WINDUP_MS).deg, blade(v, SLASH_IMPACT_MS).deg));
    for (let t = SLASH_WINDUP_MS; t < SLASH_FOLLOW_MS; t += 10)
      expect(Math.sign(turn(blade(v, t).deg, blade(v, t + 10).deg)), `${v} ${t}`).toBe(dir);
  });

  it('side: the blade points along the aim (level, forward) at the impact', () => {
    expect(Math.abs(blade('side', SLASH_IMPACT_MS).deg)).toBeLessThan(8);
    // Raised and back before, low and forward after.
    expect(blade('side', SLASH_WINDUP_MS).deg).toBeLessThan(-90);
    expect(blade('side', SLASH_FOLLOW_MS).deg).toBeGreaterThan(10);
  });

  it.each(['front', 'back'] as const)(
    '%s: the tip crosses his centre line (the aim, into or out of the picture) at the impact',
    (v) => {
      const mid = viewOf(v).foot[0];
      const side = (t: number) => Math.sign(blade(v, t).tip[0] - mid);
      expect(side(SLASH_WINDUP_MS)).toBe(-side(SLASH_FOLLOW_MS));
      expect(Math.abs(blade(v, SLASH_IMPACT_MS).tip[0] - mid)).toBeLessThan(3);
    },
  );

  it.each(VIEWS)('%s: every part is back at rest by the end', (v) => {
    for (const [part, p] of sampleClip(clips[`attack@${v}`]!, SLASH_MS).parts) {
      expect(p.rot, part).toBe(0);
      expect(p.dx, part).toBe(0);
      expect(p.dy, part).toBe(0);
    }
  });
});

describe('footman facing (RD5-fix-1 heldAim, RD9-fix-3)', () => {
  it('holds the slash’s angle while the clip plays, then lets the march turn him', () => {
    expect(heldAim('attack', false, 1.2)).toBe(1.2);
    expect(heldAim('attack', true, 1.2)).toBeNull();
    const src = readFileSync(join(import.meta.dirname, '../../scene/supportView.ts'), 'utf8');
    expect(src).toMatch(/heldAim\(s\.rig\.clip, s\.rig\.clipDone, s\.aim\)/);
    expect(src).toMatch(/if \(!held && \(moving \|\| !s\.facing\)\)/);
  });
});
