// The combat build button (SPEC §10.1, §15.6, §15.7): icon, gesture and ring from `me.build`; tuple v2
// encoding of each gesture outcome (tap, aimed fire, cancel); inert while dimmed.
import { createLocalClient } from '@pcg/controller-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, type App } from '../app';
import { ChargeRing, ringState } from '../components';
import { AIM_DEAD_ZONE_PX, createPhoneSender } from '../input';
import { layoutCombat } from '../layout';
import { SAMPLES, sampleMe } from '../samples';
import { bindBuild, buildEnabled } from '../screens/combat';

const build = (mode: 'place' | 'recall' | 'none') =>
  sampleMe().build && { ...sampleMe().build!, mode };

function tap(btn: HTMLElement) {
  const fire = (type: string) => {
    const e = new MouseEvent(type, { clientX: 5, clientY: 5, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    btn.dispatchEvent(e);
  };
  fire('pointerdown');
  fire('pointerup');
}

describe('build button: enabled state', () => {
  it('is enabled only with a build whose mode is place or recall', () => {
    expect(buildEnabled(null)).toBe(false);
    expect(buildEnabled(build('none'))).toBe(false);
    expect(buildEnabled(build('place'))).toBe(true);
    expect(buildEnabled(build('recall'))).toBe(true);
  });
});

describe('build button: tap gesture (at-feet builds, the recall)', () => {
  it('a tap bumps buildFires only while enabled, with aim 0,0 and no aiming flag', () => {
    const sender = createPhoneSender(() => {});
    const btn = document.createElement('div');
    document.body.append(btn);
    let on = false;
    bindBuild(btn, sender, () => on);
    tap(btn);
    expect(sender.tuple()[11]).toBe(0);
    on = true;
    tap(btn);
    const t = sender.tuple();
    expect([t[6], t[7], t[8], t[11]]).toEqual([0, 0, 0, 1]);
  });
});

describe('ring state classes', () => {
  it('maps charge and full to empty, filling and full', () => {
    expect(ringState(0, false)).toBe('empty');
    expect(ringState(0.4, false)).toBe('filling');
    expect(ringState(0.99, false)).toBe('filling');
    expect(ringState(1, true)).toBe('full');
  });

  it('the build ring carries the state class, is dimmed until full and never flashes', () => {
    const ring = ChargeRing('build');
    const has = (c: string) => ring.el.classList.contains(c);
    ring.set(0, false);
    expect([has('empty'), has('filling'), has('full')]).toEqual([true, false, false]);
    ring.set(0.5, false);
    expect([has('empty'), has('filling'), has('full')]).toEqual([false, true, false]);
    ring.set(1, true);
    expect([has('empty'), has('filling'), has('full')]).toEqual([false, false, true]);
    expect(has('build')).toBe(true);
    expect(has('flash')).toBe(false);
  });

  it('the super ring still flashes once on becoming full', () => {
    const ring = ChargeRing();
    ring.set(1, true);
    expect(ring.el.classList.contains('flash')).toBe(true);
    expect(ring.el.classList.contains('build')).toBe(false);
  });
});

// ---- through the real screen ----

let app: App | null = null;
let root: HTMLElement;
let t = 2_000_000;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => t);
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});
afterEach(() => {
  app?.destroy();
  app = null;
  vi.restoreAllMocks();
});

function combat(sample: string) {
  const client = createLocalClient();
  const mem = new Map<string, string>();
  const store = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
  app = createApp({
    root,
    client,
    code: 'DEV1',
    storage: store,
    session: store,
    watchOrientation: false,
  });
  const s = SAMPLES[sample]!();
  client.emit({ t: 'team', rev: 1, team: s.team });
  client.emit({ t: 'me', rev: 1, me: s.me });
  const zone = root.querySelector<HTMLElement>('.attack-zone')!;
  const layout = layoutCombat({ width: innerWidth, height: innerHeight });
  const fire = (type: string, x: number, y: number) => {
    const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    zone.dispatchEvent(e);
  };
  return {
    client,
    sender: app.sender,
    fire,
    a: layout.action,
    btn: root.querySelector<HTMLElement>('.round-btn.action')!,
    ring: root.querySelector<HTMLElement>('.round-btn.action .charge-ring')!,
  };
}

