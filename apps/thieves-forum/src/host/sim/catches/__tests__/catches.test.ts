// Catch rules (SPEC §6.13): in-person Catch! (nearest in front within reach, mid-steal + 300 ms grace,
// whole pot, no stocks; wrong or NPC → penalty), the stolen item back on the counter, stocks and
// immunity, rising edge only, and money moving through the ledger only with no player on the TV.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../../content';
import { harness, midSteal, place, tvEvents, type Harness } from '../../guards/__tests__/fixtures';
import { spawnPatrolGuard } from '../../guards';
import { holds } from '../../holds';
import { STEP_MS, type Hold, type PlayerInput } from '../../types';
import { catches, lockIn, step } from '../index';

const b = CONTENT.balance;
const GRACE = Math.round(b.catch.graceMs / STEP_MS);

/** p1 (id 1) faces p2 (id 2) from 0.8 tiles to its left, in the lower lane. */
function faceOff(h: Harness) {
  const catcher = h.char(1);
  const target = h.char(2);
  place(catcher, 10, 31.5, 0);
  place(target, 10.8, 31.5, 0);
  return { catcher, target };
}

describe('in-person Catch! (SPEC §6.13)', () => {
  it('right: a mid-steal target pays the whole pot to the catcher, no stocks', () => {
    const h = harness(2);
    const { target } = faceOff(h);
    const hold = midSteal(h, target);
    catches.inPerson(h.ctx(), 1);
    expect(hold.result).toBe('caught');
    expect(h.ledger.calls).toEqual([
      { op: 'debit', side: 'p2', amount: 25, to: { kind: 'player', id: 'p1' } },
      { op: 'credit', side: 'p1', amount: 25 },
    ]);
    expect(tvEvents(h)).toEqual([
      { ch: 'tv', e: 'grabAttempt', by: 1, at: 2, right: true },
      { ch: 'tv', e: 'caught', thief: 2, to: 1, coins: 25 },
    ]);
    expect(target.activity.k).toBe('caught');
    // The caught beat ends with the thief free, never in the stocks.
    h.run(step, 120);
    expect(target.activity.k).toBe('free');
    expect(h.sim.world.stocks.every((s) => s.character === null)).toBe(true);
  });

  it('catch grace: 300 ms after the hold ends is right, one step later is wrong', () => {
    for (const [ago, right] of [
      [GRACE, true],
      [GRACE + 1, false],
    ] as const) {
      const h = harness(2);
      const { target } = faceOff(h);
      h.sim.world.tick = 100;
      target.holdEndedAt = h.sim.world.tick - ago;
      catches.inPerson(h.ctx(), 1);
      const grab = tvEvents(h).find((e) => e.e === 'grabAttempt');
      expect(grab).toMatchObject({ right });
    }
  });

  it('wrong: a target not mid-steal costs the grabber the penalty', () => {
    const h = harness(2);
    faceOff(h);
    catches.inPerson(h.ctx(), 1);
    expect(h.ledger.calls).toEqual([
      { op: 'debit', side: 'p1', amount: b.catch.wrongGrabPenalty, to: 'sink' },
    ]);
    expect(tvEvents(h)).toEqual([{ ch: 'tv', e: 'grabAttempt', by: 1, at: 2, right: false }]);
    expect(h.events()).toContainEqual({
      ch: 'phone',
      player: 'p1',
      e: 'wrongGrab',
      penalty: b.catch.wrongGrabPenalty,
    });
  });

  it('wrong: grabbing an NPC costs the penalty', () => {
    const h = harness(1);
    place(h.char(1), 10, 31.5, 0);
    const npc = h.npc(10.8, 31.5);
    catches.inPerson(h.ctx(), 1);
    expect(tvEvents(h)).toEqual([{ ch: 'tv', e: 'grabAttempt', by: 1, at: npc.id, right: false }]);
  });

  it('grabs the nearest character in front within reach, not one behind', () => {
    const h = harness(3);
    const { target } = faceOff(h);
    place(h.char(3), 9.5, 31.5); // closer, but behind
    midSteal(h, h.char(3));
    midSteal(h, target);
    catches.inPerson(h.ctx(), 1);
    expect(tvEvents(h)[0]).toMatchObject({ at: 2, right: true });
  });

  it('nobody within reach: nothing happens', () => {
    const h = harness(2);
    const { target } = faceOff(h);
    place(target, 10 + b.catch.reach + 0.2, 31.5);
    catches.inPerson(h.ctx(), 1);
    expect(h.events()).toEqual([]);
    expect(h.ledger.calls).toEqual([]);
  });

  it('acts on the rising edge of the catch bit only', () => {
    const h = harness(2);
    faceOff(h);
    const press: PlayerInput = { move: { x: 0, y: 0 }, hold: false, catch: true };
    const inputs = new Map([['p1', press]]);
    let grabs = 0;
    for (let i = 0; i < 5; i++) {
      h.sim.step(inputs);
      grabs += h.sim.events().filter((e) => e.e === 'grabAttempt').length;
    }
    expect(grabs).toBe(1);
  });
});

