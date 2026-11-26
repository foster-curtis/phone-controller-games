// Host hold machine rules (SPEC §3, §6.7, §6.8, §6.13, §12.3): arm → start on the bit → complete or
// cancel; one holder per item; back-shelf cancel; caught hook; catch grace; hot hands; phone-only events.
import { describe, expect, it } from 'vitest';
import { CONTENT, grabMs } from '../../../../content';
import { STEP_MS, type Character } from '../../types';
import { ARM_WAIT_MS, holds, isHot, midStealAt } from '../index';
import {
  citizen,
  COUNTER_SLOT,
  harness,
  makeWorld,
  MERCHANT,
  SHELF_SLOT,
  STALL,
  THIEF,
  VICTIM,
  type Harness,
} from './fixtures';

const b = CONTENT.balance;
const thief = (h: Harness) => h.world.characters.find((c) => c.id === THIEF)!;
const slot = (h: Harness, s: number) => h.world.stalls[0]!.slots.find((x) => x.slot === s)!;
const phoneEvents = (h: Harness) => h.world.events.filter((e) => e.ch === 'phone');

/** Arms GRAB on the counter slot, presses, and steps until the hold starts. */
function startGrab(h: Harness, s = COUNTER_SLOT, ms = 600) {
  h.stepThen(() => expect(holds.armGrab(h.ctx, THIEF, STALL, s, ms)).toBe(true));
  h.input({ hold: true });
  h.step();
  const hold = holds.activeFor(h.world, THIEF)!;
  expect(hold).not.toBeNull();
  return hold;
}

function stepUntilEnd(h: Harness, max = 1000) {
  for (let i = 0; i < max; i++) {
    h.step();
    const end = phoneEvents(h).find((e) => e.e === 'holdEnd');
    if (end && end.e === 'holdEnd') return { result: end.result, tick: h.world.tick - 1 };
  }
  throw new Error('hold never ended');
}

