// Input sender (SPEC §7.2): stick on change capped at 30 Hz, button edges immediately, 5 Hz keepalive.
import { BUTTON_DASH, BUTTON_SLAM, type InputTuple } from '../../shared/messages';

export const STICK_MIN_GAP_MS = 34; // ≤ 30 Hz
export const KEEPALIVE_MS = 200; // 5 Hz

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
  let x = 0;
  let y = 0;
  let buttons = 0;
  let dash = 0;
  let slam = 0;
  let running = false;
  let last = -Infinity;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const tuple = (): InputTuple => [x, y, buttons, dash, slam];
  const flush = () => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
    last = Date.now();
    send(tuple());
  };

  return {
    setStick(nx, ny) {
      if (nx === x && ny === y) return;
      x = nx;
      y = ny;
      if (!running) return;
      const wait = STICK_MIN_GAP_MS - (Date.now() - last);
      if (wait <= 0) flush();
      else if (pending === null) pending = setTimeout(flush, wait);
    },
    setButton(bit, down) {
      if (!!(buttons & bit) === down) return;
      if (down) {
        buttons |= bit;
        if (bit === BUTTON_DASH) dash++;
        if (bit === BUTTON_SLAM) slam++;
      } else {
        buttons &= ~bit;
      }
      if (running) flush();
    },
    neutral() {
      x = y = buttons = 0;
      if (running) flush();
    },
    start() {
      if (running) return;
      running = true;
      flush();
      keepalive = setInterval(() => {
        if (Date.now() - last >= KEEPALIVE_MS) flush();
      }, KEEPALIVE_MS);
    },
    stop() {
      running = false;
      if (pending !== null) clearTimeout(pending);
      if (keepalive !== null) clearInterval(keepalive);
      pending = keepalive = null;
    },
    tuple,
  };
}
