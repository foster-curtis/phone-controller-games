// Tap button (Fort Frenzy SPEC §10.1, §15.7): holding does nothing; it fires once on release. A
// cancelled pointer (the browser took it) fires nothing.
import type { GestureInput, GestureMachine, GestureResult } from './types';

export interface TapState {
  pressed: boolean;
}

export type TapOutput = { kind: 'tap' };

export function tapStep(state: TapState, input: GestureInput): GestureResult<TapState, TapOutput> {
  switch (input.type) {
    case 'down':
      return { state: { pressed: true }, out: [] };
    case 'up':
      return { state: { pressed: false }, out: state.pressed ? [{ kind: 'tap' }] : [] };
    case 'cancel':
      return { state: { pressed: false }, out: [] };
    default:
      return { state, out: [] };
  }
}

export function tapGesture(): GestureMachine<TapState, TapOutput> {
  return { initial: () => ({ pressed: false }), step: tapStep, deadline: () => null };
}
