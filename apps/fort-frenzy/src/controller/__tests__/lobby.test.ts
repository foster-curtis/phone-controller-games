// FF4-fix-2 (C1 notes 2, 4, 5): one-card swipes, the ready-dimmed lobby, the color picker and its intent.
import { describe, expect, it } from 'vitest';
import type { Intent } from '../../shared/messages';
import { isIntent } from '../../shared/messages';
import { createPhoneSender } from '../input';
import { SAMPLES } from '../samples';
import { createLobby } from '../screens/lobby';
import type { ScreenCtx } from '../screens/common';
import { SWIPE_MIN_PX, swipeTarget } from '../swipe';

function mount(sample: string) {
  const intents: Intent[] = [];
  const ctx: ScreenCtx = {
    intent: (i) => intents.push(i),
    sender: createPhoneSender(() => {}),
    code: 'DEV1',
    storage: undefined,
    myId: () => 'dev',
    toast: () => {},
    now: () => 0,
  };
  const view = createLobby(ctx);
  document.body.append(view.el);
  const s = SAMPLES[sample]!();
  view.update({ team: s.team, me: s.me });
  return { view, intents, root: view.el };
}

const ptr = (el: HTMLElement, type: string, x: number, id = 1) => {
  const e = new MouseEvent(type, { clientX: x, clientY: 10, bubbles: true });
  Object.defineProperty(e, 'pointerId', { value: id });
  el.dispatchEvent(e);
};

describe('class select swipe (note 2)', () => {
  it('swipeTarget moves at most one card, whatever the drag length or speed', () => {
    expect(swipeTarget(0, 4, -40, 300, 400)).toBe(1);
    expect(swipeTarget(1, 4, -3000, 20, 400)).toBe(2);
    expect(swipeTarget(2, 4, 3000, 20, 400)).toBe(1);
    expect(swipeTarget(0, 4, 3000, 20, 400)).toBe(0);
    expect(swipeTarget(3, 4, -3000, 20, 400)).toBe(3);
  });

  it('a short slow drag stays put; a short fast flick moves one', () => {
    expect(swipeTarget(1, 4, -(SWIPE_MIN_PX - 10), 400, 400)).toBe(1);
    expect(swipeTarget(1, 4, -20, 30, 400)).toBe(2);
  });

  it('one very long swipe on the cards moves exactly one place', () => {
    const { root } = mount('classSelect');
    const track = root.querySelector<HTMLElement>('.class-track')!;
    const dots = [...root.querySelectorAll('.dot')];
    expect(dots.findIndex((d) => d.classList.contains('on'))).toBe(0);
    ptr(track, 'pointerdown', 500);
    ptr(track, 'pointermove', 100);
    ptr(track, 'pointermove', -2000);
    ptr(track, 'pointerup', -2000);
    expect(dots.findIndex((d) => d.classList.contains('on'))).toBe(1);
    expect(root.querySelector('.pick')!.textContent).toBe('PICK WARDEN');
  });
});

describe('ready dims the lobby (note 4)', () => {
  it('unready: actions live; ready: label stays, everything else is disabled and dark', () => {
    const idle = mount('lobby');
    expect(idle.root.classList.contains('is-ready')).toBe(false);
    expect(idle.root.querySelector<HTMLButtonElement>('.link-btn')!.disabled).toBe(false);
    expect(idle.root.querySelector('.ready')!.textContent).toBe('READY');

    const set = mount('lobby-ready');
    expect(set.root.classList.contains('is-ready')).toBe(true);
    expect(set.root.querySelector('.ready')!.textContent).toBe('READY');
    expect(set.root.querySelector('.ready')!.classList.contains('dark')).toBe(true);
    expect(set.root.querySelector<HTMLButtonElement>('.ready')!.disabled).toBe(false);
    expect(set.root.querySelector<HTMLButtonElement>('.link-btn')!.disabled).toBe(true);
    expect(set.root.querySelector<HTMLButtonElement>('.start')!.disabled).toBe(true);
    for (const b of set.root.querySelectorAll<HTMLButtonElement>('.seg'))
      expect(b.disabled).toBe(true);
    for (const b of set.root.querySelectorAll<HTMLButtonElement>('.swatch'))
      expect(b.disabled).toBe(true);
    // Tapping Ready again un-readies.
    set.root.querySelector<HTMLButtonElement>('.ready')!.click();
    expect(set.intents).toEqual([{ k: 'ready', ready: false }]);
  });
});

describe('color picker (note 5)', () => {
  it('shows the six colors, marks the ones others hold, and sends the color intent', () => {
    const { root, intents } = mount('lobby-colors');
    const sw = [...root.querySelectorAll<HTMLButtonElement>('.swatch')];
    expect(sw.map((b) => b.dataset.color)).toEqual([
      'cobalt',
      'jade',
      'sky',
      'bone',
      'rose',
      'forest',
    ]);
    // Maya holds jade, Dev rose, Sam sky; the dev player (cobalt in the roster) is me.
    const taken = sw.filter((b) => b.classList.contains('taken')).map((b) => b.dataset.color);
    expect(taken).toEqual(['jade', 'sky', 'rose']);
    for (const b of sw.filter((x) => x.classList.contains('taken'))) b.click();
    expect(intents).toEqual([]);
    sw.find((b) => b.dataset.color === 'forest')!.click();
    expect(intents).toEqual([{ k: 'color', color: 'forest' }]);
    expect(isIntent(intents[0])).toBe(true);
    expect(isIntent({ k: 'color', color: 'purple' })).toBe(false);
  });
});
