// Radial-drag button (Fort Frenzy SPEC §15.7, §10.1 build arc):
// - a tap within `tapMs` (inside the dead zone) → `tap` (the button's normal action);
// - held `openMs` or dragged out of the dead zone → `open` (radial flag; the slot follows the drag
//   direction among enabled slots, with `hysteresisPx` between slots);
// - released on a slot → `commit`; released in the dead zone → `cancel`;
// - held on the repeat slot (Give) → a `commit` every `repeatMs`; releasing after repeats only `end`s;
// - with a single slot (Give only) the radial never opens: holding `openMs` commits it directly and
//   repeats every `repeatMs` until release (`end`).
// A release after `tapMs` that neither opened nor committed cancels.
import type { GestureInput, GestureMachine, GestureResult } from './types';

/** Slot indices: the input tuple's `radialSlot` (−1 none). */
export const SLOT_NONE = -1;
export const SLOT_LEFT = 0;
export const SLOT_UP = 1;
export const SLOT_RIGHT = 2;
export const SLOT_DOWN = 3;

/** Unit direction per slot, screen coordinates (y down). */
const DIRS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
];

export interface RadialConfig {
  /** Per slot (left, up, right, down): true enabled, false shown but dimmed, null absent. */
  slots: readonly (boolean | null)[];
  tapMs: number;
  openMs: number;
  deadZonePx: number;
  hysteresisPx: number;
  repeatMs: number;
  /** The slot that repeats while held (Give, down). */
  repeatSlot: number;
}

export const RADIAL_DEFAULTS: Omit<RadialConfig, 'slots'> = {
  tapMs: 150,
  openMs: 400,
  deadZonePx: 0.12 * 70,
  hysteresisPx: 8,
  repeatMs: 300,
  repeatSlot: SLOT_DOWN,
};

export interface RadialState {
  phase: 'idle' | 'pending' | 'open' | 'held';
  downAt: number;
  x: number;
  y: number;
  /** Selected slot, or SLOT_NONE (in the dead zone). */
  slot: number;
  /** When the next repeat commit is due, or null. */
  repeatAt: number | null;
  /** Repeat commits since the current slot was entered (or since `held` began). */
  repeats: number;
}

export type RadialOutput =
  | { kind: 'tap' }
  | { kind: 'open' }
  | { kind: 'commit'; slot: number; repeat: boolean }
  | { kind: 'cancel' }
  | { kind: 'end' };

const IDLE: RadialState = {
  phase: 'idle',
  downAt: 0,
  x: 0,
  y: 0,
  slot: SLOT_NONE,
  repeatAt: null,
  repeats: 0,
};

/** The only present slot's index when exactly one slot exists, else SLOT_NONE. */
export function singleSlot(slots: readonly (boolean | null)[]): number {
  const present = slots.flatMap((s, i) => (s === null || s === undefined ? [] : [i]));
  return present.length === 1 ? present[0]! : SLOT_NONE;
}

/** The slot for a drag of (x, y), keeping `prev` unless another slot leads by `hysteresisPx`. */
export function pickSlot(x: number, y: number, prev: number, cfg: RadialConfig): number {
  if (Math.hypot(x, y) <= cfg.deadZonePx) return SLOT_NONE;
  const proj = (i: number) => x * DIRS[i]![0] + y * DIRS[i]![1];
  let best = SLOT_NONE;
  for (let i = 0; i < DIRS.length; i++) {
    if (cfg.slots[i] !== true) continue;
    if (best === SLOT_NONE || proj(i) > proj(best)) best = i;
  }
  if (best === SLOT_NONE) return SLOT_NONE;
  if (prev !== SLOT_NONE && prev !== best && cfg.slots[prev] === true) {
    if (proj(best) - proj(prev) < cfg.hysteresisPx) return prev;
  }
  return best;
}

