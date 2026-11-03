// FF9 render rules for the support classes (SPEC §2.4): the backpack gauge for 0–8 crates, the thrown
// cell landing on the receiver's carry point, shots leaving from the weapon, the morale aura's fade,
// the Field Medic circle drawn as dots, and the new clips.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { neonKnightsHost } from '../../../themes/neon-knights/host';
import { isPosed } from '../../../themes/types';
import { sampleClip } from '../../render/clip';
import { SLASH_CUT } from '../../render/clips/commander';
import { THROW_RELEASE_MS } from '../../render/clips/artificer';
import { GAUGE_GROUPS, gaugeGroups } from '../../render/gauge';
import { PROJECTILE_SPEEDS } from '../../render/effectsMath';
import { dottedAngles, moraleAlpha, shotAnchor, throwArc, throwProgress } from '../support';

const { rigs, clips } = neonKnightsHost;

describe('backpack gauge (§2.4, art README, bottom cell first per FF3-fix-1)', () => {
  it('for 0–8 crates: cell N from the bottom is full at ≥ 2N, half at 2N − 1, one state per cell', () => {
    // Bottom-up cell N is the art's core(4 − N).
    const expected = (crates: number) => {
      const out: string[] = [];
      for (let n = 1; n <= 3; n++) {
        const id = 4 - n;
        if (crates >= 2 * n) out.push(`core${id}-full`);
        else if (crates === 2 * n - 1) out.push(`core${id}-half`);
      }
      return out;
    };
    for (let c = 0; c <= 8; c++) {
      const g = gaugeGroups(c);
      expect(g, `${c} crates`).toEqual(expected(c));
      for (const cell of [1, 2, 3])
        expect(g.filter((x) => x.startsWith(`core${cell}-`)).length).toBeLessThanOrEqual(1);
    }
    // Each crate steps the gauge by half a cell; 6+ shows all three full (the cap is 8).
    expect(gaugeGroups(6)).toEqual(gaugeGroups(8));
    // Every group is a real optional group of the Artificer rig.
    for (const g of GAUGE_GROUPS) expect(Object.keys(rigs.artificer!.optional!)).toContain(g);
  });
});

describe('thrown cell (§2.4: lobs in an arc; C2: from the hand)', () => {
  const hand = { sx: 100, sy: 300 };
  const handFoot = { sx: 96, sy: 360 };
  const carry = { sx: 520, sy: 280 };
  const carryFoot = { sx: 516, sy: 340 };

  it('lands exactly on the receiver’s carry point, its shadow at their feet', () => {
    const end = throwArc(hand, handFoot, carry, carryFoot, 1, 80);
    expect([end.sx, end.sy]).toEqual([carry.sx, carry.sy]);
    expect([end.shadowSx, end.shadowSy]).toEqual([carryFoot.sx, carryFoot.sy]);
    const start = throwArc(hand, handFoot, carry, carryFoot, 0, 80);
    expect([start.sx, start.sy]).toEqual([hand.sx, hand.sy]);
  });

  it('arcs above the straight line, highest mid-flight, shadow on the ground line', () => {
    const mid = throwArc(hand, handFoot, carry, carryFoot, 0.5, 80);
    expect(mid.sy).toBeCloseTo((hand.sy + carry.sy) / 2 - 80, 6);
    expect(mid.shadowSy).toBeCloseTo((handFoot.sy + carryFoot.sy) / 2, 6);
    expect(mid.lift).toBeGreaterThan(throwArc(hand, handFoot, carry, carryFoot, 0.2, 80).lift);
  });

  it('stays in the hand until the throw clip’s release, then reaches 1 at landing', () => {
    expect(throwProgress(THROW_RELEASE_MS - 1, 600, THROW_RELEASE_MS)).toBe(0);
    expect(throwProgress(600, 600, THROW_RELEASE_MS)).toBe(1);
    expect(throwProgress(400, 600, THROW_RELEASE_MS)).toBeCloseTo(0.5, 6);
  });

  it('every receiver rig has a carry point in each view', () => {
    for (const id of ['ranger', 'warden']) {
      for (const v of Object.values(rigs[id]!.views)) {
        for (const rv of isPosed(v!) ? Object.values(v.poses) : [v!])
          expect(rv.attach?.carry, id).toBeDefined();
      }
    }
  });
});

describe('weapons, auras, circles', () => {
  it('the Artificer shoots from the lens (projector), others from the bolt point', () => {
    expect(shotAnchor('artificer')).toBe('lens');
    expect(shotAnchor('ranger')).toBe('bolt');
    for (const v of Object.values(rigs.artificer!.views))
      expect((v as { attach?: Record<string, unknown> }).attach?.lens).toBeDefined();
    const qm = content.characters.find((c) => c.id === 'quartermaster')!;
    expect(qm.main.speed).toBe(PROJECTILE_SPEEDS['nanite-bolt']);
  });

  it('the morale aura fades with the buff and is gone when it ends', () => {
    expect(moraleAlpha(6000, 6000)).toBeCloseTo(0.32, 9);
    expect(moraleAlpha(3000, 6000)).toBeCloseTo(0.16, 9);
    expect(moraleAlpha(0, 6000)).toBe(0);
  });

  it('the Field Medic circle is evenly spaced dots (never a filled or solid ring)', () => {
    const a = dottedAngles(28, 0);
    expect(a).toHaveLength(28);
    expect(a[1]! - a[0]!).toBeCloseTo((2 * Math.PI) / 28, 9);
  });
});

describe('clips (§2.4)', () => {
  it('ships the support classes’ attack, super, throw, plant, stab and collapse clips', () => {
    for (const c of ['artificer/attack', 'artificer/super', 'artificer/throw'])
      expect(clips[c], c).toBeDefined();
    for (const c of ['commander/attack', 'commander/super', 'commander/plant'])
      expect(clips[c], c).toBeDefined();
    for (const c of [
      'footman/attack',
      'footman/death',
      'footman/death@front',
      'footman/death@back',
    ])
      expect(clips[c], c).toBeDefined();
    for (const c of ['footman/death', 'footman/attack', 'commander/plant', 'artificer/throw'])
      expect(clips[c]!.loop, c).toBe(false);
  });

  it('the sword edge flares through the cut; the footman’s collapse fades out', () => {
    const glow = (t: number) =>
      sampleClip(clips['commander/attack']!, t).parts.get('sword-glow')?.glow ?? 1;
    expect(glow(SLASH_CUT[1])).toBeGreaterThan(2);
    expect(glow(0)).toBe(1);
    const death = clips['footman/death@side']!;
    const end = sampleClip(death, death.durationMs).parts.get('torso')!;
    expect(end.alpha).toBeLessThan(0.05);
  });
});
