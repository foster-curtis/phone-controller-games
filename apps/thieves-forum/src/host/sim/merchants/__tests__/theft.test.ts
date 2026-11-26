// Stall theft and merchant catches (SPEC §6.6, §6.7, §6.11, §6.12): grab arms a hold at the tile's grab
// time; one holder per item; complete → item to the pack with only `stallChanged` on the TV; a look
// landing mid-grab is a merchant catch (item stays, alert, no money lost), a release during the wind-up
// is safe; merchants catch only at their own stall; the back shelf only while he is out, cancelled (not
// caught) when he steps back.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT, grabMs, item } from '../../../../content';
import { guards } from '../../guards';
import { holds } from '../../holds';
import { stalls, THEFT_HOOKS } from '../../stalls';
import type { SimEvent } from '../../types';
import { merchants } from '../index';
import { BAKERY, noGlances, phone, rig, SPICES, tv, withLedger, type Rig } from './fixtures';

const b = CONTENT.balance;
const ticks = (ms: number) => Math.round(ms / (1000 / 60));

afterEach(() => {
  THEFT_HOOKS.ledger = null;
  vi.restoreAllMocks();
});

const counterSlot = (r: Rig, stall = BAKERY) =>
  r.stall(stall).slots.find((s) => s.row === 'counter')!;
const shelfSlot = (r: Rig, stall = BAKERY) => r.stall(stall).slots.find((s) => s.row === 'shelf')!;

/** Player `i` presses GRAB on `slot` (the event plus the held bit); returns the events until it starts. */
function press(r: Rig, i: number, stall: number, slot: number): SimEvent[] {
  r.hold(i, true);
  const ev = r.step([{ k: 'grab', player: `p${i}`, stall, slot }]);
  return [...ev, ...r.step()];
}

describe('grab (SPEC §6.7)', () => {
  it('a full hold puts the item in the pack; the TV only sees the item leave (stallChanged)', () => {
    const r = rig(1);
    noGlances(r);
    const ledger = withLedger();
    r.browse(1, BAKERY);
    const sl = counterSlot(r);
    const def = item(sl.item!);
    const ev = press(r, 1, BAKERY, sl.slot);
    const start = phone(ev).find((e) => e.e === 'holdStart');
    expect(start).toMatchObject({ durationMs: grabMs(def), stall: BAKERY, slot: sl.slot });
    ev.push(...r.run(ticks(grabMs(def)) + 2));
    expect(sl.item).toBeNull();
    expect(ledger.packs.get('p1')).toEqual([
      { item: def.id, value: def.value, weight: def.weight },
    ]);
    expect(phone(ev)).toContainEqual({
      ch: 'phone',
      player: 'p1',
      e: 'grabbed',
      item: def.id,
      value: def.value,
    });
    expect(phone(ev)).toContainEqual(expect.objectContaining({ e: 'holdEnd', result: 'complete' }));
    // Disguise (SPEC §6.11): no tv event on a successful grab but the stall change.
    expect(tv(ev).filter((e) => e.e !== 'stallChanged')).toEqual([]);
    expect(tv(ev)).toEqual([{ ch: 'tv', e: 'stallChanged', stall: BAKERY }]);
  });

  it('releasing early takes nothing', () => {
    const r = rig(1);
    noGlances(r);
    r.browse(1, BAKERY);
    const sl = counterSlot(r);
    press(r, 1, BAKERY, sl.slot);
    r.run(10);
    r.hold(1, false);
    const ev = r.run(60);
    expect(sl.item).not.toBeNull();
    expect(phone(ev)).toContainEqual(
      expect.objectContaining({ e: 'holdEnd', result: 'cancelled' }),
    );
  });

  it('one holder per item: a second player sees takenByOther and cannot start', () => {
    const r = rig(2);
    noGlances(r);
    r.browse(1, BAKERY, 0.2);
    r.browse(2, BAKERY, 0.8);
    const sl = counterSlot(r);
    const ev = press(r, 1, BAKERY, sl.slot);
    // p2's open view is refreshed with the tile taken.
    expect(phone(ev)).toContainEqual({ ch: 'phone', player: 'p2', e: 'stallView', stall: BAKERY });
    expect(sl.heldBy).toBe(r.player(1).id);
    const tile = stalls
      .view(r.sim.world, BAKERY, r.player(2).id, CONTENT)
      .counter.find((t) => t.slot === sl.slot)!;
    expect(tile.state).toBe('takenByOther');
    const p2 = press(r, 2, BAKERY, sl.slot);
    expect(phone(p2).filter((e) => e.player === 'p2' && e.e === 'holdStart')).toEqual([]);
    expect(holds.activeFor(r.sim.world, r.player(2).id)).toBeNull();
  });
});