export function radialStep(
  state: RadialState,
  input: GestureInput,
  cfg: RadialConfig,
): GestureResult<RadialState, RadialOutput> {
  const out: RadialOutput[] = [];
  if (input.type === 'down') {
    if (state.phase !== 'idle') return { state, out };
    return { state: { ...IDLE, phase: 'pending', downAt: input.t }, out };
  }
  if (state.phase === 'idle') return { state, out };

  let s = advance(state, input.t, cfg, out);
  const single = singleSlot(cfg.slots);

  const moveTo = (dx: number, dy: number, t: number) => {
    s = { ...s, x: dx, y: dy };
    if (s.phase === 'pending' && single === SLOT_NONE && Math.hypot(dx, dy) > cfg.deadZonePx) {
      s = { ...s, phase: 'open' };
      out.push({ kind: 'open' });
      s = select(s, pickSlot(dx, dy, SLOT_NONE, cfg), t, cfg);
    } else if (s.phase === 'open') {
      s = select(s, pickSlot(dx, dy, s.slot, cfg), t, cfg);
    }
  };

  switch (input.type) {
    case 'tick':
      return { state: s, out };
    case 'move':
      moveTo(input.dx, input.dy, input.t);
      return { state: s, out };
    case 'cancel':
      out.push(s.phase === 'held' ? { kind: 'end' } : { kind: 'cancel' });
      return { state: IDLE, out };
    case 'up': {
      if (input.dx !== undefined && input.dy !== undefined) moveTo(input.dx, input.dy, input.t);
      if (s.phase === 'pending') {
        const tap = input.t - s.downAt <= cfg.tapMs && Math.hypot(s.x, s.y) <= cfg.deadZonePx;
        out.push(tap ? { kind: 'tap' } : { kind: 'cancel' });
      } else if (s.phase === 'held') {
        out.push({ kind: 'end' });
      } else if (s.slot === SLOT_NONE || cfg.slots[s.slot] !== true) {
        out.push({ kind: 'cancel' });
      } else if (s.slot === cfg.repeatSlot && s.repeats > 0) {
        out.push({ kind: 'end' });
      } else {
        out.push({ kind: 'commit', slot: s.slot, repeat: false });
      }
      return { state: IDLE, out };
    }
  }
}

/** Selects `slot`, (re)starting the repeat timer when it is the repeat slot. */
function select(s: RadialState, slot: number, t: number, cfg: RadialConfig): RadialState {
  if (slot === s.slot) return s;
  return {
    ...s,
    slot,
    repeats: 0,
    repeatAt: slot === cfg.repeatSlot && slot !== SLOT_NONE ? t + cfg.repeatMs : null,
  };
}

/** Applies everything due by `t`: the hold opening (or single-slot commit) and repeat commits. */
function advance(
  state: RadialState,
  t: number,
  cfg: RadialConfig,
  out: RadialOutput[],
): RadialState {
  let s = state;
  if (s.phase === 'pending' && t >= s.downAt + cfg.openMs) {
    const at = s.downAt + cfg.openMs;
    const single = singleSlot(cfg.slots);
    if (single === SLOT_NONE) {
      s = { ...s, phase: 'open' };
      out.push({ kind: 'open' });
      s = select(s, pickSlot(s.x, s.y, SLOT_NONE, cfg), at, cfg);
    } else if (cfg.slots[single] === true) {
      s = { ...s, phase: 'held', slot: single, repeats: 0, repeatAt: at + cfg.repeatMs };
      out.push({ kind: 'commit', slot: single, repeat: false });
    }
  }
  const repeating = s.phase === 'held' || (s.phase === 'open' && s.slot === cfg.repeatSlot);
  while (repeating && s.repeatAt !== null && t >= s.repeatAt) {
    out.push({ kind: 'commit', slot: s.slot, repeat: true });
    s = { ...s, repeats: s.repeats + 1, repeatAt: s.repeatAt + cfg.repeatMs };
  }
  return s;
}

/** Next due tick: the hold opening, or the next repeat. */
export function radialDeadline(state: RadialState, cfg: RadialConfig): number | null {
  if (state.phase === 'pending') {
    const single = singleSlot(cfg.slots);
    if (single !== SLOT_NONE && cfg.slots[single] !== true) return null;
    return state.downAt + cfg.openMs;
  }
  if (state.phase === 'held' || (state.phase === 'open' && state.slot === cfg.repeatSlot)) {
    return state.repeatAt;
  }
  return null;
}

/** True while the TV should draw the arc (the tuple's radial-open flag). */
export function isRadialOpen(state: RadialState): boolean {
  return state.phase === 'open';
}

/**
 * A radial machine. `config` may be a function so the slots can follow host updates (MeView.arc)
 * without rebuilding the binding.
 */
export function radialGesture(
  config: (Partial<RadialConfig> & Pick<RadialConfig, 'slots'>) | (() => RadialConfig),
): GestureMachine<RadialState, RadialOutput> {
  const cfg = (): RadialConfig =>
    typeof config === 'function' ? config() : { ...RADIAL_DEFAULTS, ...config };
  return {
    initial: () => IDLE,
    step: (s, i) => radialStep(s, i, cfg()),
    deadline: (s) => radialDeadline(s, cfg()),
  };
}
