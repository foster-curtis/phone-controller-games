// Guard rules (SPEC §6.3, §6.12, §6.13): patrol loop and alley speed, cones with stall occlusion,
// spotting, alerts, chase and escape, guard catches and the march, the locked-in collect, starting guards
// and escalation through the gate.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../../content';
import { quietSim } from '../../__tests__/helpers';
import { STEP_MS, type GuardMode } from '../../types';
import {
  activate,
  canSee,
  guards,
  guardView,
  spawnPatrolGuard,
  startingGuards,
  step,
} from '../index';
import { DOWN, harness, midSteal, place, tvEvents, UP } from './fixtures';

const b = CONTENT.balance;
const L = CONTENT.layout;
const chase = (m: GuardMode) => {
  if (m.k !== 'chase') throw new Error(`not chasing: ${m.k}`);
  return m;
};

describe('patrol (SPEC §6.12)', () => {
  it('walks the loop upper lane → alley → lower lane → end passage, in order', () => {
    const h = harness(0);
    const g = spawnPatrolGuard(h.ctx(), 0);
    const seen: number[] = [];
    for (let i = 0; i < 12_000 && seen.length < 9; i++) {
      h.sim.step();
      const m = g.mode;
      if (m.k === 'patrol' && seen[seen.length - 1] !== m.waypoint) seen.push(m.waypoint);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 1]);
  });

  it('squeezes through alleys at 60% speed', () => {
    const h = harness(0);
    const g = spawnPatrolGuard(h.ctx(), 0);
    g.mode = { k: 'patrol', waypoint: 2 };
    place(g, 16.125, 22, DOWN); // inside alley A, heading to the lower lane
    let y = g.y;
    h.sim.step();
    const inAlley = g.y - y;
    place(g, 16.125, 28, DOWN); // lower lane, same target
    y = g.y;
    h.sim.step();
    const inLane = g.y - y;
    expect(inLane).toBeCloseTo((b.guards.walkSpeed * STEP_MS) / 1000, 6);
    expect(inAlley / inLane).toBeCloseTo(b.guards.alleySpeed, 6);
  });
});

describe('cones and spotting (SPEC §6.12)', () => {
  it('spots a mid-steal player in the cone: red cone, "!" event, jog, activation', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    place(g, 12, 13, DOWN);
    const thief = h.char(1);
    place(thief, 12, 19);
    midSteal(h, thief);
    h.run(step);
    const m = chase(g.mode);
    expect(m.thief).toBe(1);
    expect(g.alert).toBe(true);
    expect(g.gait).toBe('jog');
    expect(tvEvents(h)).toContainEqual({ ch: 'tv', e: 'guardSpot', guard: g.id, at: 1 });
    expect(h.sim.world.activations).toBe(1);
    const v = guardView(g, h.sim.world.tick, b);
    expect(v.bang).toBe(true);
    expect(v.cone.alert).toBe(true);
  });

  it('a stall between guard and thief blocks the spot', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    place(g, 12, 19.5, DOWN); // upper lane, looking down at the middle row
    const thief = h.char(1);
    place(thief, 12, 27.5); // lower lane, behind the perfume stall, 8 tiles away
    midSteal(h, thief);
    h.run(step);
    expect(g.mode.k).toBe('patrol');
    expect(h.sim.world.activations).toBe(0);
  });

  it('ignores a thief outside the cone angle', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    place(g, 12, 15, UP);
    const thief = h.char(1);
    place(thief, 12, 18);
    midSteal(h, thief);
    h.run(step);
    expect(g.mode.k).toBe('patrol');
  });

  it('never reacts to browsing', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    place(g, 12, 13, DOWN);
    const thief = h.char(1);
    place(thief, 12, 18);
    thief.activity = { k: 'browsing', stall: 1 };
    h.run(step);
    expect(g.mode.k).toBe('patrol');
  });

  it('ducking into an alley breaks line of sight', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    place(g, 13, 29);
    expect(canSee(g, { x: 16.125, y: 27.5 }, L, b, false)).toBe(true);
    expect(canSee(g, { x: 16.125, y: 23.5 }, L, b, false)).toBe(false);
  });
});

