// @vitest-environment jsdom
// Rules overview DOM shell (PLATFORM decision #12).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRulesShell, type RulesCard, type RulesShell } from '../src/index';

function art() {
  const log = { mounts: 0, destroys: 0, opts: [] as boolean[] };
  return {
    log,
    illustration: {
      mount: (_slot: HTMLElement, o: { reducedMotion: boolean }) => {
        log.mounts++;
        log.opts.push(o.reducedMotion);
        return { destroy: () => void log.destroys++ };
      },
    },
  };
}

const a = art();
const b = art();
const cards: RulesCard[] = [
  {
    title: 'One',
    body: (c) => `First to ${c.playerCount}`,
    note: 'small',
    illustration: a.illustration,
  },
  { title: 'Two', body: 'plain', illustration: b.illustration },
  { title: 'Three', body: 'end', illustration: a.illustration },
];

let shell: RulesShell | null = null;
afterEach(() => {
  shell?.destroy();
  shell = null;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  a.log.mounts = a.log.destroys = 0;
  b.log.mounts = b.log.destroys = 0;
  a.log.opts.length = 0;
});

const key = (k: string, init: KeyboardEventInit = {}, target: EventTarget = document) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};

describe('createRulesShell', () => {
  it('builds the DOM with kit and extra classes', () => {
    shell = createRulesShell({
      cards,
      onAction() {},
      buttons: true,
      classes: { root: 'r', dot: 'd', dotOn: 'on', button: 'btn' },
    });
    expect(shell.card).toBe(-1);
    shell.show({ card: 0, cards: 3 }, { playerCount: 4 });
    const el = shell.element;
    expect(el.tagName).toBe('SECTION');
    expect(el.className).toBe('pcg-rules r');
    expect(el.dataset.card).toBe('0');
    expect(Array.from(el.children).map((c) => c.className.split(' ')[0])).toEqual([
      'pcg-rules__slot',
      'pcg-rules__title',
      'pcg-rules__body',
      'pcg-rules__note',
      'pcg-rules__dots',
      'pcg-rules__hint',
      'pcg-rules__buttons',
    ]);
    expect(el.querySelector('.pcg-rules__slot')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('h1')?.textContent).toBe('One');
    expect(el.querySelector('.pcg-rules__body')?.textContent).toBe('First to 4');
    expect(el.querySelector('.pcg-rules__hint')?.textContent).toBe('Leader: Next / Skip');
    const dots = el.querySelectorAll('.pcg-rules__dot');
    expect(dots).toHaveLength(3);
    expect(dots[0]?.className).toContain('is-on');
    expect(dots[0]?.classList.contains('on')).toBe(true);
    expect(dots[1]?.classList.contains('is-on')).toBe(false);
    expect(dots[1]?.classList.contains('d')).toBe(true);
    expect(el.querySelectorAll('button.btn')).toHaveLength(2);
  });

  it('re-resolves text, hides empty note, clamps the card', () => {
    shell = createRulesShell({ cards, onAction() {} });
    shell.show({ card: 0, cards: 3 }, { playerCount: 2 });
    const body = shell.element.querySelector('.pcg-rules__body')!;
    const note = shell.element.querySelector<HTMLElement>('.pcg-rules__note')!;
    expect(body.textContent).toBe('First to 2');
    expect(note.hidden).toBe(false);
    shell.show({ card: 0, cards: 3 }, { playerCount: 6 });
    expect(body.textContent).toBe('First to 6');
    expect(a.log.mounts).toBe(1);
    shell.show({ card: 1, cards: 3 }, { playerCount: 6 });
    expect(note.hidden).toBe(true);
    shell.show({ card: 99, cards: 3 }, { playerCount: 6 });
    expect(shell.card).toBe(2);
    expect(shell.element.dataset.card).toBe('2');
  });

  it('mounts per card change, destroys the previous and on destroy', () => {
    shell = createRulesShell({ cards, onAction() {} });
    shell.show({ card: 0, cards: 3 }, { playerCount: 2 });
    shell.show({ card: 0, cards: 3 }, { playerCount: 2 });
    expect([a.log.mounts, a.log.destroys]).toEqual([1, 0]);
    shell.show({ card: 1, cards: 3 }, { playerCount: 2 });
    expect([a.log.destroys, b.log.mounts]).toEqual([1, 1]);
    shell.destroy();
    expect(b.log.destroys).toBe(1);
    shell.destroy();
    expect(b.log.destroys).toBe(1);
    expect(shell.element.isConnected).toBe(false);
  });

  it('survives an illustration that throws', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad: RulesCard = {
      title: 'Bad',
      body: 'x',
      illustration: {
        mount: () => {
          throw new Error('boom');
        },
      },
    };
    shell = createRulesShell({ cards: [bad, ...cards], onAction() {} });
    shell.show({ card: 0, cards: 4 }, { playerCount: 2 });
    expect(err).toHaveBeenCalled();
    expect(shell.element.querySelector('h1')?.textContent).toBe('Bad');
    shell.show({ card: 1, cards: 4 }, { playerCount: 2 });
    expect(a.log.mounts).toBe(1);
    err.mockRestore();
  });

  it('keys: mapping, ignored combos, repeats, inputs, removal on destroy', () => {
    const seen: string[] = [];
    shell = createRulesShell({ cards, onAction: (x) => seen.push(x), gamepad: false });
    for (const k of ['Enter', 'ArrowRight', ' ']) expect(key(k).defaultPrevented).toBe(true);
    expect(key('Escape').defaultPrevented).toBe(true);
    expect(seen).toEqual(['next', 'next', 'next', 'skip']);
    seen.length = 0;
    expect(key('a').defaultPrevented).toBe(false);
    key('Enter', { repeat: true });
    key('Enter', { ctrlKey: true });
    key('Enter', { altKey: true });
    key('Enter', { metaKey: true });
    key('Enter', { shiftKey: true });
    const input = document.createElement('input');
    document.body.append(input);
    key('Enter', {}, input);
    const ce = document.createElement('div');
    ce.setAttribute('contenteditable', 'true');
    document.body.append(ce);
    key('Enter', {}, ce);
    expect(seen).toEqual([]);
    shell.destroy();
    key('Enter');
    expect(seen).toEqual([]);
  });

  it('keys: false and a custom target', () => {
    const seen: string[] = [];
    shell = createRulesShell({ cards, onAction: (x) => seen.push(x), keys: false });
    key('Enter');
    expect(seen).toEqual([]);
    shell.destroy();
    const target = document.createElement('div');
    shell = createRulesShell({ cards, onAction: (x) => seen.push(x), keys: target });
    key('Enter');
    expect(seen).toEqual([]);
    key('Escape', {}, target);
    expect(seen).toEqual(['skip']);
  });

  it('gamepad: edge-triggered A/Start/B, stops after destroy', () => {
    const seen: string[] = [];
    let pressed: number[] = [];
    let cb: ((t: number) => void) | null = null;
    const cancel = vi.fn();
    const pad = () =>
      ({
        buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })),
      }) as unknown as Gamepad;
    shell = createRulesShell({
      cards,
      keys: false,
      onAction: (x) => seen.push(x),
      env: {
        getGamepads: () => [null, pad()],
        requestAnimationFrame: (f) => {
          cb = f;
          return 7;
        },
        cancelAnimationFrame: cancel,
      },
    });
    const tick = () => {
      const f = cb;
      cb = null;
      f?.(0);
    };
    pressed = [0];
    tick();
    tick();
    expect(seen).toEqual(['next']);
    pressed = [];
    tick();
    pressed = [9];
    tick();
    pressed = [];
    tick();
    pressed = [1];
    tick();
    expect(seen).toEqual(['next', 'next', 'skip']);
    shell.destroy();
    expect(cancel).toHaveBeenCalledWith(7);
    pressed = [0];
    tick();
    expect(seen).toHaveLength(3);
    expect(cb).toBeNull();
  });

  it('gamepad: no polling when disabled', () => {
    const raf = vi.fn(() => 1);
    shell = createRulesShell({
      cards,
      onAction() {},
      gamepad: false,
      env: { getGamepads: () => [], requestAnimationFrame: raf },
    });
    expect(raf).not.toHaveBeenCalled();
  });

  it('buttons: labels and clicks', () => {
    const seen: string[] = [];
    shell = createRulesShell({ cards, onAction: (x) => seen.push(x), buttons: true });
    shell.show({ card: 0, cards: 3 }, { playerCount: 2 });
    const next = shell.element.querySelector<HTMLButtonElement>('[data-action=next]')!;
    const skip = shell.element.querySelector<HTMLButtonElement>('[data-action=skip]')!;
    expect(next.textContent).toBe('Next');
    expect(skip.textContent).toBe('Skip');
    shell.show({ card: 2, cards: 3 }, { playerCount: 2 });
    expect(next.textContent).toBe("Let's play!");
    next.click();
    skip.click();
    expect(seen).toEqual(['next', 'skip']);
  });

  it('no buttons by default', () => {
    shell = createRulesShell({ cards, onAction() {} });
    expect(shell.element.querySelector('button')).toBeNull();
  });

  it('injects a single style element', () => {
    const s1 = createRulesShell({ cards, onAction() {} });
    const s2 = createRulesShell({ cards, onAction() {} });
    expect(document.head.querySelectorAll('style#pcg-rules-style')).toHaveLength(1);
    expect(document.head.querySelector('style')?.textContent).toContain('prefers-reduced-motion');
    s1.destroy();
    s2.destroy();
  });

  it('passes reducedMotion to mounts (option, then env)', () => {
    shell = createRulesShell({ cards, onAction() {}, reducedMotion: true });
    shell.show({ card: 0, cards: 3 }, { playerCount: 2 });
    shell.destroy();
    shell = createRulesShell({ cards, onAction() {}, env: { prefersReducedMotion: () => true } });
    shell.show({ card: 0, cards: 3 }, { playerCount: 2 });
    shell.destroy();
    shell = createRulesShell({
      cards,
      onAction() {},
      reducedMotion: false,
      env: { prefersReducedMotion: () => true },
    });
    shell.show({ card: 0, cards: 3 }, { playerCount: 2 });
    expect(a.log.opts).toEqual([true, true, false]);
  });
});
