// Aimed button (Fort Frenzy SPEC §15.7, §10.1): down → `pending`; released within `tapMs` inside the
// dead zone → `tap` (fire, aim 0,0 = auto-aim); dragged out of the dead zone → `aiming` (the TV draws
// the aim line), the vector clamped to `maxPx`; released outside the dead zone → `fire` with the aim;
// released inside it after aiming → `cancel`. A hold past `tapMs` that never left the dead zone is
// not a tap either: it cancels.
import type { GestureInput, GestureMachine, GestureResult } from './types';

export interface AimedConfig {
  /** Longest press that still counts as a tap, ms (150). */
  tapMs: number;
  /** Maximum drag radius, px (70). */
  maxPx: number;
  /** Dead zone radius, px (default 12% of `maxPx`, the stick's rule). */
  deadZonePx: number;
}

export const AIMED_DEFAULTS: AimedConfig = { tapMs: 150, maxPx: 70, deadZonePx: 0.12 * 70 };

export interface AimedState {
  phase: 'idle' | 'pending' | 'aiming';
  downAt: number;
  /** Aim vector, px, clamped to `maxPx`. */
  x: number;
  y: number;
}

export type AimedOutput =
  { kind: 'tap' } | { kind: 'fire'; x: number; y: number } | { kind: 'cancel' };

const IDLE: AimedState = { phase: 'idle', downAt: 0, x: 0, y: 0 };

function clampTo(dx: number, dy: number, max: number): [number, number] {
  const d = Math.hypot(dx, dy);
  const k = d > max ? max / d : 1;
  return [dx * k, dy * k];
}

export function aimedStep(
  state: AimedState,
  input: GestureInput,
  cfg: AimedConfig = AIMED_DEFAULTS,
): GestureResult<AimedState, AimedOutput> {
  const none = (s: AimedState) => ({ state: s, out: [] as AimedOutput[] });
  const done = (o: AimedOutput) => ({ state: IDLE, out: [o] });
  const at = (s: AimedState, dx: number, dy: number): AimedState => {
    const [x, y] = clampTo(dx, dy, cfg.maxPx);
    const out = Math.hypot(x, y) > cfg.deadZonePx;
    return { ...s, x, y, phase: s.phase === 'pending' && out ? 'aiming' : s.phase };
  };
  if (input.type === 'down') {
    return state.phase === 'idle'
      ? none({ phase: 'pending', downAt: input.t, x: 0, y: 0 })
      : none(state);
  }
  if (state.phase === 'idle') return none(state);
  switch (input.type) {
    case 'move':
      return none(at(state, input.dx, input.dy));
    case 'tick':
      return none(state);
    case 'cancel':
      return done({ kind: 'cancel' });
    case 'up': {
      const s =
        input.dx !== undefined && input.dy !== undefined ? at(state, input.dx, input.dy) : state;
      const outside = Math.hypot(s.x, s.y) > cfg.deadZonePx;
      if (s.phase === 'pending') {
        return done(input.t - s.downAt <= cfg.tapMs ? { kind: 'tap' } : { kind: 'cancel' });
      }
      return done(outside ? { kind: 'fire', x: s.x, y: s.y } : { kind: 'cancel' });
    }
  }
}

/** True while the TV should draw the aim line (the tuple's aiming flag). */
export function isAiming(state: AimedState): boolean {
  return state.phase === 'aiming';
}

/** px aim vector → ints −scale..scale for the input tuple (`|| 0` normalizes -0). */
export function aimToStick(x: number, y: number, maxPx: number, scale = 100): [number, number] {
  return [Math.round((x / maxPx) * scale) || 0, Math.round((y / maxPx) * scale) || 0];
}

export function aimedGesture(cfg: Partial<AimedConfig> = {}): GestureMachine<
  AimedState,
  AimedOutput
> & {
  readonly config: AimedConfig;
} {
  const maxPx = cfg.maxPx ?? AIMED_DEFAULTS.maxPx;
  const config: AimedConfig = {
    tapMs: cfg.tapMs ?? AIMED_DEFAULTS.tapMs,
    maxPx,
    deadZonePx: cfg.deadZonePx ?? 0.12 * maxPx,
  };
  return {
    config,
    initial: () => IDLE,
    step: (s, i) => aimedStep(s, i, config),
    deadline: () => null,
  };
}
