// The phone's input state (SPEC §3, §12.5): stick vector plus the `hold` and `catch` bits, sent through
// the kit's fixed-rate sender (30 Hz while touched, 5 Hz idle, so a held-still thumb never goes stale
// under the host's rules). Phones send state only, never discrete commands for holds.
// Never imports host code.
import { createInputSender, type InputSender } from '@pcg/controller-kit';
import { BIT_CATCH, BIT_HOLD, CATCH_MIN_MS, type PhoneMsg } from '../shared/messages';

type Slot = 'x' | 'y' | 'bits';

export interface Controls {
  stick(x: number, y: number): void;
  touchStick(on: boolean): void;
  /** The `hold` bit (GRAB tile or PICKPOCKET). */
  hold(down: boolean): void;
  /** The `catch` bit, kept up at least CATCH_MIN_MS so a tap spans a host sample. */
  catchBit(down: boolean): void;
  /** Ignore the stick and release holds (tip-off open: the character stands still). */
  freeze(on: boolean): void;
  /** Start sending on entering the play screen; stop (after a neutral send) on leaving it. */
  setActive(on: boolean): void;
  /** Current stick, for the toss aim. */
  aim(): [number, number];
  tuple(): number[];
}

export function createControls(send: (m: PhoneMsg) => void, now: () => number): Controls {
  const sender: InputSender<Slot> = createInputSender<Slot>(
    {
      layout: ['x', 'y', 'bits'],
      analog: ['x', 'y'],
      buttons: { slot: 'bits' },
      mode: { kind: 'fixedRate' },
    },
    ([x, y, bits]) => send({ t: 'input', x: x!, y: y!, bits: bits! }),
  );
  let frozen = false;
  let catchAt = 0;
  let catchTimer: ReturnType<typeof setTimeout> | null = null;

  const releaseCatch = () => {
    catchTimer = null;
    sender.setButton(BIT_CATCH, false);
    sender.touch('catch', false);
  };

  return {
    stick(x, y) {
      if (!frozen) sender.update({ x, y });
    },
    touchStick: (on) => sender.touch('stick', on && !frozen),
    hold(down) {
      sender.setButton(BIT_HOLD, down);
      sender.touch('hold', down);
    },
    catchBit(down) {
      if (down) {
        if (catchTimer !== null) clearTimeout(catchTimer);
        catchTimer = null;
        catchAt = now();
        sender.setButton(BIT_CATCH, true);
        sender.touch('catch', true);
        return;
      }
      const wait = CATCH_MIN_MS - (now() - catchAt);
      if (wait <= 0) releaseCatch();
      else if (catchTimer === null) catchTimer = setTimeout(releaseCatch, wait);
    },
    freeze(on) {
      frozen = on;
      if (on) {
        sender.neutral();
      }
    },
    setActive(on) {
      if (on && !sender.running) sender.start();
      else if (!on && sender.running) {
        sender.neutral();
        sender.stop();
      }
    },
    aim: () => [sender.get('x'), sender.get('y')],
    tuple: () => sender.tuple(),
  };
}