describe('alerts (SPEC §6.12)', () => {
  it('sends every guard in the lane, counts one activation', () => {
    const h = harness(1);
    const a = spawnPatrolGuard(h.ctx(), 0);
    const c = spawnPatrolGuard(h.ctx(), 0);
    const up = spawnPatrolGuard(h.ctx(), 0);
    place(a, 5, 31.5);
    place(c, 30, 31.5);
    place(up, 10, 15.5);
    place(h.char(1), 20, 31.5);
    guards.raiseAlert(h.ctx(), 1, 'lower', 'merchantCall');
    expect(chase(a.mode).thief).toBe(1);
    expect(chase(c.mode).thief).toBe(1);
    expect(up.mode.k).toBe('patrol');
    expect(h.sim.world.activations).toBe(1);
  });

  it('sends the nearest guard when none is in the lane', () => {
    const h = harness(1);
    const far = spawnPatrolGuard(h.ctx(), 0);
    const near = spawnPatrolGuard(h.ctx(), 0);
    place(far, 35, 15.5);
    place(near, 10, 15.5);
    place(h.char(1), 12, 31.5);
    guards.raiseAlert(h.ctx(), 1, 'lower', 'npcAlert');
    expect(chase(near.mode).thief).toBe(1);
    expect(far.mode.k).toBe('patrol');
  });

  it('never goes after an NPC', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    place(g, 10, 31.5);
    const npc = h.npc(12, 31.5);
    guards.raiseAlert(h.ctx(), npc.id, 'lower', 'npcAlert');
    expect(g.mode.k).toBe('patrol');
    expect(h.sim.world.activations).toBe(0);
  });
});

describe('chase and escape (SPEC §6.12)', () => {
  it('heads for the live position while seen, the last-seen one when not', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    place(g, 5, 31.5);
    const thief = h.char(1);
    place(thief, 10, 31.5);
    guards.raiseAlert(h.ctx(), 1, 'lower', 'npcAlert');
    place(thief, 11, 31.5);
    h.run(step);
    expect(chase(g.mode).lastSeen).toEqual({ x: 11, y: 31.5 });
    expect(g.vx).toBeGreaterThan(0);
    place(thief, 12, 15); // gone behind the stalls
    h.run(step);
    const m = chase(g.mode);
    expect(m.lastSeen).toEqual({ x: 11, y: 31.5 });
    expect(m.unseenTicks).toBe(1);
  });

  it('escape after 3.0 s out of every chaser’s sight, not at 2.9 s', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    place(g, 12, 30);
    const thief = h.char(1);
    place(thief, 12, 15);
    g.mode = { k: 'chase', thief: 1, lastSeen: { x: 12, y: 30 }, unseenTicks: 0 };
    h.run(step, Math.round(2900 / STEP_MS));
    expect(g.mode.k).toBe('chase');
    h.run(step, Math.round(100 / STEP_MS) - 1);
    expect(g.mode.k).toBe('chase');
    h.run(step);
    expect(g.mode.k).toBe('patrol');
    expect(g.alert).toBe(false);
    expect(tvEvents(h)).toContainEqual({ ch: 'tv', e: 'guardGiveUp', guard: g.id });
  });

  it('a second chaser who can see the thief keeps everyone on the chase', () => {
    const h = harness(1);
    const blind = spawnPatrolGuard(h.ctx(), 0);
    const sees = spawnPatrolGuard(h.ctx(), 0);
    place(blind, 12, 30);
    place(sees, 8, 15);
    place(h.char(1), 12, 15);
    for (const g of [blind, sees])
      g.mode = { k: 'chase', thief: 1, lastSeen: { x: g.x, y: g.y }, unseenTicks: 0 };
    sees.vx = 0;
    h.run(step, Math.round(4000 / STEP_MS));
    expect(blind.mode.k).toBe('chase');
  });

  it('a guard who reaches the thief catches them: pot to the guard, march, 20 s stocks', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    const thief = h.char(1);
    place(g, 10, 31.5);
    place(thief, 10.6, 31.5);
    g.mode = { k: 'chase', thief: 1, lastSeen: { x: 10.6, y: 31.5 }, unseenTicks: 0 };
    h.run(step);
    expect(tvEvents(h)).toContainEqual({ ch: 'tv', e: 'caught', thief: 1, to: g.id, coins: 25 });
    expect(h.ledger.calls).toContainEqual({ op: 'debit', side: 'p1', amount: 25, to: 'guard' });
    expect(g.mode.k).toBe('march');
    expect(thief.activity.k).toBe('caught');
    // Walk to the stocks.
    let stocksIn = -1;
    for (let i = 0; i < 60 * 30 && stocksIn < 0; i++) {
      h.sim.step();
      if (h.sim.events().some((e) => e.e === 'stocksIn')) stocksIn = h.sim.world.tick - 1;
    }
    expect(stocksIn).toBeGreaterThan(0);
    expect(thief.activity.k).toBe('stocks');
    expect(h.sim.world.stocks.some((s) => s.character === 1)).toBe(true);
    expect(g.mode.k).toBe('patrol');
    const s = h.sim.world.stocks.find((x) => x.character === 1)!;
    expect(s.releaseAt - stocksIn).toBe(Math.round(b.stocks.ms / STEP_MS));
  });
});

