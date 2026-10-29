// Floating joystick: drawn at a resting spot (CSS `.stick-base.resting`) when idle; a touch anywhere in
// the zone becomes the stick's origin until release. Radius, dead zone, output scale, idle opacity
// and ease-back are parameters (Fort Frenzy SPEC §15.1).

export const STICK_RADIUS_PX = 64;
/** Fraction of the radius inside which the stick reads as neutral. */
export const STICK_DEADZONE = 0.15;
/** Output range: ints −STICK_SCALE..STICK_SCALE. */
export const STICK_SCALE = 100;

/** Offset from the origin → ints −max..max (y grows downward, like the screen). */
export function computeStick(
  dx: number,
  dy: number,
  radius = STICK_RADIUS_PX,
  deadzone = STICK_DEADZONE,
  max = STICK_SCALE,
): [number, number] {
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return [0, 0];
  const mag = Math.min(dist, radius) / radius;
  if (mag < deadzone) return [0, 0];
  const k = (mag / dist) * max;
  // `|| 0` normalizes -0.
  return [Math.round(dx * k) || 0, Math.round(dy * k) || 0];
}

export interface Joystick {
  value(): [number, number];
  /** True while a pointer drives the stick. */
  active(): boolean;
  destroy(): void;
}

export interface JoystickOptions {
  /** Maximum knob travel, px (default 64). */
  radius?: number;
  /** Dead zone as a fraction of the radius (default 0.15). */
  deadzone?: number;
  /** Output scale (default 100). */
  max?: number;
  /** Opacity while resting (unset: CSS decides). Full opacity while touched. */
  idleOpacity?: number;
  /** Ease back to the resting spot over this many ms on release (unset: CSS decides). */
  easeBackMs?: number;
  onChange(x: number, y: number): void;
  /** Touch start / end (for a fixed-rate sender's touched state). */
  onTouch?(down: boolean): void;
}

export function createJoystick(zone: HTMLElement, opts: JoystickOptions): Joystick {
  const radius = opts.radius ?? STICK_RADIUS_PX;
  const deadzone = opts.deadzone ?? STICK_DEADZONE;
  const max = opts.max ?? STICK_SCALE;
  const base = document.createElement('div');
  base.className = 'stick-base resting';
  const knob = document.createElement('div');
  knob.className = 'stick-knob';
  base.append(knob);
  zone.append(base);

  const ease = (on: boolean) => {
    if (opts.easeBackMs === undefined) return;
    const t = on ? `${opts.easeBackMs}ms ease-out` : '0s';
    base.style.transition = `left ${t}, top ${t}, opacity ${t}`;
    knob.style.transition = `transform ${t}`;
  };
  const opacity = (resting: boolean) => {
    if (opts.idleOpacity === undefined) return;
    base.style.opacity = resting ? String(opts.idleOpacity) : '1';
  };
  opacity(true);

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
    ease(false);
    base.style.left = `${ox - r.left}px`;
    base.style.top = `${oy - r.top}px`;
    knob.style.transform = 'translate(-50%, -50%)';
    base.classList.remove('resting');
    opacity(false);
    zone.classList.add('active');
    e.preventDefault();
    opts.onTouch?.(true);
  };

  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - ox;
    const dy = e.clientY - oy;
    const dist = Math.hypot(dx, dy);
    const s = dist > radius ? radius / dist : 1;
    knob.style.transform = `translate(calc(-50% + ${dx * s}px), calc(-50% + ${dy * s}px))`;
    set(computeStick(dx, dy, radius, deadzone, max));
  };

  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    zone.classList.remove('active');
    // Back to the resting spot (CSS position) with the knob centered.
    ease(true);
    base.style.left = '';
    base.style.top = '';
    knob.style.transform = 'translate(-50%, -50%)';
    base.classList.add('resting');
    opacity(true);
    set([0, 0]);
    opts.onTouch?.(false);
  };

  zone.addEventListener('pointerdown', down);
  zone.addEventListener('pointermove', move);
  zone.addEventListener('pointerup', up);
  zone.addEventListener('pointercancel', up);

  return {
    value: () => cur,
    active: () => pointerId !== null,
    destroy() {
      zone.removeEventListener('pointerdown', down);
      zone.removeEventListener('pointermove', move);
      zone.removeEventListener('pointerup', up);
      zone.removeEventListener('pointercancel', up);
      base.remove();
    },
  };
}
