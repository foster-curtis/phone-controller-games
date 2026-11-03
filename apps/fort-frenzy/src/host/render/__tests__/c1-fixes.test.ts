// FF3-fix-1: one runnable check per C1 gallery note (BUILD_PLAN §3 fix milestones). Feel notes are
// re-judged at C2; these pin the rules behind them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifest } from '../../../../generated/manifest';
import { neonKnightsHost } from '../../../themes/neon-knights/host';
import { isPosed, type RigView, type ThemeAssets } from '../../../themes/types';
import {
  citadelCollapseAt,
  CITADEL_COLLAPSE_MS,
  COLLAPSE_AT,
  smokeBaseAlpha,
  smokeLayers,
} from '../citadelFx';
import { applyOrder, REST, sampleClip, type PartPose } from '../clip';
import { bodyBurstPoints, PROJECTILE_SPEEDS } from '../effectsMath';
import { clipLandedMs, collapsePoses, ridesParent } from '../fall';
import { GAUGE_CELLS_BOTTOM_UP, gaugeGroups } from '../gauge';
import { apply, composeView } from '../rigMath';
import { half, splitView } from '../split';
import { crawlLook, locomotionClip, locomotionSpeed } from '../status';
import { turretMuzzleIndices } from '../structures';
import { MAX_WOBBLE, mitePack, mitePose } from '../swarm';
import { TURRET_AIMS } from '../types';

const { rigs, clips } = neonKnightsHost;
const KNIGHTS = ['warden', 'ranger', 'commander', 'artificer'];
const ENEMIES = ['drone', 'skitter', 'brute', 'bombard', 'wasp', 'mite', 'stalker', 'colossus'];
const art = join(import.meta.dirname, '..', '..', '..', '..', 'art', 'neon-knights');

/** Every view of a rig with splits applied; posed views give their default pose (a downed Ranger stands). */
const views = (rig: string) =>
  Object.entries(rigs[rig]!.views).flatMap(([view, v]) =>
    (isPosed(v!) ? [v.poses[v.defaultPose]!] : [v!]).map((rv) => ({
      view: view as 'side' | 'front' | 'back',
      rv: splitView(rig, view as 'side', rv, rigs[rig]!.viewBox).rv,
    })),
  );

const poseAt = (clip: string, t: number) => sampleClip(clips[clip]!, t);
const part = (s: ReturnType<typeof poseAt>, name: string): PartPose => s.parts.get(name) ?? REST;

describe('note 1: the Artificer gauge fills from the bottom cell up', () => {
  it('numbers the art cells top-down, so the bottom-up order is core3, core2, core1', () => {
    const y = (n: number) =>
      Number(
        /y="([\d.]+)"/.exec(
          readFileSync(join(art, 'characters', 'artificer', 'side', `core${n}-full.svg`), 'utf8'),
        )![1],
      );
    const ys = GAUGE_CELLS_BOTTOM_UP.map(y);
    expect(ys[0]).toBeGreaterThan(ys[1]!);
    expect(ys[1]).toBeGreaterThan(ys[2]!);
  });

  it('lights the bottom cell first, half then full, then climbs', () => {
    expect(gaugeGroups(0)).toEqual([]);
    expect(gaugeGroups(1)).toEqual(['core3-half']);
    expect(gaugeGroups(2)).toEqual(['core3-full']);
    expect(gaugeGroups(3)).toEqual(['core3-full', 'core2-half']);
    expect(gaugeGroups(4)).toEqual(['core3-full', 'core2-full']);
    expect(gaugeGroups(5)).toEqual(['core3-full', 'core2-full', 'core1-half']);
    for (const n of [6, 7, 8])
      expect(gaugeGroups(n)).toEqual(['core3-full', 'core2-full', 'core1-full']);
  });
});

describe('note 2: every enemy and the Colossus has a hit clip', () => {
  it('leans the body and returns to rest', () => {
    for (const e of ENEMIES) {
      const c = clips[`${e}/hit`]!;
      expect(c.loop, e).toBe(false);
      const roots = Object.keys(c.tracks);
      expect(roots.length, e).toBeGreaterThan(0);
      const mid = poseAt(`${e}/hit`, 60);
      expect(
        roots.some((r) => part(mid, r).rot !== 0),
        e,
      ).toBe(true);
      const end = poseAt(`${e}/hit`, c.durationMs);
      for (const r of roots) expect(part(end, r).rot, e).toBeCloseTo(0);
    }
  });
});

