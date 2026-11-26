// No waiting on an empty map (SPEC §9.4, RC3; RD3-fix-4): with no enemy alive and groups still to
// come, the next spawn pulse flares at once and spawns 1 s (60 steps) later; later pulses keep their
// spacing, and portals, groups and hot sides stay as planned (only timing moves).
import { describe, expect, it } from 'vitest';
import { rules, waves } from '../../../content/balance';
import { stateHash } from '../hash';
import type { PendingSpawn } from '../types';
import { harness, type Harness } from './harness';

const FLARE = 60;

/** Combat of wave `n` with `players` invincible players, just started. */
function combatAt(n: number, players: number, seed: number): Harness {
  const h = harness(players, seed);
  h.toBuild();
  if (n !== 1) {
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: n });
    h.run(1);
  }
  h.toCombat();
  for (const p of h.sim.world.players) p.invincible = true;
  return h;
}

const killAll = (h: Harness) => {
  for (const e of h.sim.world.enemies) e.hp = 0;
};

const what = (g: PendingSpawn) => ({
  portal: g.portal,
  enemy: g.enemy,
  count: g.count,
  hot: g.hot,
});

/** One step: its tick, the portals that flared and the planned groups that spawned. */
function step(h: Harness, pending: Set<PendingSpawn>) {
  const t = h.sim.world.tick;
  h.sim.step();
  const flares = h.events('portalFlare').map((e) => e.portal);
  const spawned = [...pending].filter((g) => !h.sim.world.spawns.includes(g));
  for (const g of spawned) pending.delete(g);
  return { t, flares, spawned };
}

/**
 * Solo wave 1: the first group spawns, a while passes with it alive (nothing moves), then it is
 * cleared with groups pending. Returns what happened, for the assertions and the determinism check.
 */
function clearMidWave(seed: number) {
  const h = combatAt(1, 1, seed);
  const w = h.sim.world;
  const pending = new Set(w.spawns);
  const plan = w.spawns.map((g) => ({ g, ...what(g) }));
  const log: string[] = [];
  const note = (r: ReturnType<typeof step>) => {
    for (const p of r.flares) log.push(`flare ${p}@${r.t}`);
    for (const g of r.spawned) log.push(`spawn ${g.portal} ${g.enemy}×${g.count}@${r.t}`);
  };
  // Combat opens on an empty map: the first pulse flares at once.
  const first = step(h, pending);
  note(first);
  let r = first;
  while (r.spawned.length === 0) note((r = step(h, pending)));
  const firstSpawn = r;
  // With the group alive, the plan holds still.
  const held = w.spawns.map((g) => g.atTick);
  for (let i = 0; i < 30; i++) note(step(h, pending));
  const heldAfter = w.spawns.map((g) => g.atTick);
  // Cleared: the next pulse comes in now.
  const before = new Map(w.spawns.map((g) => [g, g.atTick] as const));
  const next = Math.min(...w.spawns.map((g) => g.atTick));
  killAll(h);
  const clear = step(h, pending);
  note(clear);
  const after = new Map(w.spawns.map((g) => [g, g.atTick] as const));
  let spawnStep = clear;
  while (spawnStep.spawned.length === 0) note((spawnStep = step(h, pending)));
  return {
    h,
    plan,
    first,
    firstSpawn,
    held,
    heldAfter,
    before,
    after,
    next,
    clear,
    spawnStep,
    log,
    hash: stateHash(w),
  };
}

describe('pull-forward on an empty map (§9.4, RC3)', () => {
  it('the flare lead is still 1 s', () => {
    expect(rules.flareMs).toBe(1000);
  });

  it('clearing every live enemy mid-wave: the next pulse flares that step and spawns 60 steps later', () => {
    const r = clearMidWave(1);
    // Wave start (no enemy yet): the first pulse flares on the first combat step.
    expect(r.first.flares.length).toBeGreaterThan(0);
    expect(r.firstSpawn.t).toBe(r.first.t + FLARE);
    // While the group lives, nothing moves.
    expect(r.heldAfter).toEqual(r.held);
    // The next pulse was planned later than one flare from now (else there's nothing to pull).
    expect(r.next - FLARE).toBeGreaterThan(r.clear.t);
    const pulse = [...r.before.keys()].filter((g) => r.before.get(g) === r.next);
    // Its portals flare on the clearing step, and it spawns 60 steps later.
    expect(new Set(r.clear.flares)).toEqual(new Set(pulse.map((g) => g.portal)));
    expect(r.spawnStep.t).toBe(r.clear.t + FLARE);
    expect(r.spawnStep.spawned).toEqual(pulse);
    // Every later pulse moved by the same amount, so their spacing holds.
    const shift = r.next - (r.clear.t + FLARE);
    for (const [g, at] of r.before) expect(r.after.get(g)).toBe(at - shift);
  });

  it('the pulled-forward group keeps its portals, enemies, counts and hot side', () => {
    const r = clearMidWave(1);
    for (const p of r.plan)
      expect(what(p.g)).toEqual({ portal: p.portal, enemy: p.enemy, count: p.count, hot: p.hot });
  });

  it('same seed, same result', () => {
    const a = clearMidWave(3);
    const b = clearMidWave(3);
    expect(b.log).toEqual(a.log);
    expect(b.hash).toBe(a.hash);
  });

  for (const players of [1, 2, 3, 4, 5, 6]) {
    it(`${players} player(s), waves 1 and 9, cleared as they come: the plan in order, each pulse at most 61 steps after the last`, () => {
      for (const n of [1, 9]) {
        const h = combatAt(n, players, 7);
        const w = h.sim.world;
        const pending = new Set(w.spawns);
        const plan = w.spawns.map(what);
        const flaredAt = new Map<string, number[]>();
        const spawned: PendingSpawn[] = [];
        let last: number | null = null;
        let steps = 0;
        while (w.phase === 'combat' && w.wave === n) {
          const r = step(h, pending);
          steps++;
          for (const p of r.flares) flaredAt.set(p, [...(flaredAt.get(p) ?? []), r.t]);
          if (r.spawned.length > 0) {
            for (const g of r.spawned) expect(flaredAt.get(g.portal)).toContain(r.t - FLARE);
            if (last !== null) expect(r.t - last).toBeLessThanOrEqual(FLARE + 1);
            last = r.t;
            spawned.push(...r.spawned);
          }
          killAll(h);
          if (steps > 60 * 200) throw new Error('wave did not end');
        }
        expect(spawned.map(what)).toEqual(plan);
        // Far shorter than the wave's planned duration.
        expect(steps).toBeLessThan((waves.find((d) => d.n === n)!.durationMs * 60) / 1000);
      }
    });
  }

  it('a plan held past the wave (test holds) is never pulled', () => {
    const h = combatAt(1, 1, 1);
    h.holdSpawns();
    const at = h.sim.world.spawns.map((g) => g.atTick);
    const flares = h.collect('portalFlare', 120);
    expect(flares).toEqual([]);
    expect(h.sim.world.spawns.map((g) => g.atTick)).toEqual(at);
  });
});
