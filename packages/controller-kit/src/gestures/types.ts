// Gesture state machines (Fort Frenzy SPEC §15.7): pure reducers over timed pointer inputs, unit-tested
// without a DOM. `bindGesture` (./bind) feeds them pointer events and timer ticks.

/** One pointer's input, relative to where it went down (px, y grows downward). `t` is ms. */
export type GestureInput =
  | { type: 'down'; t: number }
  | { type: 'move'; t: number; dx: number; dy: number }
  | { type: 'up'; t: number; dx?: number; dy?: number }
  | { type: 'cancel'; t: number }
  | { type: 'tick'; t: number };

export interface GestureResult<S, O> {
  state: S;
  /** Outputs this input produced, in order (often none). */
  out: O[];
}

export interface GestureMachine<S, O> {
  initial(): S;
  step(state: S, input: GestureInput): GestureResult<S, O>;
  /** The time a `tick` is next due (hold timers, repeats), or null. */
  deadline(state: S): number | null;
}