describe('note 3: walks', () => {
  it('moves each knight leg on its own in the front and back views, swapping which is in front', () => {
    for (const k of KNIGHTS) {
      const walk = clips[`${k}/walk`]!;
      for (const v of ['front', 'back'] as const) {
        const set = views(k).find((x) => x.view === v)!.rv;
        const l = half('legs', 'l', v);
        const r = half('legs', 'r', v);
        expect(set.parts[l], `${k} ${v}`).toBeDefined();
        expect(set.parts[r], `${k} ${v}`).toBeDefined();
        expect(set.parts.legs, `${k} ${v}`).toBeUndefined();
        let differ = 0;
        for (let i = 0; i < 16; i++) {
          const s = sampleClip(walk, (i / 16) * walk.durationMs);
          const a = part(s, l);
          const b = part(s, r);
          if (Math.abs(a.dy - b.dy) > 0.5 || Math.abs(a.sy - b.sy) > 0.02) differ++;
        }
        expect(differ, `${k} ${v}`).toBeGreaterThan(8);
        // The near leg (lower on screen) is drawn in front, and that swaps each step.
        const orderAt = (u: number) => {
          const s = sampleClip(walk, u * walk.durationMs);
          return applyOrder(set.order, s.order);
        };
        for (const u of [0.25, 0.75]) {
          const s = sampleClip(walk, u * walk.durationMs);
          const near = part(s, l).dy > part(s, r).dy ? l : r;
          const far = near === l ? r : l;
          const o = orderAt(u);
          expect(o.indexOf(near), `${k} ${v} u=${u}`).toBeGreaterThan(o.indexOf(far));
        }
        expect(orderAt(0.25)).not.toEqual(orderAt(0.75));
      }
    }
  });

  it('bends the swinging side leg (shorter on the forward swing), not only a hip pivot', () => {
    for (const k of KNIGHTS) {
      const walk = clips[`${k}/walk`]!;
      const sys = Array.from(
        { length: 16 },
        (_, i) => part(sampleClip(walk, (i / 16) * walk.durationMs), 'frontleg').sy,
      );
      expect(Math.min(...sys), k).toBeLessThan(0.9);
    }
  });

  it('stomps the Brute and the Colossus: a hard body drop at each footfall and high lifts', () => {
    for (const [e, legs] of [
      ['brute', ['leg-near', 'leg-far']],
      ['colossus', ['leg-near', 'leg-far']],
    ] as const) {
      const walk = clips[`${e}/walk`]!;
      const n = 64;
      const at = (i: number) => sampleClip(walk, (i / n) * walk.durationMs);
      const dys = Array.from({ length: n }, (_, i) => part(at(i), 'torso').dy);
      expect(Math.max(...dys) - Math.min(...dys), e).toBeGreaterThanOrEqual(5);
      // Sharp: the drop happens within a twentieth of the cycle of the footfall.
      const peak = dys.indexOf(Math.max(...dys));
      const before = dys[(peak - 4 + n) % n]!;
      expect(Math.max(...dys) - before, e).toBeGreaterThan(3);
      for (const leg of legs) {
        const lift = Math.min(...Array.from({ length: n }, (_, i) => part(at(i), leg).dy));
        expect(lift, `${e} ${leg}`).toBeLessThan(-5);
      }
    }
  });

  it('walks the Bombard on flat feet with its middle legs apart and out of step', () => {
    const walk = clips['bombard/walk']!;
    const n = 32;
    const track = (leg: string) =>
      Array.from({ length: n }, (_, i) => part(sampleClip(walk, (i / n) * walk.durationMs), leg));
    for (const leg of ['leg-far-rear', 'leg-far-front', 'leg-near-front', 'leg-near-rear'])
      for (const p of track(leg)) expect(p.rot, leg).toBe(0);
    const ff = track('leg-far-front');
    const nr = track('leg-near-rear');
    // Half a cycle apart: one lifts while the other is planted.
    const lifted = (ps: PartPose[]) => ps.map((p) => p.dy < -1);
    const a = lifted(ff);
    const b = lifted(nr);
    expect(a.some((x, i) => x && !b[i])).toBe(true);
    expect(a.every((x, i) => !(x && b[i]))).toBe(true);
    // Pushed apart at rest too.
    const idle = sampleClip(clips['bombard/idle']!, 0);
    expect(part(idle, 'leg-near-rear').dx - part(idle, 'leg-far-front').dx).toBeGreaterThanOrEqual(
      4,
    );
  });

  it('pulses the Skitter core slowly: one pulse per four strides, and slower when idle', () => {
    const walk = clips['skitter/walk']!;
    const core = walk.tracks.core!;
    // One pulse spans the whole walk clip (four strides of the legs).
    const sx = core.map((k) => k.sx!);
    const peaks = sx.filter(
      (v, i) => i > 0 && i < sx.length - 1 && v > sx[i - 1]! && v > sx[i + 1]!,
    );
    expect(peaks.length).toBe(1);
    const legKeys = walk.tracks['leg-far-a']!;
    const legRots = legKeys.map((k) => k.rot!);
    const legPeaks = legRots.filter(
      (v, i) => i > 0 && i < legRots.length - 1 && v > legRots[i - 1]! && v >= legRots[i + 1]!,
    );
    expect(legPeaks.length).toBeGreaterThanOrEqual(4);
    expect(clips['skitter/idle']!.durationMs).toBeGreaterThanOrEqual(1800);
  });

  it('scatters a mite pack: each mite wanders, stops, and the pack re-layers as they pass', () => {
    const pack = mitePack(7);
    let swaps = 0;
    let prev = '';
    const stopped = new Set<number>();
    for (let t = 0; t <= 8000; t += 50) {
      const poses = pack.map((m) => mitePose(m, t));
      poses.forEach((p, i) => {
        expect(Math.abs(p.wobble)).toBeLessThanOrEqual(MAX_WOBBLE);
        if (!p.moving) stopped.add(i);
      });
      const order = poses
        .map((p, i) => [p.dy, i] as const)
        .sort((a, b) => a[0] - b[0])
        .map(([, i]) => i)
        .join(',');
      if (prev && order !== prev) swaps++;
      prev = order;
    }
    expect(swaps).toBeGreaterThanOrEqual(5);
    expect(stopped.size).toBe(pack.length);
  });
});

