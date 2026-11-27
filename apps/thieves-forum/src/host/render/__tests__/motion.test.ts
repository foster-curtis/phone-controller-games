// TF1-fix-1 (user C1 review of the art gallery, notes 1–9; SPEC §6.6, §6.8, §6.13–§6.15, §6.21,
// §12.2): frames sampled headless from the clips and rigs. Staged glances turn the head alone, then
// the body; the scutum rides the shield arm in every guard frame; raised near arms draw in front of
// the head; carry/fetch arms show; points aim along the screen's vertical in front/back; caught arms
// go high; runs pedal and lean with the arms at the sides; confetti is single pieces, more and smaller.
import { describe, expect, it } from 'vitest';
import { MANIFEST, RIGS } from '../assets';
import { CLIPS_BY_RIG } from '../clips/index';
import { FREE_ARM, SHIELD_ARM } from '../clips/guard';
import { CONFETTI, CONFETTI_FRAMES, confettiBurst, flakeFlip, stepFlake } from '../confetti';
import { sampleFrame, turnView, type DrawnPose } from '../drawn';
import { apply, type Mat } from '../rigMath';
import { VIEW_IDS, type Clip, type Point, type RigId, type ViewId } from '../types';

/** The clip a rig plays for `name` in a view (`<name>@<view>` wins, as in rig.ts). */
function clipOf(rig: RigId, name: string, view: ViewId): Clip {
  const byName = CLIPS_BY_RIG[rig];
  const c = byName[`${name}@${view}`] ?? byName[name];
  if (!c) throw new Error(`${rig}/${name}@${view} missing`);
  return c;
}

/** Every (clip name, view) pair a rig can draw. */
function served(rig: RigId): [string, ViewId][] {
  const names = [...new Set(Object.keys(CLIPS_BY_RIG[rig]).map((k) => k.split('@')[0]!))];
  return names.flatMap((n) => VIEW_IDS.map((v) => [n, v] as [string, ViewId]));
}

const times = (clip: Clip, n = 24) =>
  Array.from({ length: n + 1 }, (_, i) => (clip.durationMs * i) / n);

const frame = (rig: RigId, name: string, view: ViewId, t: number) =>
  sampleFrame(RIGS[rig], view, clipOf(rig, name, view), t);

/** A part's rest point (in its own drawing's units) under the frame's matrices. */
const at = (mats: Map<string, Mat>, part: string, p: Point): Point => apply(mats.get(part)!, ...p);

/** Draw-order index of a part, and the last index of a part's subtree (e.g. head + hair + wrap). */
const idx = (d: DrawnPose, part: string) => d.rp.order.indexOf(part);
function subtreeLast(d: DrawnPose, root: string): number {
  const names = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [n, p] of Object.entries(d.rp.parts))
      if (p.parent && names.has(p.parent) && !names.has(n)) {
        names.add(n);
        grew = true;
      }
  }
  return Math.max(...[...names].map((n) => d.rp.order.indexOf(n)));
}

/** The hand point of a view's base pose (the rig's `hand` attach on that arm, or its mirror). */
function handPoint(rig: RigId, view: ViewId, pose: string, arm: string): Point {
  const rp = RIGS[rig].views[view].poses[pose] ?? RIGS[rig].views[view].poses.base!;
  const h = rp.attach.hand!;
  if (h.part === arm) return h.at;
  const pivot = rp.parts[h.part]!.pivot;
  const other = rp.parts[arm]!.pivot;
  return [other[0] - (h.at[0] - pivot[0]), h.at[1]];
}

