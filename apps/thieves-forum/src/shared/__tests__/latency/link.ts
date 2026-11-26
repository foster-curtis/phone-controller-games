// Latency simulator for hold tests (SPEC §12.9 "Latency tests", BUILD_PLAN TF3): a seeded one-way link
// with a base delay of 30–250 ms, ±80 ms jitter per message and occasional dropped samples, plus a fake
// phone that sends the input state at 30 Hz while a control is touched, 5 Hz idle, and on every bit
// change (SPEC §12.5). The relay is a WebSocket (TCP), so the link is in order: a message never
// overtakes an earlier one, and only repeated input samples are ever dropped, never a bit change or a
// discrete event (BUILD_PLAN §8 [TF3]). Test helper only: shipped code never imports it.
import { rngStream } from '@pcg/game-kit';

export interface LinkOptions {
  seed: number;
  /** Base one-way delay range, ms; one value is drawn per link. */
  delayMs?: readonly [number, number];
  /** Per-message jitter, ±ms. */
  jitterMs?: number;
  /** Chance a droppable message is lost. */
  dropRate?: number;
}

export interface Arrival<T> {
  payload: T;
  /** Host receipt time, ms. */
  at: number;
}

export interface Link<T> {
  /** The base delay drawn for this link. */
  readonly baseMs: number;
  /** Sends at time `at` (non-decreasing across calls). Returns the arrival time, or null if dropped. */
  send(payload: T, at: number, droppable?: boolean): number | null;
  /** Everything that arrived strictly before `t` and wasn't taken yet, in order. */
  take(before: number): Arrival<T>[];
  /** Every arrival so far (taken or not). */
  readonly log: readonly Arrival<T>[];
}

export function createLink<T>(opts: LinkOptions): Link<T> {
  const rng = rngStream(opts.seed, 'latency');
  const [lo, hi] = opts.delayMs ?? [30, 250];
  const jitter = opts.jitterMs ?? 80;
  const dropRate = opts.dropRate ?? 0.05;
  const baseMs = rng.int(lo, hi);
  const log: Arrival<T>[] = [];
  let taken = 0;
  let last = -Infinity;
  let lastSent = -Infinity;
  return {
    baseMs,
    log,
    send(payload, at, droppable = false) {
      if (at < lastSent) throw new Error('link: sends must be in time order');
      lastSent = at;
      const lost = rng.next() < dropRate;
      const delay = Math.max(0, baseMs + rng.int(-jitter, jitter));
      if (droppable && lost) return null;
      const arrival = Math.max(last, at + delay); // in order (TCP)
      last = arrival;
      log.push({ payload, at: arrival });
      return arrival;
    },
    take(before) {
      const out: Arrival<T>[] = [];
      while (taken < log.length && log[taken]!.at < before) out.push(log[taken++]!);
      return out;
    },
  };
}

/** What the fake phone sends: the input state or a discrete event. */
export type PhoneSend<E = never> =
  { t: 'input'; hold: boolean; x: number; y: number } | { t: 'event'; event: E };

/** Phone input cadence (SPEC §12.5). */
export const ACTIVE_HZ = 30;
export const IDLE_HZ = 5;

/**
 * A fake phone input sender over a link: call `at(t)` with non-decreasing times to emit the samples
 * due by then, `setHold` / `setStick` on a change (sent at once), `event` for a discrete event.
 */
export interface FakePhone<E> {
  setHold(hold: boolean, t: number): void;
  setStick(x: number, y: number, t: number): void;
  event(e: E, t: number): void;
  /** Sends the periodic samples due up to and including `t`. */
  at(t: number): void;
}

export function createFakePhone<E = never>(link: Link<PhoneSend<E>>): FakePhone<E> {
  let hold = false;
  let x = 0;
  let y = 0;
  let next = 0;
  const period = () => 1000 / (hold || x !== 0 || y !== 0 ? ACTIVE_HZ : IDLE_HZ);
  const sample = (t: number, droppable: boolean) => {
    link.send({ t: 'input', hold, x, y }, t, droppable);
    next = t + period();
  };
  const phone: FakePhone<E> = {
    at(t) {
      while (next <= t) sample(next, true);
    },
    setHold(h, t) {
      phone.at(t);
      hold = h;
      sample(t, false);
    },
    setStick(sx, sy, t) {
      phone.at(t);
      x = sx;
      y = sy;
      sample(t, false);
    },
    event(e, t) {
      phone.at(t);
      link.send({ t: 'event', event: e }, t, false);
    },
  };
  return phone;
}