describe('note 4: down pile and enemy deaths', () => {
  const groundCheck = (rig: string, clip: string, drop = 0) => {
    for (const { view, rv } of views(rig)) {
      // Knights solve the pile per view (`down@<view>`, picked by RigSprite).
      const c = (clips[`${rig}/${clip}@${view}`] ?? clips[`${rig}/${clip}`])!;
      const end = sampleClip(c, c.durationMs);
      const mats = composeView(rv, end.parts);
      for (const [name, p] of Object.entries(rv.parts)) {
        if (ridesParent(rv, name)) continue;
        const [, y] = apply(mats.get(name)!, p.pivot[0], p.pivot[1]);
        const ground = rv.foot[1] + drop;
        expect(y, `${rig} ${view} ${name}`).toBeGreaterThan(ground - 12);
        expect(y, `${rig} ${view} ${name}`).toBeLessThanOrEqual(ground + 0.5);
      }
    }
  };

  it('drops every loose knight part to the ground and holds there (one-shot)', () => {
    for (const k of KNIGHTS) {
      expect(clips[`${k}/down`]!.loop).toBe(false);
      groundCheck(k, 'down');
      // Glow dims before the armor falls.
      const glow = clips[`${k}/down`]!.tracks['helm-glow']!;
      expect(glow.at(-1)!.glow).toBeLessThan(0.3);
    }
  });

  it('collapses every enemy and the Colossus into a pile, then fades every part out', () => {
    for (const e of ENEMIES) {
      const c = clips[`${e}/death`]!;
      groundCheck(e, 'death', e === 'wasp' ? 128 : 0);
      const end = sampleClip(c, c.durationMs);
      const set = views(e)[0]!.rv;
      for (const name of Object.keys(set.parts))
        expect(part(end, name).alpha, `${e} ${name}`).toBe(0);
      // Scrap spawns once it has landed, before the fade.
      expect(clipLandedMs(c), e).toBeLessThan(c.durationMs);
    }
  });

  it('solves landings through parents (a rider stays on its host)', () => {
    const rv = rigs.warden!.views.side as RigView;
    const poses = collapsePoses(rv, { start: 0, fall: 1, stagger: 0, seed: 'warden' });
    expect(poses.has('helm-glow')).toBe(false);
    expect(poses.has('helm')).toBe(true);
  });
});