describe('hold machine: GRAB', () => {
  it('starts on the first step that sees the bit, emitting a phone holdStart (no tv event)', () => {
    const h = harness();
    h.stepThen(() => holds.armGrab(h.ctx, THIEF, STALL, COUNTER_SLOT, 600));
    h.input({ hold: false });
    h.step();
    expect(holds.activeFor(h.world, THIEF)).toBeNull();
    h.input({ hold: true });
    h.step();
    const hold = holds.activeFor(h.world, THIEF)!;
    expect(hold.startTick).toBe(2);
    expect(hold.endTick).toBe(2 + 36);
    expect(h.world.events).toEqual([
      {
        ch: 'phone',
        player: 'p1',
        e: 'holdStart',
        hold: hold.id,
        kind: 'grab',
        durationMs: 600,
        stall: STALL,
        slot: COUNTER_SLOT,
      },
    ]);
    expect(slot(h, COUNTER_SLOT).heldBy).toBe(THIEF);
    expect(thief(h).activity).toEqual({ k: 'holding', hold: hold.id });
  });

  it('completes after the duration of continuous hold, and only then', () => {
    const h = harness();
    const hold = startGrab(h);
    const { result, tick } = stepUntilEnd(h);
    expect(result).toBe('complete');
    expect(tick).toBe(hold.endTick);
    expect(h.world.events.every((e) => e.ch === 'phone')).toBe(true);
    expect(slot(h, COUNTER_SLOT).heldBy).toBeNull();
    expect(thief(h).activity).toEqual({ k: 'browsing', stall: STALL });
    // The ended hold is visible for the rest of its step, then dropped.
    h.step();
    expect(h.world.holds).toEqual([]);
  });

  it('cancels when the bit clears, even on the end tick', () => {
    const h = harness();
    const hold = startGrab(h);
    while (h.world.tick < hold.endTick) h.step();
    h.input({ hold: false });
    expect(stepUntilEnd(h).result).toBe('cancelled');
  });

  it('cancels on any stick input (move or turn)', () => {
    const h = harness();
    startGrab(h);
    h.step();
    h.input({ hold: true, move: { x: 0, y: -0.2 } });
    expect(stepUntilEnd(h).result).toBe('cancelled');
  });

  it('no input at all reads as released', () => {
    const h = harness();
    startGrab(h);
    h.input(null);
    expect(stepUntilEnd(h).result).toBe('cancelled');
  });

  it('disarms after ARM_WAIT_MS without the bit', () => {
    const h = harness();
    h.stepThen(() => holds.armGrab(h.ctx, THIEF, STALL, COUNTER_SLOT, 600));
    const wait = Math.round(ARM_WAIT_MS / STEP_MS);
    for (let i = 0; i < wait; i++) h.step();
    h.input({ hold: true });
    h.step();
    expect(holds.activeFor(h.world, THIEF)).toBeNull();
    expect(h.world.holdMachine?.arms).toEqual([]);
  });

  it('the bit at the last arm step still starts it', () => {
    const h = harness();
    h.stepThen(() => holds.armGrab(h.ctx, THIEF, STALL, COUNTER_SLOT, 600));
    const wait = Math.round(ARM_WAIT_MS / STEP_MS);
    for (let i = 1; i < wait; i++) h.step();
    h.input({ hold: true });
    h.step();
    expect(holds.activeFor(h.world, THIEF)).not.toBeNull();
  });

  it('one holder per item: a second character cannot arm or start on a held slot', () => {
    const h = harness();
    h.world.characters.push(citizen(9, 9, 11, 'p2'));
    startGrab(h);
    expect(holds.armGrab(h.ctx, 9, STALL, COUNTER_SLOT, 600)).toBe(false);
    expect(
      holds.start(h.ctx, 9, 'grab', {
        k: 'item',
        stall: STALL,
        slot: COUNTER_SLOT,
        fromShelf: false,
      }),
    ).toBeNull();
  });

  it('one hold at a time per actor', () => {
    const h = harness();
    startGrab(h);
    expect(holds.armPickpocket(h.ctx, THIEF, VICTIM)).toBe(false);
  });

  it('start() computes the §6.5 grab time itself', () => {
    const h = harness();
    const item = CONTENT.items.find((i) => i.id === slot(h, COUNTER_SLOT).item)!;
    const hold = holds.start(h.ctx, THIEF, 'grab', {
      k: 'item',
      stall: STALL,
      slot: COUNTER_SLOT,
      fromShelf: false,
    })!;
    expect(hold.endTick - hold.startTick).toBe(Math.round(grabMs(item) / STEP_MS));
  });
});

describe('hold machine: back shelf (SPEC §6.7)', () => {
  it('cannot be armed while the merchant is behind his counter', () => {
    const h = harness();
    expect(holds.armGrab(h.ctx, THIEF, STALL, SHELF_SLOT, 1100)).toBe(false);
  });

  it('cancels (not caught) when the merchant returns behind the counter', () => {
    const h = harness();
    const m = h.world.merchants.find((x) => x.id === MERCHANT)!;
    m.spot = 'away';
    const hold = startGrab(h, SHELF_SLOT, 1100);
    expect(hold.target).toMatchObject({ k: 'item', fromShelf: true });
    h.step();
    m.spot = 'counter';
    expect(stepUntilEnd(h).result).toBe('cancelled');
  });
});

