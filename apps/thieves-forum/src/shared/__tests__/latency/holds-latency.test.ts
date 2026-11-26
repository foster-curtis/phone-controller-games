// Holds under latency (SPEC §3, §12.9 "Latency tests", BUILD_PLAN TF3): a fake phone and the host hold
// machine joined by the seeded latency link both ways. The host times GRAB from the bit it observes;
// the phone's bar is an estimate that never shows full before `complete`.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../content';
import { createHoldEstimator, ESTIMATE_CAP } from '../../../controller/hold';
import { COUNTER_SLOT, harness, STALL, THIEF } from '../../../host/sim/holds/__tests__/fixtures';
import { holds } from '../../../host/sim/holds';
import { STEP_MS } from '../../../host/sim/types';
import type { HoldEvent, HoldResult } from '../../hold';
import { createFakePhone, createLink, type Link, type PhoneSend } from './link';

const SEEDS = 200;
const net = CONTENT.balance.net;

interface RunOpts {
  seed: number;
  pressAt: number;
  releaseAt: number;
  /** The tile's grab time, ms. */
  ms?: number;
  dropRate?: number;
}

interface Run {
  startTick?: number;
  endTick?: number;
  result?: HoldResult;
  /** Host receipt of the release (falling edge), ms. */
  releaseArrival?: number;
  /** Highest bar the phone drew before `complete` reached it. */
  maxBeforeComplete: number;
  /** Bar on the first frame after `complete` / `cancelled` reached the phone. */
  barAfterEnd?: number;
  /** Largest gap between the bar and its `holdStart` anchor after the correction. */
  anchorError: number;
  droppedDuringHold: number;
}

const upLink = (o: RunOpts) =>
  createLink<PhoneSend<'grab'>>({ seed: o.seed, dropRate: o.dropRate });

/** The phone's script: tap the tile (`grab` + bit), let go at `releaseAt`. */
function script(o: RunOpts, link: Link<PhoneSend<'grab'>>) {
  const phone = createFakePhone<'grab'>(link);
  return {
    phone,
    press: () => {
      phone.event('grab', o.pressAt);
      phone.setHold(true, o.pressAt);
    },
    release: () => phone.setHold(false, o.releaseAt),
  };
}

/** When the release reaches the host, by replaying the uplink alone (it is deterministic per seed). */
function releaseArrival(o: RunOpts): number {
  const link = upLink(o);
  const s = script(o, link);
  s.press();
  s.release();
  return fallingEdge(link)!;
}

function fallingEdge(link: Link<PhoneSend<'grab'>>): number | undefined {
  let held = false;
  for (const a of link.log) {
    if (a.payload.t !== 'input') continue;
    if (a.payload.hold) held = true;
    else if (held) return a.at;
  }
  return undefined;
}

