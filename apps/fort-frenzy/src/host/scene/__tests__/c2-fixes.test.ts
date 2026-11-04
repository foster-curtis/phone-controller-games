// FF7-fix-1: one runnable check per C2 note (BUILD_PLAN §3 fix milestones). Feel notes are re-judged
// at C3; these pin the rules behind them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineer } from '../../../content/balance';
import { theme } from '../../../shared/theme';
import { neonKnightsHost } from '../../../themes/neon-knights/host';
import { isPosed, type ViewId } from '../../../themes/types';
import { FixedCamera, UNIT_PX } from '../../render/camera';
import { sampleClip } from '../../render/clip';
import {
  ATTACK_MS,
  bowString,
  DRAW_END_MS,
  RELEASE_MS,
  stringDraw,
} from '../../render/clips/ranger';
import { attachPoint, composeView } from '../../render/rigMath';
import { splitView } from '../../render/split';
import { anchorToWorld, CATCHUP_MS, shotPos, shotTiming } from '../shot';
import { SUPER_PULSE_HZ, SUPER_PULSE_SCALE, superPulse } from '../superPulse';

const { rigs, clips } = neonKnightsHost;
const attack = clips['ranger/attack']!;
const part = (t: number, name: string) => sampleClip(attack, t).parts.get(name)!;

describe('C2 note 1: the Ranger draws, holds and releases', () => {
  it('draws the string back before the release, then snaps it past straight', () => {
    expect(stringDraw(0)).toBe(0);
    let last = -Infinity;
    for (let t = 0; t <= DRAW_END_MS; t += 5) {
      expect(stringDraw(t)).toBeGreaterThanOrEqual(last);
      last = stringDraw(t);
    }
    expect(stringDraw(DRAW_END_MS)).toBe(1);
    // Hold at full draw up to the release.
    expect(stringDraw(RELEASE_MS - 1)).toBe(1);
    expect(stringDraw(RELEASE_MS + 12)).toBeLessThan(0);
    // Ends drawn again (the next bolt nocked): the `ready` rest pose.
    expect(stringDraw(ATTACK_MS)).toBe(1);
  });

  it('moves the draw arm: at the bow, then the anchor, then flying back on the release', () => {
    expect(DRAW_END_MS).toBeLessThan(RELEASE_MS);
    const start = part(0, 'backarm');
    const drawn = part(DRAW_END_MS, 'backarm');
    const held = part(RELEASE_MS, 'backarm');
    const after = part(RELEASE_MS + 30, 'backarm');
    expect(start.sx).toBeGreaterThan(1.3);
    expect(drawn.sx).toBe(1);
    expect(held).toEqual(drawn);
    expect(after.rot).toBeLessThan(-10);
    expect(after.sx).toBeLessThan(1);
    // The bow arm kicks only after the release.
    expect(part(RELEASE_MS, 'frontarm').rot).toBe(0);
    expect(part(RELEASE_MS + 25, 'frontarm').rot).toBeLessThan(0);
  });

  it('shows the drawn string and bolt through the hold and drops them at the release', () => {
    expect(part(0, 'bow-glow').glow).toBe(0);
    expect(part(RELEASE_MS - 1, 'bow-glow').glow).toBeGreaterThan(1);
    // The release is the first frame the art string goes dark after the draw.
    let release = -1;
    for (let t = DRAW_END_MS; t <= ATTACK_MS; t++) {
      if (part(t, 'bow-glow').glow === 0) {
        release = t;
        break;
      }
    }
    expect(release).toBe(RELEASE_MS);
    expect(part(ATTACK_MS, 'bow-glow').glow).toBe(1);
    for (const view of ['side', 'front', 'back'] as const) {
      // Code draws the string while the art's is dark: slack at the start, snapping after the release.
      const slack = bowString(view, 0)!;
      expect(slack.alpha).toBe(1);
      expect(slack.nock[0]).toBeCloseTo(slack.top[0], 5);
      expect(bowString(view, RELEASE_MS - 1)).toBeNull();
      expect(bowString(view, RELEASE_MS + 12)!.alpha).toBe(1);
      expect(bowString(view, ATTACK_MS)).toBeNull();
    }
  });

  it('launches the bolt at the release, with or without the draw', () => {
    for (const drawn of [false, true]) {
      const { offsetMs, delayMs } = shotTiming('ranger', drawn);
      expect(offsetMs + delayMs).toBe(RELEASE_MS);
    }
    expect(shotTiming('ranger', false).offsetMs).toBe(0);
    expect(shotTiming('ranger', true).offsetMs).toBe(DRAW_END_MS);
    expect(shotTiming('warden', false)).toEqual({ offsetMs: 0, delayMs: 0 });
    // The clip is over before the next shot, so a repeat shot starts from full draw.
    expect(ATTACK_MS).toBeLessThan(engineer.main.cooldownMs);
  });
});

