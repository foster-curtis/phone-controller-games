// Merchants (SPEC §6.6, §6.9 merchant side): one per open stall, the serving queue, walking along the
// counter to the served customer, the dialog (just browsing, ask about, leave), bring forward and leave
// on the counter with return to the shelf, out from behind the counter, glance timing and suspicion.
import { rngStream } from '@pcg/game-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { CONTENT } from '../../../../content';
import { THEFT_HOOKS } from '../../stalls';
import { glanceIntervalTicks, merchants, strongestSuspicion, suspicionFactor } from '../index';
import { MERCHANT_TUNING } from '../tuning';
import { BAKERY, noGlances, phone, rig, tv } from './fixtures';

const b = CONTENT.balance.merchants;
const ticks = (ms: number) => Math.round(ms / (1000 / 60));

afterEach(() => {
  THEFT_HOOKS.ledger = null;
});

describe('setup (SPEC §6.6)', () => {
  it('stocks every open stall and gives each one merchant behind its counter', () => {
    const r = rig(2);
    expect(r.sim.world.merchants.length).toBe(10);
    for (const s of r.sim.world.stalls) {
      const m = r.sim.world.merchants.find((mm) => mm.id === s.merchant)!;
      expect(m.stall).toBe(s.id);
      expect(m.spot).toBe('counter');
      expect(m.y).toBe(CONTENT.layout.stalls[s.id]!.merchantCounterY);
      expect(s.slots.length).toBe(s.shop === 'pawnbroker' ? 0 : 8);
    }
    // Merchants take ids after the players' characters.
    expect(Math.min(...r.sim.world.merchants.map((m) => m.id))).toBe(3);
  });
});