function run(o: RunOpts): Run {
  const ms = o.ms ?? 600;
  const up = upLink(o);
  const down = createLink<HoldEvent>({ seed: o.seed + 1_000_000 });
  const s = script(o, up);
  const est = createHoldEstimator();
  const h = harness();
  const out: Run = { maxBeforeComplete: 0, anchorError: 0, droppedDuringHold: 0 };
  let last = { hold: false, x: 0, y: 0, at: -Infinity };
  let pressed = false;
  let released = false;
  let anchor: { at: number; dur: number } | null = null;
  let endedAt: number | null = null;
  let completeSeen = false;

  for (let k = 0; k < 3000; k++) {
    const T = k * STEP_MS;
    // Phone side, in time order: its own press / release, then host events that reached it.
    const due: { at: number; fn: () => void }[] = [];
    if (!pressed && o.pressAt <= T)
      due.push({
        at: o.pressAt,
        fn: () => {
          s.press();
          est.press(o.pressAt, ms);
          pressed = true;
        },
      });
    if (!released && o.releaseAt <= T)
      due.push({
        at: o.releaseAt,
        fn: () => {
          s.release();
          est.release(o.releaseAt);
          released = true;
        },
      });
    for (const a of down.take(T))
      due.push({
        at: a.at,
        fn: () => {
          est.correct(a.payload, a.at);
          if (a.payload.t === 'holdStart') anchor = { at: a.at, dur: a.payload.durationMs };
          else {
            endedAt = a.at;
            completeSeen ||= a.payload.result === 'complete';
          }
        },
      });
    due.sort((a, b) => a.at - b.at);
    for (const d of due) d.fn();
    s.phone.at(T);

    // The phone draws a frame.
    const bar = est.progress(T);
    if (!completeSeen) out.maxBeforeComplete = Math.max(out.maxBeforeComplete, bar);
    if (anchor && endedAt === null && !released) {
      const a: { at: number; dur: number } = anchor;
      const expected = Math.min(ESTIMATE_CAP, (T - a.at) / a.dur);
      out.anchorError = Math.max(out.anchorError, Math.abs(bar - expected));
    }
    if (endedAt !== null && out.barAfterEnd === undefined) out.barAfterEnd = bar;

    // Host side: receipts before this step, staleness (SPEC §12.5), one step of the machine.
    let arm = false;
    for (const a of up.take(T)) {
      if (a.payload.t === 'event') arm = true;
      else last = { ...a.payload, at: a.at };
    }
    const age = T - last.at;
    h.input({
      hold: last.hold && age <= net.holdStaleMs,
      move: age <= net.inputStaleMs ? { x: last.x, y: last.y } : { x: 0, y: 0 },
    });
    h.stepThen(() => {
      if (arm) holds.armGrab(h.ctx, THIEF, STALL, COUNTER_SLOT, ms);
    });
    for (const e of h.world.events) {
      if (e.ch !== 'phone') continue;
      if (e.e === 'holdStart') {
        const hold = h.world.holds.find((x) => x.id === e.hold)!;
        out.startTick = hold.startTick;
        out.endTick = hold.endTick;
        down.send(
          { t: 'holdStart', id: e.hold, kind: e.kind, durationMs: e.durationMs, elapsedMs: 0 },
          T,
        );
      } else if (e.e === 'holdEnd') {
        out.result = e.result;
        down.send({ t: 'holdEnd', id: e.hold, result: e.result }, T);
      }
    }
    if (out.barAfterEnd !== undefined && released) break;
  }
  out.releaseArrival = fallingEdge(up);
  // Samples the phone sent while held that never arrived.
  const heldSends = Math.floor(((o.releaseAt - o.pressAt) * 30) / 1000);
  const heldArrivals = up.log.filter(
    (a) => a.payload.t === 'input' && a.payload.hold && a.at > 0,
  ).length;
  out.droppedDuringHold = Math.max(0, heldSends + 1 - heldArrivals);
  return out;
}

/** A press phase per seed, so the press lands anywhere between host steps. */
const pressAtFor = (seed: number) => 1000 + ((seed * 7.31) % 50);

/**
 * Finds a phone release time whose host receipt is exactly `target` ms, by solving within each 30 Hz
 * sample interval (receipt = send + that message's drawn delay unless held back behind an earlier one).
 */
function releaseArrivingAt(o: Omit<RunOpts, 'releaseAt'>, target: number): number | null {
  const period = 1000 / 30;
  for (let i = 0; i < 200; i++) {
    const lo = o.pressAt + i * period + 0.01;
    const hi = o.pressAt + (i + 1) * period;
    if (lo > target) break;
    const d = releaseArrival({ ...o, releaseAt: lo }) - lo;
    const r = target - d;
    if (r < lo || r >= hi) continue;
    let arr = releaseArrival({ ...o, releaseAt: r });
    if (Math.abs(arr - target) > 1e-6) continue;
    // Float rounding: never land below the target.
    let rr = r;
    while (arr < target) arr = releaseArrival({ ...o, releaseAt: (rr += 1e-9) });
    return rr;
  }
  return null;
}