describe('C2 note 2: the bolt leaves from the bow', () => {
  const rig = rigs.ranger!;
  const cam = new FixedCamera();
  const feet = { x: 10, y: 12 };
  const facings: { view: ViewId; mirror: boolean }[] = [
    { view: 'side', mirror: false },
    { view: 'side', mirror: true },
    { view: 'front', mirror: false },
    { view: 'back', mirror: false },
  ];

  for (const { view, mirror } of facings) {
    it(`spawns at the bow anchor on the release frame (${view}${mirror ? ', mirrored' : ''})`, () => {
      const v = rig.views[view]!;
      if (!isPosed(v)) throw new Error('the Ranger is posed');
      const ready = v.poses.ready!;
      expect(ready.attach?.bolt?.part).toBe('bow');
      const rv = splitView('ranger', view, ready, rig.viewBox).rv;
      const mats = composeView(rv, sampleClip(attack, RELEASE_MS).parts);
      const u = attachPoint(rv, mats, 'bolt')!;
      const f = cam.worldToScreen(feet.x, feet.y);
      const anchor = {
        sx: f.sx + (u[0] - rv.foot[0]) * UNIT_PX * (mirror ? -1 : 1),
        sy: f.sy + (u[1] - rv.foot[1]) * UNIT_PX,
      };
      // Well above the feet; forward of them in a side view.
      expect(f.sy - anchor.sy).toBeGreaterThan(20);
      if (view === 'side') expect((anchor.sx - f.sx) * (mirror ? -1 : 1)).toBeGreaterThan(10);

      const origin = anchorToWorld(anchor, feet, cam);
      const launch = { bornMs: 0, delayMs: RELEASE_MS, origin };
      // The sim's bolt left the feet at once and is ahead by the release.
      const dir = mirror ? -1 : 1;
      const sim = (ms: number) => ({ x: feet.x + dir * 26 * (ms / 1000), y: feet.y, z: 0 });
      expect(shotPos(launch, RELEASE_MS - 1, sim(RELEASE_MS - 1))).toBeNull();
      const first = shotPos(launch, RELEASE_MS, sim(RELEASE_MS))!;
      const s = cam.worldToScreen(first.x, first.y, first.z);
      expect(s.sx).toBeCloseTo(anchor.sx, 6);
      expect(s.sy).toBeCloseTo(anchor.sy, 6);
      expect(Math.hypot(s.sx - f.sx, s.sy - f.sy)).toBeGreaterThan(20);
      // Then it settles onto the sim's path at the bow's height.
      const t = RELEASE_MS + CATCHUP_MS;
      const later = shotPos(launch, t, sim(t))!;
      expect(later.x).toBeCloseTo(sim(t).x, 6);
      expect(later.y).toBeCloseTo(feet.y, 6);
      expect(later.z).toBeCloseTo(origin.z, 6);
    });
  }

  it('draws other shots where the sim has them', () => {
    const sim = { x: 3, y: 4, z: 0 };
    expect(shotPos({ bornMs: 0, delayMs: 0, origin: null }, 0, sim)).toEqual(sim);
  });
});

describe('C2 note 3: super ready pulses the ring amber, no head badge', () => {
  it('pulses in the theme amber only while the super is ready and the knight is up', () => {
    const ready = superPulse({ superCharge: 1, respawnAt: null }, 0)!;
    expect(ready.color).toBe(theme.color.amber.num);
    expect(ready.scale).toBe(1);
    const peak = superPulse({ superCharge: 1, respawnAt: null }, 1000 / SUPER_PULSE_HZ / 2)!;
    expect(peak.scale).toBeCloseTo(1 + SUPER_PULSE_SCALE, 6);
    expect(peak.alpha).toBeGreaterThan(ready.alpha);
    expect(superPulse({ superCharge: 0.99, respawnAt: null }, 0)).toBeNull();
    expect(superPulse({ superCharge: 1, respawnAt: 120 }, 0)).toBeNull();
  });

  it('draws the pulse on the ring and no badge over the head', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'worldView.ts'), 'utf8');
    expect(src).not.toMatch(/attach\('badge'\)|iconFor\.super|badgeTile/);
    expect(src).toMatch(/superPulse\(p, this\.t\)/);
    expect(src).toMatch(/marks\.superRing\(/);
    // The pulse goes under the colored ring.
    expect(src.indexOf('marks.superRing(')).toBeLessThan(src.indexOf('marks.ring('));
  });
});
