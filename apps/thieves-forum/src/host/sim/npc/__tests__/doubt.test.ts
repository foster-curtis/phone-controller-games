// Shoppers less sure of themselves (SPEC §6.10 techniques 2, 3, 5; TF2-fix-1, C1 note): over a seeded
// round, NPCs make hesitation stops (looking left and right), reverse and change their minds, and slow
// near stalls at rates inside the tuned ranges, scaled by each one's doubt; speeds stay in the NPC band;
// player characters never get these moments from the sim.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../../content';
import { roundStart, stickDriver } from '../../__tests__/helpers';
import { npcSpeedRange } from '../../movement';
import { TUNING } from '../../tuning';
import { SIM_HZ } from '../../types';
import { createSim } from '../../world';
import { angleDiff } from '../../geometry';
import type { NpcMoment } from '..';

const D = TUNING.doubt;
const b = CONTENT.balance;

/** One seeded 8-player round of `seconds`, tallying moment starts per minute of walking. */
function run(seed: number, seconds: number) {
  const sim = createSim(roundStart(seed, 8, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  const sticks = stickDriver(seed, 8);
  const last = new Map<number, NpcMoment>();
  const starts: Record<NpcMoment, number> = {
    none: 0,
    hesitate: 0,
    reverse: 0,
    retarget: 0,
    stallSlow: 0,
    stallStop: 0,
    alleyWait: 0,
    alleyReroute: 0,
  };
  // Hesitation starts and walking ticks, split by doubt (low < 0.3 ≤ mid < 0.6 ≤ high).
  const byDoubt = { low: { stops: 0, walk: 0 }, high: { stops: 0, walk: 0 } };
  const lookTurn = new Map<number, { from: number; max: number }>();
  let looked = 0;
  let lookedStops = 0;
  let walkTicks = 0;
  let maxNpcSpeed = 0;
  let playerMoments = 0;
  for (let t = 0; t < seconds * SIM_HZ; t++) {
    sim.step(sticks(t));
    for (const c of sim.world.characters) {
      const nav = c.npc.nav!;
      if (c.control.k === 'player') {
        if (nav.moment !== 'none') playerMoments++;
        continue;
      }
      maxNpcSpeed = Math.max(maxNpcSpeed, Math.hypot(c.vx, c.vy));
      const walking =
        c.npc.state === 'wandering' &&
        (nav.leg === 'stall' || nav.leg === 'roam') &&
        Math.hypot(c.vx, c.vy) > 0.7;
      const band = nav.doubt < 0.3 ? byDoubt.low : nav.doubt >= 0.6 ? byDoubt.high : null;
      if (walking) {
        walkTicks++;
        if (band) band.walk++;
      }
      const m = nav.moment;
      const prev = last.get(c.id) ?? 'none';
      if (m !== prev) {
        starts[m]++;
        if (m === 'hesitate') {
          if (band) band.stops++;
          lookTurn.set(c.id, { from: c.facing, max: 0 });
        }
        if (prev === 'hesitate') {
          const l = lookTurn.get(c.id);
          lookedStops++;
          if (l && l.max > 0.4) looked++;
          lookTurn.delete(c.id);
        }
        last.set(c.id, m);
      }
      const l = lookTurn.get(c.id);
      if (l && m === 'hesitate') l.max = Math.max(l.max, Math.abs(angleDiff(c.facing, l.from)));
    }
  }
  const walkMin = walkTicks / SIM_HZ / 60;
  const per = (n: number) => n / walkMin;
  return {
    walkMin,
    hesitate: per(starts.hesitate),
    reverse: per(starts.reverse),
    retarget: per(starts.retarget),
    stall: per(starts.stallSlow + starts.stallStop),
    stallStop: per(starts.stallStop),
    lowRate: byDoubt.low.stops / (byDoubt.low.walk / SIM_HZ / 60),
    highRate: byDoubt.high.stops / (byDoubt.high.walk / SIM_HZ / 60),
    lookedShare: lookedStops ? looked / lookedStops : 0,
    maxNpcSpeed,
    playerMoments,
  };
}

describe('NPCs less sure of themselves (TF2-fix-1)', () => {
  const r = run(7, 200);

  it('make hesitation stops at a rate inside the tuned range, looking left and right', () => {
    // Per minute of walking: the doubt range times the share that don't turn round.
    expect(r.hesitate).toBeGreaterThan(D.stopPerMin[0] * (1 - D.stopTurn) * 0.6);
    expect(r.hesitate).toBeLessThan(D.stopPerMin[1] * 1.2);
    expect(r.lookedShare).toBeGreaterThan(0.6);
  });

  it('change their minds: turn right round and walk back, or head off another way', () => {
    const mind = r.reverse + r.retarget;
    expect(r.reverse).toBeGreaterThan(0.2);
    expect(mind).toBeGreaterThan(D.mindPerMin[0] * 0.6);
    expect(mind).toBeLessThan(D.mindPerMin[1] + D.stopPerMin[1] * D.stopTurn + 0.5);
  });

  it('slow down near stalls they pass, sometimes stopping', () => {
    expect(r.stall).toBeGreaterThan(0.5);
    expect(r.stallStop).toBeGreaterThan(0);
    expect(r.stallStop).toBeLessThan(r.stall);
  });

  it('scale with each NPC’s doubt, so the crowd isn’t uniform', () => {
    expect(r.highRate).toBeGreaterThan(r.lowRate);
  });

  it('keep NPC speeds inside the NPC band, below a jog', () => {
    expect(r.maxNpcSpeed).toBeLessThanOrEqual(npcSpeedRange(b).max + 1e-9);
    expect(r.maxNpcSpeed).toBeLessThan(b.movement.jog);
  });

  it('never give a player character these moments (no automatic tell)', () => {
    expect(r.playerMoments).toBe(0);
  });
});