describe('tip-off collect (SPEC §6.13)', () => {
  it('the nearest free guard collects, locked in: no escape, tipper gets ¼ of the pot', () => {
    const h = harness(2);
    const near = spawnPatrolGuard(h.ctx(), 0);
    const far = spawnPatrolGuard(h.ctx(), 0);
    place(near, 6, 15.5);
    place(far, 35, 15.5);
    const thief = h.char(1);
    place(thief, 12, 31.5); // other lane, out of sight
    place(h.char(2), 30, 31.5);
    guards.collect(h.ctx(), 1, 'p2');
    expect(near.mode).toEqual({ k: 'collect', thief: 1, tipper: 'p2' });
    expect(h.sim.world.activations).toBe(1);
    let caught = false;
    for (let i = 0; i < 60 * 40 && !caught; i++) {
      h.sim.step();
      caught = h.sim.events().some((e) => e.ch === 'tv' && e.e === 'caught');
      expect(near.mode.k === 'collect' || caught).toBe(true);
    }
    expect(caught).toBe(true);
    expect(h.ledger.calls).toContainEqual({ op: 'debit', side: 'p1', amount: 25, to: 'guard' });
    expect(h.ledger.calls).toContainEqual({ op: 'credit', side: 'p2', amount: 6 });
    expect(far.mode.k).toBe('patrol');
  });
});

describe('starting guards and escalation (SPEC §6.12)', () => {
  it('starts 1/2/3 at 5+ players and 1/1/2 at 2–4', () => {
    expect([1, 2, 3].map((r) => startingGuards(5, r, b))).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((r) => startingGuards(8, r, b))).toEqual([1, 2, 3]);
    expect([1, 2, 3].map((r) => startingGuards(2, r, b))).toEqual([1, 1, 2]);
    expect([1, 2, 3].map((r) => startingGuards(4, r, b))).toEqual([1, 1, 2]);
  });

  it('places the starting guards on the patrol loop when play starts', () => {
    const sim = quietSim(1, 6);
    sim.world.round = 3;
    expect(sim.world.guards.length).toBe(0);
    sim.step();
    expect(sim.world.guards.length).toBe(3);
    for (const g of sim.world.guards) expect(g.mode.k).toBe('patrol');
    sim.step();
    expect(sim.world.guards.length).toBe(3);
  });

  it('5 activations → a 2nd guard walks in through the gate', () => {
    const h = harness(1);
    spawnPatrolGuard(h.ctx(), 0);
    for (let i = 0; i < 4; i++) activate(h.ctx(), 'npcAlert', 1);
    expect(h.sim.world.guards.length).toBe(1);
    activate(h.ctx(), 'npcAlert', 1);
    const w = h.sim.world;
    expect(w.guards.length).toBe(2);
    const g = w.guards[1]!;
    expect(g.mode.k).toBe('enter');
    expect(w.gateOpen).toBe(true);
    expect(tvEvents(h)).toContainEqual({ ch: 'tv', e: 'reinforcement', guard: g.id });
    expect(tvEvents(h)).toContainEqual({ ch: 'tv', e: 'gate', open: true });
    let i = 0;
    while (g.mode.k === 'enter' && i++ < 600) h.sim.step();
    expect(g.mode.k).toBe('patrol');
    expect(g.y).toBeGreaterThan(L.gate.rect.y + L.gate.rect.h);
    h.sim.step();
    expect(w.gateOpen).toBe(false);
  });

  it('4 guards is the cap', () => {
    const h = harness(1);
    spawnPatrolGuard(h.ctx(), 0);
    for (let i = 0; i < 40; i++) activate(h.ctx(), 'spot', 1);
    expect(h.sim.world.guards.length).toBe(b.guards.cap);
    expect(h.sim.world.activations).toBe(40);
  });
});