describe('the stolen item goes back on the counter (SPEC §6.13)', () => {
  it('a grab completed inside the grace window gives its item back', () => {
    const h = harness(2);
    const { target } = faceOff(h);
    const w = h.sim.world;
    const stall = w.stalls.find((s) => s.id === 1)!;
    stall.slots = [
      {
        slot: 0,
        row: 'counter',
        item: 'loaf-of-bread',
        heldBy: 2,
        forward: false,
        restockAt: null,
      },
    ];
    const hold: Hold = {
      id: 1,
      kind: 'grab',
      actor: 2,
      target: { k: 'item', stall: 1, slot: 0, fromShelf: false },
      startTick: w.tick,
      endTick: w.tick + 30,
      result: null,
    };
    w.holds.push(hold);
    h.run(step); // tracks the live grab
    // The grab completes and the item leaves the counter (TF8's stall theft).
    hold.result = 'complete';
    target.holdEndedAt = w.tick;
    stall.slots[0]!.item = null;
    stall.slots[0]!.heldBy = null;
    w.holds.length = 0;
    h.run(step, 5);
    catches.inPerson(h.ctx(), 1);
    expect(stall.slots[0]!.item).toBe('loaf-of-bread');
    expect(h.ledger.calls).toContainEqual({ op: 'removeItem', side: 'p2', item: 'loaf-of-bread' });
    expect(tvEvents(h)).toContainEqual({ ch: 'tv', e: 'stallChanged', stall: 1 });
  });

  it('a catch mid-hold ends it as caught (the item never left)', () => {
    const h = harness(2);
    const { target } = faceOff(h);
    const hold = midSteal(h, target);
    catches.inPerson(h.ctx(), 1);
    expect(hold.result).toBe('caught');
    expect(holds.activeFor(h.sim.world, 2)).toBeNull();
  });
});

describe('stocks and immunity (SPEC §6.13)', () => {
  it('no catch while in the stocks or 3 s after release', () => {
    const h = harness(2);
    const thief = h.char(2);
    lockIn(h.ctx(), 2, 0);
    expect(thief.activity.k).toBe('stocks');
    expect(catches.catchable(h.ctx(), 2)).toBe(false);
    const stocksTicks = Math.round(b.stocks.ms / STEP_MS);
    h.run(step, stocksTicks + 1);
    expect(tvEvents(h)).toContainEqual({ ch: 'tv', e: 'stocksOut', character: 2 });
    expect(thief.activity.k).toBe('free');
    const released = h.sim.world.tick - 1;
    const immune = Math.round(b.stocks.immunityMs / STEP_MS);
    h.sim.world.tick = released + immune - 1;
    expect(catches.catchable(h.ctx(), 2)).toBe(false);
    // A guard reaching them now does nothing.
    const g = spawnPatrolGuard(h.ctx(), 0);
    catches.byGuard(h.ctx(), g.id, 2, 'guardChase');
    expect(h.ledger.calls).toEqual([]);
    h.sim.world.tick = released + immune;
    expect(catches.catchable(h.ctx(), 2)).toBe(true);
  });

  it('the stocks hold several thieves at once', () => {
    const h = harness(3);
    lockIn(h.ctx(), 2, 0);
    lockIn(h.ctx(), 3, 1);
    expect(h.sim.world.stocks.map((s) => s.character)).toEqual([2, 3, null]);
  });
});

describe('disguise and the ledger (SPEC §6.11, §6.13)', () => {
  it('a catch fires a tv starburst event and pays through the ledger only', () => {
    const h = harness(2);
    const g = spawnPatrolGuard(h.ctx(), 0);
    const thief = h.char(2);
    const before = JSON.stringify(h.sim.world.characters.map((c) => c.npc.purse));
    catches.byGuard(h.ctx(), g.id, thief.id, 'guardChase');
    const tv = tvEvents(h);
    expect(tv).toEqual([{ ch: 'tv', e: 'caught', thief: 2, to: g.id, coins: 25 }]);
    expect(JSON.stringify(tv)).not.toMatch(/p\d/);
    expect(h.ledger.calls).toEqual([{ op: 'debit', side: 'p2', amount: 25, to: 'guard' }]);
    expect(JSON.stringify(h.sim.world.characters.map((c) => c.npc.purse))).toBe(before);
    expect(g.mode).toMatchObject({ k: 'march', thief: 2 });
  });

  it('guards never grab NPCs', () => {
    const h = harness(1);
    const g = spawnPatrolGuard(h.ctx(), 0);
    const npc = h.npc(10, 31.5);
    catches.byGuard(h.ctx(), g.id, npc.id, 'guardChase');
    expect(h.events()).toEqual([]);
    expect(g.mode.k).toBe('patrol');
  });
});
