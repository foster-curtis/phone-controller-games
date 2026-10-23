// DASH / SLAM hold buttons (multi-touch safe: each tracks its own pointerIds) + the SLAM charge arc.

export interface HoldButton {
  isDown(): boolean;
  destroy(): void;
}

export function createHoldButton(el: HTMLElement, onChange: (down: boolean) => void): HoldButton {
  const pointers = new Set<number>();
  const down = (e: PointerEvent) => {
    e.preventDefault();
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    const was = pointers.size > 0;
    pointers.add(e.pointerId);
    if (!was) {
      el.classList.add('pressed');
      onChange(true);
    }
  };
  const up = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 0) {
      el.classList.remove('pressed');
      onChange(false);
    }
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  return {
    isDown: () => pointers.size > 0,
    destroy() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    },
  };
}

/** Time to hold SLAM for a full gauge (visual only; the host times the real charge). */
export const SLAM_FULL_MS = 1000;

/** Arc sweep: from 9:00 (-90 deg from 12 o'clock) clockwise over the top to 2:00 (+60 deg). */
export const ARC_START_DEG = -90;
export const ARC_SWEEP_DEG = 150;
/** Radii in button-radius units (the button's outer edge = 1). */
export const ARC_INNER = 1.1;
export const ARC_HAIRLINE = 0.01;
export const ARC_MAX_THICKNESS = 0.2;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Leading-end angle (deg from 12 o'clock, clockwise) for a charge of 0..1. */
export function arcEndAngle(charge: number): number {
  return ARC_START_DEG + ARC_SWEEP_DEG * clamp01(charge);
}

/** Thickness at the leading end: a hairline at charge 0 growing to the maximum at full charge. */
export function arcThickness(charge: number): number {
  return ARC_HAIRLINE + (ARC_MAX_THICKNESS - ARC_HAIRLINE) * clamp01(charge);
}

const pt = (r: number, deg: number): string => {
  const a = (deg * Math.PI) / 180;
  return `${(r * Math.sin(a)).toFixed(4)} ${(-r * Math.cos(a)).toFixed(4)}`;
};

/** SVG path (button-radius units, origin at the button center) of the variable-width annular sector. */
export function arcPath(charge: number): string {
  const c = clamp01(charge);
  if (c <= 0) return '';
  const n = Math.max(2, Math.ceil(c * 32));
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= n; i++) {
    const f = (i / n) * c; // fraction of the full sweep
    const deg = ARC_START_DEG + ARC_SWEEP_DEG * f;
    outer.push(pt(ARC_INNER + arcThickness(f), deg));
    inner.push(pt(ARC_INNER, deg));
  }
  return `M${outer.join('L')}L${inner.reverse().join('L')}Z`;
}

export interface ChargeArc {
  svg: SVGSVGElement;
  press(): void;
  release(): void;
  /** 0..1 */
  ratio(): number;
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The SLAM charge arc: an SVG (viewBox in button-radius units) whose tapered wedge grows clockwise
 * while pressed. Hidden at charge 0; flashes once when it reaches full charge.
 */
export function createChargeArc(host: HTMLElement, fullMs = SLAM_FULL_MS): ChargeArc {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'charge-arc');
  svg.setAttribute('viewBox', '-1.3 -1.3 2.6 2.6');
  svg.setAttribute('aria-hidden', 'true');
  const gid = `arc-grad-${Math.random().toString(36).slice(2, 8)}`;
  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', gid);
  grad.setAttribute('gradientUnits', 'userSpaceOnUse');
  const [x1, y1] = pt(ARC_INNER, ARC_START_DEG).split(' ');
  const [x2, y2] = pt(ARC_INNER, ARC_START_DEG + ARC_SWEEP_DEG).split(' ');
  grad.setAttribute('x1', x1 ?? '0');
  grad.setAttribute('y1', y1 ?? '0');
  grad.setAttribute('x2', x2 ?? '0');
  grad.setAttribute('y2', y2 ?? '0');
  const stop = (offset: string, color: string) => {
    const s = document.createElementNS(SVG_NS, 'stop');
    s.setAttribute('offset', offset);
    s.setAttribute('style', `stop-color:${color}`);
    return s;
  };
  grad.append(
    stop('0', 'var(--heat)'),
    stop('1', 'color-mix(in oklab, var(--heat), var(--egg-outline) 45%)'),
  );
  defs.append(grad);
  const wedge = document.createElementNS(SVG_NS, 'path');
  wedge.setAttribute('class', 'arc-wedge');
  wedge.setAttribute('fill', `url(#${gid})`);
  const flash = document.createElementNS(SVG_NS, 'path');
  flash.setAttribute('class', 'arc-flash');
  svg.append(defs, wedge, flash);
  host.append(svg);
  svg.dataset.flashes = '0';

  let since: number | null = null;
  let flashed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const ratio = () => (since === null ? 0 : Math.min(1, (Date.now() - since) / fullMs));
  const paint = () => {
    const c = ratio();
    const d = arcPath(c);
    wedge.setAttribute('d', d);
    flash.setAttribute('d', c >= 1 ? d : '');
    svg.dataset.charge = String(c);
    svg.dataset.endAngle = String(arcEndAngle(c));
    svg.dataset.thickness = String(c > 0 ? arcThickness(c) : 0);
    if (c > 0) svg.removeAttribute('hidden');
    else svg.setAttribute('hidden', '');
    if (c >= 1 && !flashed) {
      flashed = true;
      svg.dataset.flashes = String(Number(svg.dataset.flashes) + 1);
      svg.classList.add('flash');
    }
  };
  const stopTimer = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const reset = () => {
    since = null;
    flashed = false;
    svg.classList.remove('flash');
    stopTimer();
  };
  paint();
  return {
    svg,
    press() {
      reset();
      since = Date.now();
      timer = setInterval(paint, 16);
      paint();
    },
    release() {
      reset();
      paint();
    },
    ratio,
    destroy: stopTimer,
  };
}