/**
 * A press time (from the seed's own) for which a release arriving exactly at the boundary exists: the
 * in-order link often holds a release back behind an earlier sample, so some press times can't land
 * one on an exact ms. Later press times shift both the step phase and which jitter draws the hold gets.
 */
function boundary(seed: number, offsetMs: number) {
  for (let shift = 0; shift < 60; shift++) {
    const base = { seed, pressAt: pressAtFor(seed) + shift * 41.3 };
    const long = run({ ...base, releaseAt: base.pressAt + 5000 });
    const target = long.endTick! * STEP_MS + offsetMs;
    const r = releaseArrivingAt(base, target);
    if (r !== null) return { ...base, releaseAt: r, target, endTick: long.endTick! };
  }
  return null;
}

describe('holds under latency (30–250 ms delay, ±80 ms jitter, 30 Hz samples, drops)', () => {
  it(`a release 1 ms early (as the host sees it) never completes (${SEEDS} seeds)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const b = boundary(seed, -1);
      expect(b, `seed ${seed}: no exact release`).not.toBeNull();
      const r = run(b!);
      expect(r.releaseArrival).toBeCloseTo(b!.target, 6);
      expect(r.endTick).toBe(b!.endTick);
      expect(r.result, `seed ${seed}`).toBe('cancelled');
    }
  });

  it(`a press held the grab time (as the host sees it) completes (${SEEDS} seeds)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const b = boundary(seed, 0);
      expect(b, `seed ${seed}: no exact release`).not.toBeNull();
      const r = run(b!);
      expect(r.releaseArrival! - b!.target).toBeGreaterThanOrEqual(0);
      expect(r.releaseArrival! - b!.target).toBeLessThan(1e-6);
      expect(r.result, `seed ${seed}`).toBe('complete');
    }
  });

  it('completes iff the host-observed hold reaches the grab time, across release times', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const pressAt = pressAtFor(seed);
      for (let dt = 300; dt <= 1000; dt += 7) {
        const r = run({ seed, pressAt, releaseAt: pressAt + dt });
        if (r.endTick === undefined) continue; // released before the host ever saw the press
        expect(r.result).toBe(r.releaseArrival! >= r.endTick * STEP_MS ? 'complete' : 'cancelled');
      }
    }
  });

  it(`dropped samples don't cancel (${SEEDS} seeds, 30% drop rate)`, () => {
    let drops = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const pressAt = pressAtFor(seed);
      const r = run({ seed, pressAt, releaseAt: pressAt + 3000, ms: 2000, dropRate: 0.3 });
      drops += r.droppedDuringHold;
      expect(r.result, `seed ${seed}`).toBe('complete');
    }
    expect(drops).toBeGreaterThan(SEEDS * 5);
  });

  it(`the phone bar never shows 100% before complete and corrects within one event (${SEEDS} seeds)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const pressAt = pressAtFor(seed);
      const r = run({ seed, pressAt, releaseAt: pressAt + 2500 });
      expect(r.result).toBe('complete');
      expect(r.maxBeforeComplete).toBeLessThanOrEqual(ESTIMATE_CAP);
      expect(r.barAfterEnd).toBe(1);
      // After the one holdStart, the bar follows its anchor to within a frame.
      expect(r.anchorError).toBeLessThanOrEqual(STEP_MS / 600);
    }
  });

  it(`an early release snaps the bar to 0 on the host's cancel (${SEEDS} seeds)`, () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const pressAt = pressAtFor(seed);
      const r = run({ seed, pressAt, releaseAt: pressAt + 300 });
      if (r.result === undefined) continue;
      expect(r.result).toBe('cancelled');
      expect(r.maxBeforeComplete).toBeLessThanOrEqual(ESTIMATE_CAP);
      expect(r.barAfterEnd).toBe(0);
    }
  });
});
