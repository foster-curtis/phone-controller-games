// Keyframe timeline helpers for How to play illustration scripts (SPEC §6.9). Pure functions of
// loop time, no Phaser import, so a script's `draw(tMs)` stays deterministic and testable in node.

/** Easing: maps progress 0..1 to eased progress (back-out may overshoot 1). */
export type Ease = (p: number) => number;
export interface Point {
  x: number;
  y: number;
}
/** `[timeMs, value]` or `[timeMs, value, ease]`. The ease shapes the segment that ENDS at this key. */
export type Keyframe<T> = readonly [number, T] | readonly [number, T, Ease];

export const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);

export const linear: Ease = (p) => p;
export const easeInQuad: Ease = (p) => p * p;
export const easeOutQuad: Ease = (p) => 1 - (1 - p) * (1 - p);
export const easeInOutQuad: Ease = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
export const easeInCubic: Ease = (p) => p * p * p;
export const easeOutCubic: Ease = (p) => 1 - (1 - p) ** 3;
export const easeInOutCubic: Ease = (p) =>
  p < 0.5 ? 4 * p * p * p : 1 - 4 * (1 - p) * (1 - p) * (1 - p);
/** Overshoots past 1 then settles: good for pops. */
export const backOut: Ease = (p) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};

/** Progress of `t` through [start, end], clamped to 0..1. */
export function phase(t: number, start: number, end: number): number {
  return end <= start ? (t >= end ? 1 : 0) : clamp01((t - start) / (end - start));
}

/** 0 → 1 → 0 triangle over [start, end] (0 outside it), eased by `ease` on each half. */
export function pulse(t: number, start: number, end: number, ease: Ease = linear): number {
  const p = phase(t, start, end);
  return ease(p < 0.5 ? p * 2 : (1 - p) * 2);
}

/** Wraps elapsed time into 0 ≤ t < loopMs. */
export function loopTime(elapsedMs: number, loopMs: number): number {
  return ((elapsedMs % loopMs) + loopMs) % loopMs;
}

const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

/**
 * Builds `(t) => value` from keyframes sorted by time. Values are numbers or {x,y} points; the
 * result is clamped to the first value before the first key and the last value after the last.
 */
export function track(frames: readonly Keyframe<number>[]): (t: number) => number;
export function track(frames: readonly Keyframe<Point>[]): (t: number) => Point;
export function track(frames: readonly Keyframe<number | Point>[]): (t: number) => number | Point {
  if (frames.length === 0) throw new Error('track needs at least one keyframe');
  return (t) => {
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    if (t <= first[0]) return first[1];
    if (t >= last[0]) return last[1];
    let i = 1;
    while (frames[i]![0] < t) i++;
    const a = frames[i - 1]!;
    const b = frames[i]!;
    const p = (b[2] ?? linear)(phase(t, a[0], b[0]));
    const av = a[1];
    const bv = b[1];
    if (typeof av === 'number' && typeof bv === 'number') return lerp(av, bv, p);
    const ap = av as Point;
    const bp = bv as Point;
    return { x: lerp(ap.x, bp.x, p), y: lerp(ap.y, bp.y, p) };
  };
}

/**
 * Discrete step: the value of the last `[startMs, value]` entry at or before `t` (the first entry's
 * value before it starts). E.g. `stepAt(t, [[0, '3'], [800, '2'], [1600, '1']])` for a countdown.
 */
export function stepAt<T>(t: number, steps: readonly (readonly [number, T])[]): T {
  let v = steps[0]![1];
  for (const [at, value] of steps) {
    if (t >= at) v = value;
    else break;
  }
  return v;
}

/** Countdown digit for `t`: `from` at `startMs`, one lower each `stepMs`, `null` before or after. */
export function countdownDigit(
  t: number,
  startMs: number,
  stepMs: number,
  from: number,
): number | null {
  if (t < startMs) return null;
  const n = from - Math.floor((t - startMs) / stepMs);
  return n >= 1 ? n : null;
}