describe('note 5: respawn is slower', () => {
  it('runs past the old 700 ms', () => {
    for (const k of KNIGHTS) expect(clips[`${k}/respawn`]!.durationMs).toBeGreaterThanOrEqual(1000);
  });
});

describe('note 6: two-barrel turret heads flash from both barrels', () => {
  it('gives tiers II and III two muzzles, and every ii/iii head frame has both', () => {
    expect(turretMuzzleIndices(0)).toEqual([1]);
    expect(turretMuzzleIndices(1)).toEqual([1]);
    expect(turretMuzzleIndices(2)).toEqual([1, 2]);
    expect(turretMuzzleIndices(3)).toEqual([1, 2]);
    const frames = (manifest.themes['neon-knights'] as ThemeAssets).frames;
    for (const head of ['ii', 'iii'])
      for (const aim of TURRET_AIMS) {
        const a = frames[`pulse-turret/${head}/${aim}`]!.attach ?? {};
        expect(a['muzzle-1'], `${head}/${aim}`).toBeDefined();
        expect(a['muzzle-2'], `${head}/${aim}`).toBeDefined();
        expect(a['muzzle-1']).not.toEqual(a['muzzle-2']);
      }
  });
});

describe('note 7: the Citadel smoke moves', () => {
  it('drifts two plume copies up and flickers the base', () => {
    const a = smokeLayers(0);
    const b = smokeLayers(700);
    expect(a[0].dy).not.toBeCloseTo(b[0].dy);
    expect(a[0].alpha).not.toBeCloseTo(a[1].alpha);
    const alphas = Array.from({ length: 20 }, (_, i) => smokeBaseAlpha(i * 100));
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.1);
  });
});

describe('note 8: the Citadel collapses into rubble', () => {
  it('implodes the core, cuts the glow, sinks the keep and ends on the rubble', () => {
    const start = citadelCollapseAt(0);
    expect(start).toMatchObject({ keepSy: 1, keepAlpha: 1, rubbleAlpha: 0, unlit: false });
    const imploded = citadelCollapseAt(COLLAPSE_AT.implode);
    expect(imploded.coreScale).toBeLessThan(0.3);
    expect(citadelCollapseAt(COLLAPSE_AT.glowOut).glowAlpha).toBe(0);
    expect(citadelCollapseAt(COLLAPSE_AT.glowOut).unlit).toBe(true);
    const end = citadelCollapseAt(CITADEL_COLLAPSE_MS);
    expect(end.keepSy).toBeLessThanOrEqual(0.25);
    expect(end.keepAlpha).toBe(0);
    expect(end.rubbleAlpha).toBe(1);
  });
});

describe('note 9: fast shots', () => {
  it('pins the straight-shot speeds (tiles/s) the content milestones use', () => {
    expect(PROJECTILE_SPEEDS).toEqual({ bolt: 26, 'nanite-bolt': 20, 'wasp-shot': 16 });
  });
});

describe('note 10: heal glints and nanite motes spread over the body', () => {
  it('places 3–5 points across the body, never in one column', () => {
    const counts = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const pts = bodyBurstPoints(seed);
      counts.add(pts.length);
      expect(pts.length).toBeGreaterThanOrEqual(3);
      expect(pts.length).toBeLessThanOrEqual(5);
      const xs = pts.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.25);
      expect(new Set(pts.map((p) => p.delayMs)).size).toBe(pts.length);
    }
    expect(counts.size).toBe(3);
  });
});

describe('note 11: a stunned unit idles', () => {
  it('selects idle under stun even while moving', () => {
    expect(locomotionClip(true, [])).toBe('walk');
    expect(locomotionClip(true, ['stun'])).toBe('idle');
    expect(locomotionClip(true, ['slow', 'stun'])).toBe('idle');
    expect(locomotionClip(true, ['slow'])).toBe('walk');
    expect(locomotionClip(false, [])).toBe('idle');
    expect(locomotionSpeed(['slow'])).toBeLessThan(1);
  });
});

describe('note 12: the slow crawl animates', () => {
  it('climbs, flickers and re-strikes over time', () => {
    const looks = Array.from({ length: 30 }, (_, i) => crawlLook(i * 37));
    expect(new Set(looks.map((l) => l.flip)).size).toBe(2);
    const climbs = looks.map((l) => l.climb);
    expect(Math.max(...climbs) - Math.min(...climbs)).toBeGreaterThan(0.3);
    const alphas = looks.map((l) => l.alpha);
    expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.3);
  });
});