describe('attention by position and the dialog (SPEC §6.6)', () => {
  it('BROWSE opens the stall view; he walks along the counter to the customer, then the dialog opens', () => {
    const r = rig(1);
    noGlances(r);
    const ev = r.browse(1, BAKERY, 0.95);
    expect(phone(ev)).toContainEqual({ ch: 'phone', player: 'p1', e: 'stallView', stall: BAKERY });
    expect(r.player(1).activity).toEqual({ k: 'browsing', stall: BAKERY });
    const m = r.merchant(BAKERY);
    const startX = m.x;
    let opened = -1;
    for (let i = 0; i < 400 && opened < 0; i++) {
      if (phone(r.step()).some((e) => e.e === 'dialog' && e.open)) opened = i;
    }
    expect(opened).toBeGreaterThan(0);
    expect(m.x).toBeGreaterThan(startX + 1);
    expect(Math.abs(m.x - r.player(1).x)).toBeLessThan(0.2);
    expect(m.helping).toBe(r.player(1).id);
  });

  it('serves the queue in arrival order and moves on after a pick', () => {
    const r = rig(2);
    noGlances(r);
    r.browse(1, BAKERY, 0.1);
    r.browse(2, BAKERY, 0.9);
    const m = r.merchant(BAKERY);
    expect(m.desk!.queue).toEqual([r.player(1).id, r.player(2).id]);
    for (let i = 0; i < 400 && !(m.desk!.task.k === 'serve' && m.desk!.task.dialog); i++) r.step();
    expect(m.helping).toBe(r.player(1).id);
    const ev = r.step([{ k: 'dialog', player: 'p1', pick: 'leave' }]);
    expect(phone(ev)).toContainEqual({
      ch: 'phone',
      player: 'p1',
      e: 'dialog',
      open: false,
      stall: BAKERY,
    });
    r.run(2);
    expect(m.helping).toBe(r.player(2).id);
    expect(m.suspicion).toEqual([]); // Leave raises no suspicion
  });

  it('"Just browsing" raises his suspicion of that player', () => {
    const r = rig(1);
    noGlances(r);
    r.browse(1, BAKERY);
    const m = r.merchant(BAKERY);
    for (let i = 0; i < 400 && !(m.desk!.task.k === 'serve' && m.desk!.task.dialog); i++) r.step();
    r.step([{ k: 'dialog', player: 'p1', pick: 'browsing' }]);
    expect(m.suspicion).toEqual([{ of: r.player(1).id, until: expect.any(Number) }]);
    expect(m.nextGlanceAt).toBeLessThanOrEqual(
      r.sim.world.tick + ticks(b.glanceIntervalMs[1] / 2) + 1,
    );
    expect(m.helping).toBeNull();
  });

  it('Ask about…: he turns to fetch it (back to the counter), brings it forward, then returns it', () => {
    const r = rig(1);
    noGlances(r);
    r.browse(1, BAKERY);
    const m = r.merchant(BAKERY);
    for (let i = 0; i < 400 && !(m.desk!.task.k === 'serve' && m.desk!.task.dialog); i++) r.step();
    const shelf = r.stall(BAKERY).slots.find((s) => s.row === 'shelf')!;
    r.step([{ k: 'dialog', player: 'p1', pick: 'ask', slot: shelf.slot }]);
    r.step();
    expect(m.spot).toBe('shelf');
    expect(merchants.isAway(m)).toBe(false); // the shelf stays out of reach while he fetches
    let carried = false;
    for (let i = 0; i < 300 && m.desk!.task.k !== 'show'; i++) {
      r.step();
      carried ||= m.carrying === shelf.item;
    }
    expect(carried).toBe(true);
    expect(m.spot).toBe('counter');
    expect(m.y).toBeCloseTo(CONTENT.layout.stalls[BAKERY]!.merchantCounterY, 1);
    for (let i = 0; i < 600 && m.desk!.task.k !== 'idle'; i++) r.step();
    expect(m.carrying).toBeNull();
    expect(shelf.row).toBe('shelf');
    expect(shelf.item).toBe(shelf.stocked);
  });

  it('may leave a shown item on the counter when another customer arrives, and returns it later', () => {
    const content = {
      ...CONTENT,
      balance: { ...CONTENT.balance, merchants: { ...b, leaveOutChance: 1 } },
    };
    const r = rig(2, content);
    noGlances(r);
    r.browse(1, BAKERY, 0.2);
    const m = r.merchant(BAKERY);
    for (let i = 0; i < 400 && !(m.desk!.task.k === 'serve' && m.desk!.task.dialog); i++) r.step();
    const shelf = r.stall(BAKERY).slots.find((s) => s.row === 'shelf')!;
    r.step([{ k: 'dialog', player: 'p1', pick: 'ask', slot: shelf.slot }]);
    for (let i = 0; i < 300 && m.desk!.task.k !== 'show'; i++) r.step();
    const ev = r.browse(2, BAKERY, 0.8);
    expect(tv(ev)).toContainEqual({ ch: 'tv', e: 'stallChanged', stall: BAKERY });
    expect(shelf.forward).toBe(true);
    expect(shelf.row).toBe('counter');
    expect(m.carrying).toBeNull();
    // Grabbable from the counter row at its normal grab time while it's out.
    const view = r.sim.world.stalls[BAKERY]!;
    expect(view.slots.find((s) => s.slot === shelf.slot)!.row).toBe('counter');
    // He serves p2, then takes it back to the shelf.
    for (let i = 0; i < 400 && !(m.desk!.task.k === 'serve' && m.desk!.task.dialog); i++) r.step();
    expect(m.helping).toBe(r.player(2).id);
    r.step([{ k: 'dialog', player: 'p2', pick: 'leave' }]);
    for (let i = 0; i < 300 && shelf.forward; i++) r.step();
    expect(shelf.row).toBe('shelf');
    expect(shelf.item).toBe(shelf.stocked);
  });

  it('a browsing player who moves the stick walks away and the view closes', () => {
    const r = rig(1);
    r.browse(1, BAKERY);
    r.input.set('p1', { move: { x: 1, y: 0 }, hold: false, catch: false });
    const ev = r.step();
    expect(phone(ev)).toContainEqual({ ch: 'phone', player: 'p1', e: 'stallView', stall: null });
    expect(r.player(1).activity).toEqual({ k: 'free' });
  });
});