describe('staged glance (note 1)', () => {
  for (const rig of ['merchant', 'citizen'] as const) {
    it(`${rig}: wind-up turns only the head; front/back body → side head, side body → front head`, () => {
      for (const view of VIEW_IDS) {
        const clip = clipOf(rig, 'glanceWindup', view);
        for (const t of times(clip, 6)) {
          const { drawn } = sampleFrame(RIGS[rig], view, clip, t);
          expect(drawn.body, `${rig} ${view}`).toBe(view);
          const want = view === 'side' ? 'front' : 'side';
          expect(drawn.from.head!.view, `${rig} ${view} head`).toBe(want);
          expect(drawn.from.hair!.view, `${rig} ${view} hair follows the head`).toBe(want);
          expect(drawn.from.tunic!.view, `${rig} ${view} tunic`).toBe(view);
          expect(drawn.from['leg-l']!.view).toBe(view);
          // The head stays joined at this view's neck.
          const neck = RIGS[rig].views[view].poses[drawn.pose]!.parts.head!.pivot;
          expect(drawn.rp.parts.head!.at).toEqual(neck);
        }
      }
    });

    it(`${rig}: the look turns the whole body, the glance back returns body then head`, () => {
      for (const view of VIEW_IDS) {
        const look = clipOf(rig, 'glanceLook', view);
        for (const t of times(look, 6)) {
          const { drawn } = sampleFrame(RIGS[rig], view, look, t);
          expect(drawn.body).toBe(turnView(view));
          for (const f of Object.values(drawn.from)) expect(f.view).toBe(turnView(view));
        }
        const back = clipOf(rig, 'glanceBack', view);
        const first = sampleFrame(RIGS[rig], view, back, 0).drawn;
        const last = sampleFrame(RIGS[rig], view, back, back.durationMs).drawn;
        expect(first.body).toBe(view);
        expect(first.from.head!.view).toBe(turnView(view));
        expect(last.body).toBe(view);
        expect(last.from.head!.view).toBe(view);
      }
    });
  }

  it('every turned-head frame exists in the manifest', () => {
    for (const rig of ['merchant', 'citizen'] as const)
      for (const view of VIEW_IDS)
        for (const name of ['glanceWindup', 'glanceLook', 'glanceBack']) {
          const clip = clipOf(rig, name, view);
          for (const t of times(clip, 4)) {
            const { drawn } = sampleFrame(RIGS[rig], view, clip, t);
            for (const [part, f] of Object.entries(drawn.from))
              if (drawn.rp.parts[part]!.src)
                expect(
                  MANIFEST.frames[`${rig}/${f.view}/${f.pose}/${part}`],
                  `${rig} ${name}@${view} ${part}`,
                ).toBeDefined();
          }
        }
  });
});

describe('guard shield (note 2)', () => {
  it('the scutum is parented to the shield arm in every view and pose', () => {
    for (const view of VIEW_IDS)
      for (const rp of Object.values(RIGS.guard.views[view].poses))
        expect(rp.parts.scutum!.parent, view).toBe(SHIELD_ARM[view]);
  });

  it('in every frame of every clip and view the scutum moves exactly with its arm', () => {
    for (const [name, view] of served('guard')) {
      const clip = clipOf('guard', name, view);
      expect(clip.tracks.scutum, `${name}@${view}: no own shield track`).toBeUndefined();
      const arm = SHIELD_ARM[view];
      for (const t of times(clip)) {
        const { drawn, mats } = frame('guard', name, view, t);
        expect(drawn.rp.parts.scutum!.parent).toBe(arm);
        const s = mats.get('scutum')!;
        const a = mats.get(arm)!;
        for (let i = 0; i < 6; i++) expect(s[i], `${name}@${view} t=${t}`).toBeCloseTo(a[i]!, 6);
      }
    }
  });

  it('gaits only bounce the shield arm; grabs and the march hold use the other arm', () => {
    for (const view of VIEW_IDS) {
      for (const name of ['patrol', 'jog', 'march']) {
        const keys = clipOf('guard', name, view).tracks[SHIELD_ARM[view]] ?? [];
        for (const k of keys)
          expect(Math.abs(k.rot ?? 0), `${name}@${view}`).toBeLessThanOrEqual(3);
      }
      const grab = clipOf('guard', 'catch', view);
      expect(grab.tracks[SHIELD_ARM[view]], `catch@${view}`).toBeUndefined();
      expect(grab.tracks[FREE_ARM[view]], `catch@${view}`).toBeDefined();
    }
    // Back view: the catch is made with the other arm (his right, the viewer's right).
    expect(clipOf('guard', 'catch', 'back').tracks['arm-r']).toBeDefined();
  });
});

