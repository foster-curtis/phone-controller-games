// Floating aimed-attack joysticks (FF4-fix-2, C1 note 1). One transparent zone over the right half takes
// every touch; `pickZone` (layout.ts) chooses the button by the bounds between buttons, and the
// joystick's center is wherever the finger landed. The kit's `aimedGesture` machine does the rest
// (tap = auto-aim fire, drag + release = fire with aim, release in the dead zone = cancel), so the
// tuple encoding is the same as a fixed aimed button. The kit's `bindGesture` is one element per
// machine with a fixed origin, so this composes the machine here. Extraction candidate: a kit
// `bindZonedGestures` (several machines, one surface, a picker, a floating origin).
import { el, type AimedState } from '@pcg/controller-kit';
import {
  aimGesture,
  encodeAimed,
  encodeAimedState,
  type AttackKey,
  type PhoneSender,
} from './input';
import { pickZone, type CombatLayout } from './layout';

export interface AimZoneOptions {
  sender: PhoneSender;
  getLayout(): CombatLayout;
  /** The drawn buttons; they get `floating` + `--fx/--fy/--kx/--ky` while a finger drives them. */
  buttons: Record<AttackKey, HTMLElement>;
  now?: () => number;
}

export interface AimZones {
  el: HTMLElement;
  /** Which attack keys are aimed for the current class; the rest are left to their own buttons. */
  setAimed(keys: readonly AttackKey[]): void;
  reset(): void;
  destroy(): void;
}

type Machine = ReturnType<typeof aimGesture>;
type Input = Parameters<Machine['step']>[1];

export function mountAimZones(parent: HTMLElement, o: AimZoneOptions): AimZones {
  const zone = el('div', { class: 'attack-zone', 'data-zone': 'attack' });
  parent.append(zone);
  const now = o.now ?? (() => Date.now());
  const machine = aimGesture();
  let aimed: readonly AttackKey[] = [];
  let active: { id: number; key: AttackKey; ox: number; oy: number; state: AimedState } | null =
    null;

  const paint = (key: AttackKey, st: AimedState | null, floatX?: number, floatY?: number) => {
    const b = o.buttons[key];
    if (!st) {
      b.classList.remove('floating', 'pressed', 'aiming');
      for (const v of ['--fx', '--fy', '--kx', '--ky']) b.style.removeProperty(v);
      return;
    }
    b.classList.add('floating', 'pressed');
    b.classList.toggle('aiming', st.phase === 'aiming');
    if (floatX !== undefined && floatY !== undefined) {
      b.style.setProperty('--fx', `${floatX}px`);
      b.style.setProperty('--fy', `${floatY}px`);
    }
    b.style.setProperty('--kx', `${st.x}px`);
    b.style.setProperty('--ky', `${st.y}px`);
  };

  const feed = (input: Input) => {
    if (!active) return;
    const { key } = active;
    const r = machine.step(active.state, input);
    active.state = r.state;
    const idle = r.state.phase === 'idle';
    encodeAimedState(o.sender, key, r.state);
    o.sender.touch(key, !idle);
    paint(key, idle ? null : r.state);
    for (const out of r.out) encodeAimed(o.sender, key, out);
    if (idle) active = null;
  };

  const down = (e: PointerEvent) => {
    if (active) return;
    const rect = parent.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const layout = o.getLayout();
    const key = pickZone(layout, x, y);
    // A tap or radial button is not ours: its own element takes touches on it, and a touch in the
    // bounds of one of those does nothing here.
    if (key === null || key === 'action' || !aimed.includes(key)) return;
    e.preventDefault();
    try {
      zone.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    active = { id: e.pointerId, key, ox: e.clientX, oy: e.clientY, state: machine.initial() };
    feed({ type: 'down', t: now() });
    // The joystick floats to the finger: offset from the button's resting center.
    const rest = layout[key];
    if (active) paint(key, active.state, x - rest.cx, y - rest.cy);
  };
  const move = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.id) return;
    feed({ type: 'move', t: now(), dx: e.clientX - active.ox, dy: e.clientY - active.oy });
  };
  const end = (e: PointerEvent, type: 'up' | 'cancel') => {
    if (!active || e.pointerId !== active.id) return;
    if (type === 'up')
      feed({ type, t: now(), dx: e.clientX - active.ox, dy: e.clientY - active.oy });
    else feed({ type, t: now() });
  };
  const up = (e: PointerEvent) => end(e, 'up');
  const cancel = (e: PointerEvent) => end(e, 'cancel');

  zone.addEventListener('pointerdown', down);
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', cancel);

  const reset = () => {
    if (!active) return;
    const { key } = active;
    active = null;
    encodeAimedState(o.sender, key, machine.initial());
    o.sender.touch(key, false);
    paint(key, null);
  };

  return {
    el: zone,
    setAimed(keys) {
      reset();
      aimed = keys;
    },
    reset,
    destroy() {
      reset();
      zone.removeEventListener('pointerdown', down);
      zone.removeEventListener('pointermove', move);
      zone.removeEventListener('pointerup', up);
      zone.removeEventListener('pointercancel', cancel);
      zone.remove();
    },
  };
}