describe('build button on the combat screen', () => {
  it('shows the icon from me.build.icon and a 60 px face', () => {
    for (const [sample, icon] of [
      ['combat-warden', 'act-shield'],
      ['combat', 'act-mine'],
      ['combat-artificer', 'act-beacon'],
      ['combat-commander-throw', 'act-flag'],
      ['combat-commander', 'act-recall'],
    ] as const) {
      const { btn } = combat(sample);
      expect(btn.querySelector('use')!.getAttribute('href'), sample).toBe(`#icon-${icon}`);
      expect(btn.style.cssText, sample).toContain('--face: 60px');
      app?.destroy();
      document.body.innerHTML = '<div id="app"></div>';
      root = document.getElementById('app')!;
    }
  });

  it('ring: empty and filling are dimmed, full is lit with a steady build ring', () => {
    const c = combat('combat-build-empty');
    expect(c.ring.classList.contains('empty')).toBe(true);
    expect(c.btn.classList.contains('dimmed')).toBe(true);
    c.client.emit({ t: 'me', rev: 2, me: SAMPLES['combat-build-charging']!().me });
    expect(c.ring.classList.contains('filling')).toBe(true);
    expect(c.btn.classList.contains('dimmed')).toBe(true);
    c.client.emit({ t: 'me', rev: 3, me: SAMPLES['combat-build-ready']!().me });
    expect(c.ring.classList.contains('full')).toBe(true);
    expect(c.ring.classList.contains('build')).toBe(true);
    expect(c.btn.classList.contains('dimmed')).toBe(false);
  });

  it('the recall state is lit while the meter is not full', () => {
    const c = combat('combat-commander');
    expect(c.btn.classList.contains('dimmed')).toBe(false);
    expect(c.ring.classList.contains('filling')).toBe(true);
  });

  it('a tap-type build (Ranger) is an own-element tap, not an aimed zone', () => {
    const { btn, sender } = combat('combat-build-ready');
    expect(btn.classList.contains('aim')).toBe(false);
    tap(btn);
    const tuple = sender.tuple();
    expect([tuple[6], tuple[7], tuple[8], tuple[11]]).toEqual([0, 0, 0, 1]);
  });

  it('an aimed build: tap fires with aim 0,0 and no aiming flag left', () => {
    const { sender, fire, a, btn } = combat('combat-warden-ready');
    expect(btn.classList.contains('aim')).toBe(true);
    fire('pointerdown', a.cx, a.cy);
    t += 80;
    fire('pointerup', a.cx + 2, a.cy);
    const tuple = sender.tuple();
    expect([tuple[6], tuple[7], tuple[8], tuple[11]]).toEqual([0, 0, 0, 1]);
  });

  it('an aimed build: drag sets flag 4 and the aim, release fires it', () => {
    const { sender, fire, a, btn } = combat('combat-warden-ready');
    fire('pointerdown', a.cx, a.cy);
    fire('pointermove', a.cx - 50, a.cy);
    expect(sender.get('flags')).toBe(4);
    expect(sender.get('buildX')).toBeLessThan(-60);
    expect(btn.classList.contains('aiming')).toBe(true);
    fire('pointerup', a.cx - 50, a.cy);
    const tuple = sender.tuple();
    expect(tuple[8]).toBe(0);
    expect(tuple[6]).toBeLessThan(-60);
    expect(tuple[11]).toBe(1);
  });

  it('an aimed build: back into the dead zone then release cancels (no fire, flag cleared)', () => {
    const { sender, fire, a } = combat('combat-warden-ready');
    fire('pointerdown', a.cx, a.cy);
    fire('pointermove', a.cx + 50, a.cy);
    expect(sender.get('flags')).toBe(4);
    fire('pointermove', a.cx + AIM_DEAD_ZONE_PX / 2, a.cy);
    fire('pointerup', a.cx + AIM_DEAD_ZONE_PX / 2, a.cy);
    expect(sender.get('buildFires')).toBe(0);
    expect(sender.get('flags')).toBe(0);
  });

  it('a dimmed aimed build takes no touch (nothing fires)', () => {
    const { sender, fire, a } = combat('combat-warden');
    fire('pointerdown', a.cx, a.cy);
    fire('pointermove', a.cx - 50, a.cy);
    fire('pointerup', a.cx - 50, a.cy);
    expect(sender.get('buildFires')).toBe(0);
    expect(sender.get('flags')).toBe(0);
  });

  it('the Commander recall is a tap; once the flag is gone the button is an aimed throw again', () => {
    const c = combat('combat-commander');
    expect(c.btn.classList.contains('aim')).toBe(false);
    tap(c.btn);
    expect(c.sender.get('buildFires')).toBe(1);
    c.client.emit({ t: 'me', rev: 2, me: SAMPLES['combat-commander-throw']!().me });
    expect(c.btn.classList.contains('aim')).toBe(true);
    expect(c.btn.querySelector('use')!.getAttribute('href')).toBe('#icon-act-flag');
  });
});
