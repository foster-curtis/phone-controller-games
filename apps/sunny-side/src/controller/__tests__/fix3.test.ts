import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARC_INNER,
  ARC_MAX_THICKNESS,
  arcEndAngle,
  arcPath,
  arcThickness,
  createChargeArc,
} from '../input/buttons';
import { createJoystick } from '../input/joystick';
import { mount, pointer, sampleScreen } from './helpers';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../controller.css'),
  'utf8',
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});
afterEach(() => vi.useRealTimers());

const q = (root: ParentNode, sel: string) => root.querySelector<HTMLElement>(sel);

function rule(selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
}

describe('banner (note 1)', () => {
  it('uses the player color vars and name; dot precedes the name; pause is on the right', () => {
    const h = mount();
    h.show(sampleScreen('playing', 'cobalt'));
    const bar = q(h.root, '[data-banner]') as HTMLElement;
    expect(bar.style.getPropertyValue('--banner-bg')).toBe('var(--player-cobalt)');
    expect(bar.style.getPropertyValue('--banner-on')).toBe('var(--player-cobalt-on)');
    const name = q(bar, '.banner-name') as HTMLElement;
    expect(name.textContent).toBe('Benedict');
    const dot = q(bar, '.conn-dot') as HTMLElement;
    expect(dot.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const slot = q(bar, '.banner-slot') as HTMLElement;
    expect(name.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.contains(q(h.root, '.pause-btn'))).toBe(true);
    expect(bar.lastElementChild).toBe(slot);
  });

  it('is neutral before a color is assigned, and the dot follows connectivity', () => {
    const h = mount();
    const bar = q(h.root, '[data-banner]') as HTMLElement;
    expect(bar.style.getPropertyValue('--banner-bg')).toBe('var(--surface-strong)');
    expect(bar.style.getPropertyValue('--banner-on')).toBe('var(--foreground)');
    expect(q(bar, '.conn-dot')?.classList.contains('on')).toBe(true);
    h.client.setStatus('reconnecting');
    expect(q(bar, '.conn-dot')?.classList.contains('on')).toBe(false);
    expect(rule('.conn-dot.on')).toMatch(/var\(--success\)/);
  });
});

describe('joystick resting spot (note 2)', () => {
  it('rests when idle, moves to a left-half touch, and returns on release', () => {
    const zone = document.createElement('div');
    document.body.append(zone);
    createJoystick(zone, { onChange: () => {} });
    const base = q(zone, '.stick-base') as HTMLElement;
    expect(base.classList.contains('resting')).toBe(true);
    expect(base.style.left).toBe('');
    pointer(zone, 'pointerdown', 1, 80, 120);
    expect(base.classList.contains('resting')).toBe(false);
    expect(base.style.left).toBe('80px');
    expect(base.style.top).toBe('120px');
    pointer(zone, 'pointerup', 1, 80, 120);
    expect(base.classList.contains('resting')).toBe(true);
    expect(base.style.left).toBe('');
    expect(base.style.top).toBe('');
    expect(rule('.stick-base.resting')).toMatch(/left:[^;]*;[\s\S]*top:/);
    expect(rule('.stick-base')).not.toMatch(/opacity:\s*0/);
  });

  it('a right-half touch never starts the stick', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    const base = q(h.root, '.stick-base') as HTMLElement;
    for (const pad of ['dash', 'slam']) {
      const z = q(h.root, `[data-pad=${pad}]`) as HTMLElement;
      pointer(z, 'pointerdown', 9, 600, 100);
      expect(base.classList.contains('resting')).toBe(true);
      pointer(z, 'pointerup', 9, 600, 100);
    }
    const stickZone = q(h.root, '.stick-zone') as HTMLElement;
    expect(stickZone.contains(q(h.root, '.play-right'))).toBe(false);
    pointer(stickZone, 'pointerdown', 3, 50, 50);
    expect(base.classList.contains('resting')).toBe(false);
  });
});

describe('DASH / SLAM look and zones (note 3)', () => {
  it('no longer reference player vars; DASH is cream, SLAM yolk; zones split the right half', () => {
    const h = mount();
    h.show(sampleScreen('playing', 'berry'));
    const pads = q(h.root, '.pads') as HTMLElement;
    expect(pads.outerHTML).not.toContain('--player-');
    expect(rule('.pad-btn')).toMatch(/background:\s*var\(--cream\)/);
    expect(rule('.pad-zone.slam .pad-btn')).toMatch(/background:\s*var\(--yolk\)/);
    expect(rule('.pad-btn')).toMatch(/var\(--shadow-sticker\)/);
    expect(css).toMatch(/\.pad-zone\.pressed \.pad-btn\s*\{[^}]*var\(--shadow-pressed\)/);
    expect(rule('.pad-zone.dash')).toMatch(/justify-content:\s*center/);
    expect(rule('.pad-zone.slam')).toMatch(/flex-end/);
    expect(rule('.pad-zone')).toMatch(/flex:\s*1 1 0/);
    expect(rule('.pads')).toMatch(/flex-direction:\s*row/);
  });

  it('a press anywhere in each zone registers', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    for (const id of ['dash', 'slam']) {
      const zone = q(h.root, `[data-pad=${id}]`) as HTMLElement;
      pointer(zone, 'pointerdown', 5, 1, 1);
      expect(zone.classList.contains('pressed')).toBe(true);
      pointer(zone, 'pointerup', 5, 1, 1);
      expect(zone.classList.contains('pressed')).toBe(false);
    }
    expect(h.tuples().some((t) => (t[2] ?? 0) & 1)).toBe(true);
    expect(h.tuples().some((t) => (t[2] ?? 0) & 2)).toBe(true);
  });
});

