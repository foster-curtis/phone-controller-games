// Home screen navigation (SPEC §11.1: keyboard or gamepad, no hover-only). Pure: key events and a
// polled gamepad turn into `NavKey`s, `stepHome` turns a `NavKey` into a focus move or an intent.
// The host owns `TvView.home.focus`; the overlay only reports intents.
import type { HomeRow } from './types';

export type NavKey = 'up' | 'down' | 'left' | 'right' | 'select';

export type HomeIntent =
  | { type: 'focus'; index: number }
  | { type: 'cycle'; row: 'theme' | 'difficulty'; dir: -1 | 1 }
  | { type: 'activate'; row: 'resume' | 'newRun' | 'create' };

const KEYS: Record<string, NavKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  Enter: 'select',
  ' ': 'select',
};

export const keyToNav = (key: string): NavKey | null => KEYS[key] ?? null;

/** Focus wraps; ◂ ▸ only act on the theme and difficulty rows; select acts on the rest. */
export function stepHome(rows: readonly HomeRow[], focus: number, nav: NavKey): HomeIntent | null {
  const n = rows.length;
  if (n === 0) return null;
  const at = Math.min(Math.max(focus, 0), n - 1);
  if (nav === 'up' || nav === 'down') {
    return { type: 'focus', index: (at + (nav === 'up' ? n - 1 : 1)) % n };
  }
  const row = rows[at]!;
  if (nav === 'left' || nav === 'right') {
    if (row.id !== 'theme' && row.id !== 'difficulty') return null;
    return { type: 'cycle', row: row.id, dir: nav === 'left' ? -1 : 1 };
  }
  // select on a ◂ ▸ row cycles forward, so Enter or A works without the d-pad too
  if (row.id === 'theme' || row.id === 'difficulty') return { type: 'cycle', row: row.id, dir: 1 };
  return { type: 'activate', row: row.id };
}

// ---- Gamepad API ---------------------------------------------------------------------------------

/** The slice of a `Gamepad` we read (standard mapping: d-pad 12–15, A = 0). */
export interface PadLike {
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}

const AXIS_ON = 0.6;

/** Which nav directions a pad holds right now. */
export function padHeld(pad: PadLike | null | undefined): Set<NavKey> {
  const held = new Set<NavKey>();
  if (!pad) return held;
  const b = (i: number) => pad.buttons[i]?.pressed === true;
  const x = pad.axes[0] ?? 0;
  const y = pad.axes[1] ?? 0;
  if (b(12) || y < -AXIS_ON) held.add('up');
  if (b(13) || y > AXIS_ON) held.add('down');
  if (b(14) || x < -AXIS_ON) held.add('left');
  if (b(15) || x > AXIS_ON) held.add('right');
  if (b(0)) held.add('select');
  return held;
}

/** Edge detector: returns the presses that are new since the last call (a held button doesn't repeat). */
export function createPadNav(): (pads: readonly (PadLike | null | undefined)[]) => NavKey[] {
  let prev = new Set<NavKey>();
  return (pads) => {
    const held = new Set<NavKey>();
    for (const p of pads) for (const k of padHeld(p)) held.add(k);
    const fresh = [...held].filter((k) => !prev.has(k));
    prev = held;
    return fresh;
  };
}