describe('raised near arms in side views (notes 5, 6)', () => {
  it('whenever the near arm reaches above the chin, it draws after the head', () => {
    let checked = 0;
    for (const rig of ['citizen', 'merchant', 'guard'] as const) {
      for (const [name] of served(rig).filter(([, v]) => v === 'side')) {
        const clip = clipOf(rig, name, 'side');
        for (const t of times(clip, 12)) {
          const { drawn, mats } = frame(rig, name, 'side', t);
          if (!drawn.rp.parts['arm-r']?.src || drawn.body !== 'side') continue;
          const tip = at(mats, 'arm-r', handPoint(rig, 'side', drawn.from['arm-r']!.pose, 'arm-r'));
          if (tip[1] >= 24.5) continue;
          checked++;
          expect(idx(drawn, 'arm-r'), `${rig} ${name}@side t=${t}`).toBeGreaterThan(
            subtreeLast(drawn, 'head'),
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('hands-up side and fetch side draw the near arm in front of the head', () => {
    const hu = frame('citizen', 'handsUp', 'side', 0).drawn;
    expect(idx(hu, 'arm-r')).toBeGreaterThan(subtreeLast(hu, 'head'));
    const fetch = frame('merchant', 'fetch', 'side', 600).drawn;
    expect(idx(fetch, 'arm-r')).toBeGreaterThan(subtreeLast(fetch, 'head'));
  });
});

describe('merchant carry (note 6)', () => {
  it('front: both arms are drawn, in front of the apron', () => {
    const { drawn } = frame('merchant', 'carry', 'front', 0);
    const clip = clipOf('merchant', 'carry', 'front');
    expect(clip.tracks['arm-l'] && clip.tracks['arm-r']).toBeTruthy();
    for (const arm of ['arm-l', 'arm-r']) {
      expect(drawn.rp.parts[arm]!.src).not.toBeNull();
      expect(idx(drawn, arm), arm).toBeGreaterThan(idx(drawn, 'apron'));
    }
  });

  it('back: both arms show beside the body', () => {
    const { drawn, mats } = frame('merchant', 'carry', 'back', 0);
    const clip = clipOf('merchant', 'carry', 'back');
    expect(clip.tracks['arm-l'] && clip.tracks['arm-r']).toBeTruthy();
    for (const arm of ['arm-l', 'arm-r'] as const) expect(drawn.rp.parts[arm]!.src).not.toBeNull();
    const l = at(mats, 'arm-l', handPoint('merchant', 'back', 'base', 'arm-l'));
    const r = at(mats, 'arm-r', handPoint('merchant', 'back', 'base', 'arm-r'));
    expect(l[0]).toBeLessThan(10);
    expect(r[0]).toBeGreaterThan(30);
  });
});

describe('point into / out of the screen (note 7)', () => {
  const aim = (rig: RigId, view: ViewId) => {
    const clip = clipOf(rig, 'point', view);
    const { drawn, mats } = sampleFrame(RIGS[rig], view, clip, 300);
    // The pointing arm is arm-l (the delivered point arm, or the base arm raised for merchant back).
    const attach = drawn.rp.attach.hand!;
    const point = attach.part === 'arm-l' ? attach.at : handPoint(rig, view, drawn.pose, 'arm-l');
    const hand = at(mats, 'arm-l', point);
    const shoulder = at(mats, 'arm-l', drawn.rp.parts['arm-l']!.pivot);
    const dx = hand[0] - shoulder[0];
    const dy = hand[1] - shoulder[1];
    return { dy, offVertical: (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI };
  };

  for (const rig of ['citizen', 'merchant'] as const) {
    it(`${rig}: front points down (toward the camera), back points up (away)`, () => {
      const front = aim(rig, 'front');
      expect(front.dy).toBeGreaterThan(0);
      expect(front.offVertical).toBeLessThan(35);
      const back = aim(rig, 'back');
      expect(back.dy).toBeLessThan(0);
      expect(back.offVertical).toBeLessThan(35);
    });
  }
});

describe('caught (note 8)', () => {
  it('front and back throw the hands up above the head line', () => {
    for (const view of ['front', 'back'] as const) {
      const clip = clipOf('citizen', 'caught', view);
      const { mats } = sampleFrame(RIGS.citizen, view, clip, clip.durationMs);
      for (const arm of ['arm-l', 'arm-r'] as const) {
        const tip = at(mats, arm, handPoint('citizen', view, 'base', arm));
        // TF1 had them at shoulder height (y ≈ 31); the shoulders are at y 30.
        expect(tip[1], `${view} ${arm}`).toBeLessThan(22);
      }
    }
  });
});

describe('runs (note 3)', () => {
  const RUNS: [RigId, string, number][] = [
    ['citizen', 'run', 24],
    ['guard', 'jog', 14],
  ];

  for (const [rig, name, baked] of RUNS) {
    const root = rig === 'guard' ? 'cuirass' : 'tunic';

    it(`${rig} ${name} side: forward lean and pedaling legs (tucked on the forward swing)`, () => {
      const clip = clipOf(rig, name, 'side');
      const s = (t: number) => sampleFrame(RIGS[rig], 'side', clip, t).sample;
      const ts = times(clip, 48);
      const leans = ts.map((t) => s(t).get(root)!.rot);
      expect(Math.min(...leans)).toBeGreaterThanOrEqual(4);
      // Abs angles (positive = back) of the far leg; it is shortest while swinging forward.
      const legL = ts.map((t) => ({
        rot: s(t).get('leg-l')!.rot + baked,
        sy: s(t).get('leg-l')!.sy,
      }));
      const minSy = Math.min(...legL.map((l) => l.sy));
      expect(minSy).toBeLessThan(0.85);
      for (let i = 1; i < legL.length; i++) {
        const forward = legL[i]!.rot < legL[i - 1]!.rot - 1e-6;
        if (!forward) expect(legL[i]!.sy, `stance leg stays long (i=${i})`).toBeGreaterThan(0.97);
      }
      // The legs are half a cycle apart.
      const half = clip.durationMs / 2;
      for (const t of times(clip, 8).slice(0, 4))
        expect(s(t).get('leg-l')!.sy).toBeCloseTo(s(t + half).get('leg-r')!.sy, 2);
    });

    it(`${rig} ${name} front/back: legs alternate, body leans in, arms stay at the sides`, () => {
      for (const view of ['front', 'back'] as const) {
        const clip = clipOf(rig, name, view);
        const half = clip.durationMs / 2;
        for (const t of times(clip, 12)) {
          const a = sampleFrame(RIGS[rig], view, clip, t).sample;
          const b = sampleFrame(RIGS[rig], view, clip, t + half).sample;
          expect(a.get('leg-l')!.dy).toBeCloseTo(b.get('leg-r')!.dy, 2);
          for (const arm of ['arm-l', 'arm-r'])
            expect(Math.abs(a.get(arm)!.rot), `${view} ${arm}`).toBeLessThanOrEqual(8);
          expect(a.get(root)!.sy).toBeLessThan(1);
          expect(a.get('head')!.dy).toBeGreaterThan(0);
        }
        const lifts = times(clip, 24).map(
          (t) => sampleFrame(RIGS[rig], view, clip, t).sample.get('leg-l')!.dy,
        );
        expect(Math.min(...lifts)).toBeLessThan(-1.5);
      }
    });
  }

  it('side walks swing each arm against the leg on its side', () => {
    const clip = clipOf('citizen', 'walk', 'side');
    const s = sampleFrame(RIGS.citizen, 'side', clip, clip.durationMs / 4).sample;
    const nearLegForward = s.get('leg-r')!.rot - 14 < 0;
    const nearArmForward = s.get('arm-r')!.rot < 0;
    expect(nearLegForward).not.toBe(nearArmForward);
  });
});

describe('confetti (note 9)', () => {
  it('ships one frame per piece, each from its own file', () => {
    const files = new Set<string>();
    for (const f of CONFETTI_FRAMES) {
      const meta = MANIFEST.frames[f];
      expect(meta, f).toBeDefined();
      expect(meta!.file).toMatch(/^effects\/confetti\/piece-\d\.svg$/);
      files.add(meta!.file);
    }
    expect(files.size).toBe(6);
  });

  it('bursts at least twice as many, smaller pieces as the one sheet did (6 at scale 1)', () => {
    expect(CONFETTI.count).toBeGreaterThanOrEqual(12);
    expect(CONFETTI.scale).toBeLessThan(1);
    expect(confettiBurst({ x: 0, y: 0 })).toHaveLength(CONFETTI.count);
  });

  it('pieces fly up and out, then fall slowly, sway, spin and flip', () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const flakes = confettiBurst({ x: 0, y: 0 }, 30, rand);
    expect(new Set(flakes.map((f) => f.frame)).size).toBe(6);
    const f = flakes.reduce((a, b) => (b.vy < a.vy ? b : a));
    const rot0 = f.rot;
    const xs: number[] = [];
    const ys: number[] = [];
    const flips: number[] = [];
    for (let i = 0; i < 200; i++) {
      stepFlake(f, 16);
      xs.push(f.x);
      ys.push(f.y);
      flips.push(flakeFlip(f));
    }
    expect(Math.min(...ys)).toBeLessThan(-20); // the burst goes up first
    expect(ys[ys.length - 1]!).toBeGreaterThan(Math.min(...ys)); // then falls
    // Drag caps the fall: terminal speed well under free fall.
    expect((ys[199]! - ys[189]!) / (10 * 0.016)).toBeLessThan(CONFETTI.gravity / CONFETTI.drag + 1);
    expect(f.rot).not.toBeCloseTo(rot0, 1);
    expect(Math.min(...flips)).toBeLessThan(0.5);
    // Sway: horizontal motion keeps changing direction after the burst has died down.
    const late = xs.slice(100);
    const dirs = late.slice(1).map((x, i) => Math.sign(x - late[i]!));
    expect(new Set(dirs).size).toBeGreaterThan(1);
  });
});

describe('occupied stocks (note 4)', () => {
  it('is a front-view frame tinted from the outfit (tunic, skin, hair), the same size as the stocks', () => {
    const occ = MANIFEST.frames['stocks-occupied-reference']!;
    const empty = MANIFEST.frames.stocks!;
    const tints = new Set(occ.layers.map((l) => l.tint).filter((t) => t !== null));
    expect([...tints].sort()).toEqual(['hair', 'skin', 'tunic']);
    expect(occ.viewBox).toEqual(empty.viewBox);
    expect(occ.anchor).toEqual(empty.anchor);
    expect(occ.ppu).toBe(empty.ppu);
  });
});