describe('SLAM charge arc (note 4)', () => {
  it('geometry: end angle -90 + 150*charge, thickness grows with charge', () => {
    expect(arcEndAngle(0)).toBe(-90);
    expect(arcEndAngle(0.5)).toBe(-15);
    expect(arcEndAngle(1)).toBe(60);
    expect(arcThickness(0.25)).toBeLessThan(arcThickness(0.75));
    expect(arcThickness(1)).toBeCloseTo(ARC_MAX_THICKNESS, 6);
    expect(arcThickness(0)).toBeLessThan(0.02);
    expect(arcPath(0)).toBe('');
    expect(arcPath(1).length).toBeGreaterThan(arcPath(0.3).length);
  });

  it('is hidden at 0, tracks hold, flashes exactly once per full charge, clears on release', () => {
    const host = document.createElement('div');
    const arc = createChargeArc(host, 1000);
    const svg = arc.svg;
    expect(svg.hasAttribute('hidden')).toBe(true);
    expect(svg.querySelector('.arc-wedge')?.getAttribute('d')).toBe('');
    arc.press();
    vi.advanceTimersByTime(250);
    const t1 = Number(svg.dataset.thickness);
    vi.advanceTimersByTime(250);
    expect(Number(svg.dataset.thickness)).toBeGreaterThan(t1);
    expect(Number(svg.dataset.endAngle)).toBeCloseTo(-15, -1);
    expect(svg.dataset.flashes).toBe('0');
    expect(svg.classList.contains('flash')).toBe(false);
    vi.advanceTimersByTime(600);
    expect(svg.dataset.flashes).toBe('1');
    expect(svg.classList.contains('flash')).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(svg.dataset.flashes).toBe('1');
    arc.release();
    expect(svg.hasAttribute('hidden')).toBe(true);
    expect(svg.classList.contains('flash')).toBe(false);
    arc.press();
    vi.advanceTimersByTime(1100);
    expect(svg.dataset.flashes).toBe('2');
  });

  it('is out of the hit-test path, colored heat, flashes in yolk-shine', () => {
    expect(rule('.charge-arc')).toMatch(/pointer-events:\s*none/);
    expect(rule('.arc-flash')).toMatch(/var\(--yolk-shine\)/);
    const host = document.createElement('div');
    createChargeArc(host);
    const html = host.innerHTML;
    expect(html).toContain('var(--heat)');
    expect(html).toContain('color-mix(in oklab, var(--heat), var(--egg-outline) 45%)');
  });

  it('clears when the play surface goes to ghost', () => {
    const h = mount();
    h.show(sampleScreen('playing'));
    const slam = q(h.root, '[data-pad=slam]') as HTMLElement;
    const svg = q(slam, '.charge-arc') as unknown as SVGElement;
    pointer(slam, 'pointerdown', 4);
    vi.advanceTimersByTime(300);
    expect(svg.hasAttribute('hidden')).toBe(false);
    h.show(sampleScreen('ghost'));
    expect(svg.hasAttribute('hidden')).toBe(true);
  });
});

describe('M5-fix-4 arc hugs the button', () => {
  it('inner radius = button radius + a small fixed gap (<= 8 px at the largest button)', () => {
    // viewBox unit ~ the button radius (svg = 130% of the button, viewBox 2.6 units); gap = ARC_INNER - 1 units.
    expect(rule('.charge-arc')).toMatch(/width:\s*130%/);
    expect(ARC_INNER).toBeGreaterThan(1);
    const gapPx = (ARC_INNER - 1) * 60; // largest button radius = 5 * --space-6 / 2
    expect(gapPx).toBeLessThanOrEqual(8);
    expect(arcPath(1)).not.toBe('');
  });
});

describe('M5-fix-4 positions', () => {
  it('stick rests up/right, DASH sits low, SLAM and PULSE are nudged in', () => {
    expect(rule('.stick-zone')).toMatch(/--nudge:/);
    expect(rule('.stick-base.resting')).toMatch(/left:[^;]*--nudge[^;]*;[\s\S]*top:[^;]*--nudge/);
    expect(rule('.pad-zone.dash')).toMatch(/padding-bottom:\s*calc\(46dvh/);
    expect(rule('.pad-zone.slam')).toMatch(/padding-right:[\s\S]*padding-bottom:/);
    expect(rule('.pad-zone.pulse')).toMatch(/align-items:\s*flex-end/);
  });
});
