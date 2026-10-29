// Input sender (SPEC §7.2): Sunny Side's tuple on the kit's schema sender in `onChange` mode: stick on
// change capped at 30 Hz, button edges immediately, 5 Hz keepalive.
import { createInputSender as createSchemaSender, type InputSchema } from '@pcg/controller-kit';
import { BUTTON_DASH, BUTTON_SLAM, type InputTuple } from '../../shared/messages';

type Slot = 'x' | 'y' | 'buttons' | 'dash' | 'slam';

export const INPUT_SCHEMA: InputSchema<Slot> = {
  layout: ['x', 'y', 'buttons', 'dash', 'slam'],
  analog: ['x', 'y'],
  counters: ['dash', 'slam'],
  buttons: { slot: 'buttons', presses: { [BUTTON_DASH]: 'dash', [BUTTON_SLAM]: 'slam' } },
  mode: { kind: 'onChange' },
};

export interface InputSender {
  setStick(x: number, y: number): void;
  setButton(bit: number, down: boolean): void;
  /** Zero stick and buttons (counters keep their values) and send once if running. */
  neutral(): void;
  /** Starts sending (immediately sends the current tuple). */
  start(): void;
  stop(): void;
  tuple(): InputTuple;
}

export function createInputSender(send: (t: InputTuple) => void): InputSender {
  const s = createSchemaSender(INPUT_SCHEMA, (t) => send(t as InputTuple));
  return {
    setStick: (x, y) => s.update({ x, y }),
    setButton: (bit, down) => s.setButton(bit, down),
    neutral: () => s.neutral(),
    start: () => s.start(),
    stop: () => s.stop(),
    tuple: () => s.tuple() as InputTuple,
  };
}