describe('merchant catches (SPEC §6.6)', () => {
  it('a look landing mid-grab is a catch: shout, alert, item stays, no money lost', () => {
    const r = rig(1);
    noGlances(r);
    const ledger = withLedger();
    const alert = vi.spyOn(guards, 'raiseAlert');
    r.browse(1, BAKERY);
    const m = r.merchant(BAKERY);
    // The slowest counter item, so the look lands well inside its grab time.
    const sl = r
      .stall(BAKERY)
      .slots.filter((s) => s.row === 'counter')
      .sort((a, c) => grabMs(item(c.item!)) - grabMs(item(a.item!)))[0]!;
    press(r, 1, BAKERY, sl.slot);
    m.nextGlanceAt = r.sim.world.tick; // wind-up now; the look lands well inside the grab time
    expect(ticks(b.merchants.windupMs)).toBeLessThan(ticks(grabMs(item(sl.item!))));
    const ev = r.run(ticks(b.merchants.windupMs) + 2);
    expect(phone(ev)).toContainEqual(
      expect.objectContaining({ player: 'p1', e: 'holdEnd', result: 'caught' }),
    );
    expect(tv(ev)).toContainEqual({ ch: 'tv', e: 'shout', by: m.id, at: r.player(1).id });
    expect(alert).toHaveBeenCalledWith(expect.anything(), r.player(1).id, 'upper', 'merchantCall');
    expect(sl.item).toBe(sl.stocked);
    expect(sl.heldBy).toBeNull();
    expect(ledger.packs.get('p1')).toBeUndefined();
    expect(m.pose).toBe('point');
  });

  it('a release during the wind-up is safe', () => {
    const r = rig(1);
    noGlances(r);
    const alert = vi.spyOn(guards, 'raiseAlert');
    r.browse(1, BAKERY);
    const m = r.merchant(BAKERY);
    const sl = counterSlot(r);
    press(r, 1, BAKERY, sl.slot);
    m.nextGlanceAt = r.sim.world.tick;
    const ev = r.step();
    expect(tv(ev)).toContainEqual({ ch: 'tv', e: 'glanceWindup', by: m.id });
    r.hold(1, false);
    ev.push(...r.run(ticks(b.merchants.windupMs + b.merchants.lookMs) + 2));
    expect(tv(ev)).toContainEqual({ ch: 'tv', e: 'glanceLook', by: m.id });
    expect(tv(ev).filter((e) => e.e === 'shout')).toEqual([]);
    expect(phone(ev)).toContainEqual(
      expect.objectContaining({ e: 'holdEnd', result: 'cancelled' }),
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it('merchants only catch at their own stall', () => {
    const r = rig(1);
    noGlances(r);
    r.browse(1, SPICES);
    const sl = counterSlot(r, SPICES);
    press(r, 1, SPICES, sl.slot);
    r.merchant(BAKERY).nextGlanceAt = r.sim.world.tick;
    const ev = r.run(ticks(b.merchants.windupMs) + 4);
    expect(tv(ev).filter((e) => e.e === 'shout')).toEqual([]);
    expect(holds.activeFor(r.sim.world, r.player(1).id)).not.toBeNull();
  });
});

describe('back shelf (SPEC §6.7)', () => {
  it('cannot be grabbed while he is behind his counter', () => {
    const r = rig(1);
    noGlances(r);
    r.browse(1, BAKERY);
    const ev = press(r, 1, BAKERY, shelfSlot(r).slot);
    expect(phone(ev).filter((e) => e.e === 'holdStart')).toEqual([]);
  });

  it('can be grabbed (+500 ms) while he is out; his return cancels it, not a catch', () => {
    const r = rig(1);
    noGlances(r);
    const alert = vi.spyOn(guards, 'raiseAlert');
    r.browse(1, BAKERY);
    const m = r.merchant(BAKERY);
    const ctx = r.sim.context();
    merchants.callAway(ctx, m.id, { x: m.x + 1, y: m.y + 3 }, 'npc');
    expect(merchants.isAway(m)).toBe(true);
    const sl = shelfSlot(r);
    // Press as he walks the last few steps back behind his counter.
    const t = m.desk!.task;
    for (let i = 0; i < 2000; i++) {
      if (
        t.k === 'away' &&
        t.back.length === 1 &&
        Math.hypot(t.back[0]!.x - m.x, t.back[0]!.y - m.y) < 0.6
      )
        break;
      r.step();
    }
    expect(merchants.isAway(m)).toBe(true);
    const ev = press(r, 1, BAKERY, sl.slot);
    const start = phone(ev).find((e) => e.e === 'holdStart');
    expect(start).toMatchObject({ durationMs: grabMs(item(sl.item!)) + b.grab.reachPenaltyMs });
    // Keep holding until he's back behind the counter (before the grab time is up).
    for (let i = 0; i < 2000 && m.spot === 'away'; i++) ev.push(...r.step());
    ev.push(...r.run(2));
    expect(phone(ev)).toContainEqual(
      expect.objectContaining({ e: 'holdEnd', result: 'cancelled' }),
    );
    expect(tv(ev).filter((e) => e.e === 'shout')).toEqual([]);
    expect(alert).not.toHaveBeenCalled();
    expect(sl.item).toBe(sl.stocked);
  });
});