describe('out from behind the counter (SPEC §6.7, §6.9)', () => {
  it('a coin call shows "?", walks him out, picks the coin up and walks him back', () => {
    const r = rig(0);
    noGlances(r);
    const m = r.merchant(BAKERY);
    m.coin = 7;
    r.sim.world.coins.push({
      id: 7,
      by: 1,
      from: { x: 10, y: 14 },
      to: { x: 12, y: 14 },
      thrownAt: 0,
      landsAt: 0,
      claimedBy: m.id,
    });
    const ctx = r.sim.context();
    merchants.callAway(ctx, m.id, { x: 12, y: 14 });
    expect(r.sim.world.events).toContainEqual({ ch: 'tv', e: 'merchantQuestion', merchant: m.id });
    expect(m.spot).toBe('away');
    const ev = r.run(1500);
    expect(tv(ev)).toContainEqual({ ch: 'tv', e: 'coinPicked', coin: 7, by: m.id });
    expect(r.sim.world.coins).toEqual([]);
    expect(m.spot).toBe('counter');
    expect(m.y).toBeCloseTo(CONTENT.layout.stalls[BAKERY]!.merchantCounterY, 1);
  });
});

describe('glance timing and suspicion (SPEC §6.6, §7)', () => {
  it('the base interval is 4–8 s', () => {
    const rng = rngStream(1, 'merchant:1');
    for (let i = 0; i < 200; i++) {
      const t = glanceIntervalTicks(rng, b, 1, ticks);
      expect(t).toBeGreaterThanOrEqual(ticks(b.glanceIntervalMs[0]));
      expect(t).toBeLessThanOrEqual(ticks(b.glanceIntervalMs[1]));
    }
  });

  it('suspicion doubles the glance rate and decays back over ~20 s', () => {
    const decay = ticks(b.suspicion.decayMs);
    const until = 100 + decay;
    expect(suspicionFactor(until, 100, b.suspicion.glanceMult, decay)).toBe(2);
    expect(suspicionFactor(until, 100 + decay / 2, b.suspicion.glanceMult, decay)).toBeCloseTo(1.5);
    expect(suspicionFactor(until, until, b.suspicion.glanceMult, decay)).toBe(1);
    const a = glanceIntervalTicks(rngStream(5, 'x'), b, 1, ticks);
    const c = glanceIntervalTicks(rngStream(5, 'x'), b, 2, ticks);
    expect(c).toBe(Math.round(a / 2));
    // Only suspicion of someone at his counter counts.
    const m = { suspicion: [{ of: 4, until }] };
    expect(strongestSuspicion(m, [4], 100, 2, decay)).toEqual({ of: 4, factor: 2 });
    expect(strongestSuspicion(m, [5], 100, 2, decay)).toEqual({ of: null, factor: 1 });
  });

  it('glances about twice as often at a suspected customer (sim)', () => {
    const count = (suspect: boolean) => {
      const r = rig(1);
      r.browse(1, BAKERY);
      const m = r.merchant(BAKERY);
      const ctx = r.sim.context();
      let n = 0;
      for (let i = 0; i < ticks(8000); i++) {
        if (suspect) merchants.suspect(ctx, m.id, r.player(1).id); // kept fresh
        n += tv(r.step()).filter((e) => e.e === 'glanceLook' && e.by === m.id).length;
      }
      return n;
    };
    // 8 s of dialog-free time: without suspicion at most ~2 glances, with it clearly more.
    expect(count(true)).toBeGreaterThan(count(false));
  });

  it('every look follows its wind-up by exactly the balance beat', () => {
    const r = rig(0);
    const m = r.merchant(BAKERY);
    const starts: number[] = [];
    const looks: number[] = [];
    for (let i = 0; i < ticks(40_000); i++) {
      const t = r.sim.world.tick;
      for (const e of tv(r.step())) {
        if (e.e === 'glanceWindup' && e.by === m.id) starts.push(t);
        if (e.e === 'glanceLook' && e.by === m.id) looks.push(t);
      }
    }
    expect(starts.length).toBeGreaterThan(3);
    looks.forEach((l, i) => expect(l - starts[i]!).toBe(ticks(b.windupMs)));
    expect(MERCHANT_TUNING.dialogMs).toBeGreaterThan(0);
  });
});
