// Rules overview phone screen (PLATFORM decision #12).
import { describe, expect, it } from 'vitest';
import { createRulesPhoneScreen } from '../src/index';

describe('rules phone screen', () => {
  it('non-leader: heading, caption, watch text, no buttons', () => {
    const s = createRulesPhoneScreen({ card: 1, cards: 4, isLeader: false }, { onAction() {} });
    const el = s.element;
    expect(el.tagName).toBe('SECTION');
    expect(el.className).toBe('screen rules');
    expect(el.dataset.screen).toBe('rules');
    expect(el.querySelector('h1')?.textContent).toBe('How to play');
    expect(el.querySelector('p.caption')?.textContent).toBe('Card 2 of 4');
    expect(el.querySelector('p.body')?.textContent).toBe('Watch the TV');
    expect(el.querySelector('.leader-row')).toBeNull();
  });

  it('leader: Next and Skip call onAction; last card has no Skip', () => {
    const seen: string[] = [];
    const s = createRulesPhoneScreen(
      { card: 0, cards: 2, isLeader: true },
      { onAction: (a) => seen.push(a), className: 'x' },
    );
    expect(s.element.className).toBe('x');
    s.element.querySelector<HTMLButtonElement>('#next')!.click();
    s.element.querySelector<HTMLButtonElement>('#skip')!.click();
    expect(seen).toEqual(['next', 'skip']);
    s.update({ card: 1, cards: 2, isLeader: true });
    expect(s.element.querySelector('#skip')).toBeNull();
    expect(s.element.querySelector('#next')?.textContent).toBe("Let's play!");
    s.destroy();
    expect(s.element.isConnected).toBe(false);
  });

  it('uses custom builders', () => {
    const seen: string[] = [];
    const s = createRulesPhoneScreen(
      { card: 0, cards: 3, isLeader: true },
      {
        onAction: (a) => seen.push(a),
        heading: (t) => Object.assign(document.createElement('h2'), { textContent: t }),
        text: (t, k) => Object.assign(document.createElement('span'), { textContent: t, title: k }),
        button: (b, onClick) => {
          const el = document.createElement('a');
          el.textContent = b.label;
          el.dataset.id = b.id;
          el.addEventListener('click', onClick);
          return el;
        },
      },
    );
    expect(s.element.querySelector('h2')?.textContent).toBe('How to play');
    expect(s.element.querySelector('span[title=caption]')?.textContent).toBe('Card 1 of 3');
    expect(s.element.querySelector('span[title=body]')?.textContent).toBe('Watch the TV');
    s.element.querySelector<HTMLElement>('[data-id=skip]')!.click();
    expect(seen).toEqual(['skip']);
  });

  it('update does not re-render when the model is unchanged', () => {
    const s = createRulesPhoneScreen({ card: 0, cards: 3, isLeader: true }, { onAction() {} });
    const next = s.element.querySelector('#next');
    s.update({ card: 0, cards: 3, isLeader: true });
    expect(s.element.querySelector('#next')).toBe(next);
    s.update({ card: 1, cards: 3, isLeader: true });
    expect(s.element.querySelector('#next')).not.toBe(next);
    expect(s.element.querySelector('p.caption')?.textContent).toBe('Card 2 of 3');
  });
});