describe('hold machine: PICKPOCKET', () => {
  function startPocket(h: Harness) {
    h.input({ hold: true });
    h.stepThen(() => expect(holds.armPickpocket(h.ctx, THIEF, VICTIM)).toBe(true));
    h.step();
    return holds.activeFor(h.world, THIEF)!;
  }

  it('times balance.pickpocket.holdMs and completes', () => {
    const h = harness();
    const hold = startPocket(h);
    expect(hold.kind).toBe('pickpocket');
    expect(hold.endTick - hold.startTick).toBe(Math.round(b.pickpocket.holdMs / STEP_MS));
    expect(stepUntilEnd(h).result).toBe('complete');
    expect(thief(h).activity).toEqual({ k: 'free' });
  });

  it('cancels when the victim moves out of reach', () => {
    const h = harness();
    startPocket(h);
    h.step();
    h.world.characters.find((c) => c.id === VICTIM)!.x += b.pickpocket.reach + 0.1;
    expect(stepUntilEnd(h).result).toBe('cancelled');
  });

  it('cancels when the victim leaves the world', () => {
    const h = harness();
    startPocket(h);
    h.world.characters = h.world.characters.filter((c) => c.id !== VICTIM);
    expect(stepUntilEnd(h).result).toBe('cancelled');
  });

  it('the caught hook ends it as caught', () => {
    const h = harness();
    startPocket(h);
    h.step();
    h.world.events.length = 0;
    const hold = holds.caught(h.ctx, THIEF)!;
    expect(hold.result).toBe('caught');
    expect(h.world.events).toEqual([
      { ch: 'phone', player: 'p1', e: 'holdEnd', hold: hold.id, result: 'caught' },
    ]);
    expect(holds.caught(h.ctx, THIEF)).toBeNull();
  });
});

describe('catch grace and hot hands (SPEC §6.13)', () => {
  it('isMidSteal is true during the hold and for 300 ms after, false at 301 ms', () => {
    const h = harness();
    startGrab(h);
    const grace = h.ctx.ticks(b.catch.graceMs);
    expect(holds.isMidSteal(h.world, THIEF, grace)).toBe(true);
    h.input({ hold: false });
    const { tick: endedAt } = stepUntilEnd(h);
    const c = thief(h);
    expect(c.holdEndedAt).toBe(endedAt);
    // Ticks: 300 ms is exactly 18 steps.
    h.world.tick = endedAt + grace;
    expect(holds.isMidSteal(h.world, THIEF, grace)).toBe(true);
    h.world.tick = endedAt + grace + 1;
    expect(holds.isMidSteal(h.world, THIEF, grace)).toBe(false);
    // Milliseconds.
    const endMs = endedAt * STEP_MS;
    expect(midStealAt(c, false, endMs + 300, b.catch.graceMs)).toBe(true);
    expect(midStealAt(c, false, endMs + 301, b.catch.graceMs)).toBe(false);
    expect(midStealAt(c, true, endMs + 10_000, b.catch.graceMs)).toBe(true);
    expect(midStealAt({ holdEndedAt: -1 }, false, 0, b.catch.graceMs)).toBe(false);
  });

  it('an arm alone is not mid-steal and not hot', () => {
    const h = harness();
    h.stepThen(() => holds.armGrab(h.ctx, THIEF, STALL, COUNTER_SLOT, 600));
    expect(holds.isMidSteal(h.world, THIEF, 18)).toBe(false);
    expect(isHot(thief(h), h.world.tick)).toBe(false);
  });

  for (const outcome of ['complete', 'cancelled', 'caught'] as const) {
    it(`hot for 5 s after the start whatever the outcome (${outcome})`, () => {
      const h = harness();
      const hold = startGrab(h);
      if (outcome === 'caught') holds.caught(h.ctx, THIEF);
      else if (outcome === 'cancelled') h.input({ hold: false });
      for (let i = 0; i < 60; i++) h.step();
      const c: Character = thief(h);
      const hot = h.ctx.ticks(b.catch.hotMs);
      expect(holds.isHot(c, hold.startTick + hot)).toBe(true);
      expect(isHot(c, hold.startTick + hot + 1)).toBe(false);
      expect(isHot(c, hold.startTick)).toBe(true);
    });
  }

  it('a never-hot character is not hot', () => {
    expect(isHot(makeWorld().characters[0]!, 0)).toBe(false);
  });
});
