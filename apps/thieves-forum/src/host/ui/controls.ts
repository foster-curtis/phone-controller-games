// Host controls (SPEC §6.16): keyboard and gamepad drive the TV with no hover. Enter / Space / → / A /
// Start confirm (lobby: Start, podium: Play again), H / ? / Y open How to play from the lobby. The How
// to play cards run their own keys through the kit's shell (rules/host.ts), so this stays off there.
// The leader's phone reaches the same `TvControl`s through the match layer.
import type { TvControl, TvScreen } from './types';

export interface ControlsEnv {
  document: Document;
  getGamepads(): readonly (Gamepad | null)[];
  requestAnimationFrame(cb: (t: number) => void): number;
  cancelAnimationFrame(id: number): void;
}

export interface Controls {
  destroy(): void;
}

const EDITABLE = 'input,textarea,select,[contenteditable]';

export function createControls(
  phase: () => TvScreen,
  canStart: () => boolean,
  emit: (c: TvControl) => void,
  env: Partial<ControlsEnv> = {},
): Controls {
  const doc = env.document ?? document;
  const pads =
    env.getGamepads ??
    (() =>
      typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()) : []);
  const raf = env.requestAnimationFrame ?? ((cb) => requestAnimationFrame(cb));
  const caf = env.cancelAnimationFrame ?? ((id) => cancelAnimationFrame(id));

  const confirm = (): void => {
    const p = phase();
    if (p === 'lobby' && canStart()) emit('start');
    else if (p === 'podium') emit('playAgain');
  };
  const help = (): void => {
    if (phase() === 'lobby') emit('rules');
  };

  const onKey = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (k.repeat || k.ctrlKey || k.metaKey || k.altKey) return;
    const t = k.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest(EDITABLE)) return;
    if (k.key === 'Enter' || k.key === ' ' || k.key === 'ArrowRight') confirm();
    else if (k.key === 'h' || k.key === 'H' || k.key === '?') help();
    else return;
    k.preventDefault();
  };
  doc.addEventListener('keydown', onKey);

  let id: number | null = null;
  let stopped = false;
  const down = new Set<number>();
  const poll = (): void => {
    id = null;
    if (stopped) return;
    const pressed = new Set<number>();
    for (const pad of pads()) {
      if (!pad) continue;
      for (const b of [0, 3, 9]) if (pad.buttons[b]?.pressed) pressed.add(b);
    }
    const fresh = (b: number): boolean => pressed.has(b) && !down.has(b);
    if (phase() !== 'rules') {
      if (fresh(0) || fresh(9)) confirm();
      else if (fresh(3)) help();
    }
    down.clear();
    for (const b of pressed) down.add(b);
    id = raf(poll);
  };
  if (env.getGamepads !== undefined || typeof navigator.getGamepads === 'function') id = raf(poll);

  return {
    destroy() {
      stopped = true;
      doc.removeEventListener('keydown', onKey);
      if (id !== null) caf(id);
      id = null;
    },
  };
}
