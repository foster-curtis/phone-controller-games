// Floating joystick (SPEC §7.2): drawn at a resting spot (bottom-left) when idle; a touch anywhere in the
// zone (the left half of the play surface) becomes the stick's origin until release.
import { STICK_MAX } from '../../shared/messages';

export const STICK_RADIUS_PX = 64;
/** Fraction of the radius inside which the stick reads as neutral. */
export const STICK_DEADZONE = 0.15;

/** Offset from the origin → ints −STICK_MAX..STICK_MAX (y grows downward, like the screen). */
export function computeStick(
  dx: number,
  dy: number,
  radius = STICK_RADIUS_PX,
  deadzone = STICK_DEADZONE,
): [number, number] {
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return [0, 0];
  const mag = Math.min(dist, radius) / radius;
  if (mag < deadzone) return [0, 0];
  const k = (mag / dist) * STICK_MAX;
  // `|| 0` normalizes -0.
  return [Math.round(dx * k) || 0, Math.round(dy * k) || 0];
}

export interface Joystick {
  value(): [number, number];
  destroy(): void;
}

export interface JoystickOptions {
  radius?: number;
  deadzone?: number;
  onChange(x: number, y: number): void;
}

export function createJoystick(zone: HTMLElement, opts: JoystickOptions): Joystick {
  const radius = opts.radius ?? STICK_RADIUS_PX;
  const deadzone = opts.deadzone ?? STICK_DEADZONE;
  const base = document.createElement('div');
  base.className = 'stick-base resting';
  const knob = document.createElement('div');
  knob.className = 'stick-knob';
  base.append(knob);
  zone.append(base);

  let pointerId: number | null = null;
  let ox = 0;
  let oy = 0;
  let cur: [number, number] = [0, 0];

  const set = (v: [number, number]) => {
    if (v[0] === cur[0] && v[1] === cur[1]) return;
    cur = v;
    opts.onChange(v[0], v[1]);
  };

  const down = (e: PointerEvent) => {
    if (pointerId !== null) return;
    pointerId = e.pointerId;
    ox = e.clientX;
    oy = e.clientY;
    try {
      zone.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    const r = zone.getBoundingClientRect();
    base.style.left = `${ox - r.left}px`;
    base.style.top = `${oy - r.top}px`;
    knob.style.transform = 'translate(-50%, -50%)';
    base.classList.remove('resting');
    zone.classList.add('active');
    e.preventDefault();
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - ox;
    const dy = e.clientY - oy;
    const dist = Math.hypot(dx, dy);
    const s = dist > radius ? radius / dist : 1;
    knob.style.transform = `translate(calc(-50% + ${dx * s}px), calc(-50% + ${dy * s}px))`;
    set(computeStick(dx, dy, radius, deadzone));
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    zone.classList.remove('active');
    // Back to the resting spot (CSS position) with the knob centered.
    base.style.left = '';
    base.style.top = '';
    knob.style.transform = 'translate(-50%, -50%)';
    base.classList.add('resting');
    set([0, 0]);
  };

  zone.addEventListener('pointerdown', down);
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);

  return {
    value: () => cur,
    destroy() {
      zone.removeEventListener('pointerdown', down);
      zone.removeEventListener('pointermove', move);
      zone.removeEventListener('pointerup', up);
      zone.removeEventListener('pointercancel', up);
      base.remove();
    },
  };
}
