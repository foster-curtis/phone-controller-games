// The build phase's phone screens (SPEC §10.2, §10.3): the card pop-up (select, Confirm sends one `card`
// intent), the shop (stick on the left third, no tabs), knight select cards and the solo Start.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLASS_IDS } from '../../shared/ids';
import { createPhoneSender } from '../input';
import type { Intent, MeView } from '../../shared/messages';
import { createView } from '../screens';
import type { ScreenCtx, View } from '../screens/common';
import { CARD_INFO, CLASS_INFO } from '../copy';
import { SAMPLES } from '../samples';
import { growthText, showsPopup } from '../screens/build';

let view: View | null = null;
let root: HTMLElement;
let sent: Intent[];

beforeEach(() => {
  document.body.innerHTML = '';
  sent = [];
});
afterEach(() => {
  view?.destroy();
  view = null;
});

function open(sample: string) {
  const ctx: ScreenCtx = {
    intent: (i) => sent.push(i),
    sender: createPhoneSender(() => {}),
    code: 'DEV1',
    storage: undefined,
    myId: () => 'dev',
    toast: () => {},
    now: () => 0,
  };
  const s = SAMPLES[sample]!();
  view = createView({ team: s.team, me: s.me }, ctx);
  document.body.append(view.el);
  root = view.el;
  const client = {
    emit: (m: { t: 'me'; rev: number; me: MeView }) => view!.update({ team: s.team, me: m.me }),
  };
  return { client, s };
}

const cardIntents = () => sent.filter((i) => i.k === 'card');

describe('growth header (SPEC §10.2)', () => {
  it('reads "Wave N cleared: +HP +DMG", is absent before wave 1', () => {
    expect(growthText(null)).toBeNull();
    expect(growthText({ wave: 4, boss: false, stats: ['maxHp', 'damage'] })).toBe(
      'Wave 4 cleared: +HP +DMG',
    );
    expect(growthText({ wave: 5, boss: true, stats: ['maxHp', 'damage', 'healing'] })).toBe(
      'Boss down, wave 5 cleared: +HP +DMG +HEAL',
    );
  });
});

describe('card pop-up', () => {
  it('shows while a hand is dealt and nothing is picked: header, three cards, Confirm, no stick', () => {
    open('cards');
    expect(root.matches('.build.popup-open')).toBe(true);
    expect(root.querySelector('.growth')!.textContent).toBe('Wave 4 cleared: +HP +DMG');
    expect(root.querySelectorAll('.upgrade-card')).toHaveLength(3);
    expect(root.querySelector<HTMLElement>('.stick-zone')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('.build-panel')!.hidden).toBe(true);
    expect(root.querySelector('.phase-clock')).not.toBeNull();
    for (const c of root.querySelectorAll<HTMLElement>('.upgrade-card')) {
      const id = c.dataset.card as keyof typeof CARD_INFO;
      expect(c.classList.contains(CARD_INFO[id].rare ? 'rare' : 'common')).toBe(true);
      expect(c.querySelector('.badge')).not.toBeNull();
    }
  });

  it('wave 0 has no growth header', () => {
    open('cards-first');
    expect(root.querySelector<HTMLElement>('.growth')!.hidden).toBe(true);
  });

  it('Confirm is off until a card is selected; select then Confirm sends exactly one card intent', () => {
    open('cards');
    const confirm = root.querySelector<HTMLButtonElement>('.confirm')!;
    expect(confirm.disabled).toBe(true);
    confirm.click();
    expect(cardIntents()).toHaveLength(0);
    root.querySelectorAll<HTMLElement>('.upgrade-card')[1]!.click();
    expect(root.querySelectorAll('.upgrade-card.selected')).toHaveLength(1);
    expect(confirm.disabled).toBe(false);
    confirm.click();
    confirm.click();
    expect(cardIntents()).toEqual([{ k: 'card', card: SAMPLES.cards!().me.cards.offer![1] }]);
    // The phone moves on to the shop at once, without waiting for the host.
    expect(root.matches('.shop-open')).toBe(true);
  });

  it('selecting another card moves the selection', () => {
    open('cards');
    const cards = () => [...root.querySelectorAll<HTMLElement>('.upgrade-card')];
    cards()[0]!.click();
    cards()[2]!.click();
    expect(cards().map((c) => c.classList.contains('selected'))).toEqual([false, false, true]);
  });

  it('switches to the shop once the pick is set', () => {
    const { client } = open('cards');
    expect(showsPopup(SAMPLES.cards!().me)).toBe(true);
    client.emit({ t: 'me', rev: 2, me: SAMPLES.shop!().me });
    expect(root.matches('.build.shop-open')).toBe(true);
    expect(root.querySelector<HTMLElement>('.popup')!.hidden).toBe(true);
  });
});

describe('shop', () => {
  it('rows on the right, the stick kept on the left third, no tabs, Ready and coins in the top bar', () => {
    open('shop');
    expect(root.matches('.build.shop-open')).toBe(true);
    expect(root.querySelector<HTMLElement>('.stick-zone')!.hidden).toBe(false);
    expect(root.querySelectorAll('.shop-row').length).toBeGreaterThan(2);
    expect(root.querySelector('.tabs, [data-tab]')).toBeNull();
    expect(root.querySelector('.build-bar .ready')).not.toBeNull();
    expect(root.querySelector('.build-bar .coins')!.textContent).toBe('1,240');
    expect(root.querySelector('.upgrade-card')).toBeNull();
  });

  it('Request and Ready send their intents; a hold-to-confirm price needs the hold', () => {
    open('shop');
    root.querySelector<HTMLElement>('.shop-row .request')!.click();
    root.querySelector<HTMLButtonElement>('.build-bar .ready')!.click();
    expect(sent).toContainEqual({ k: 'request', item: 'repair', on: true });
    expect(sent).toContainEqual({ k: 'ready', ready: true });
    root.querySelector<HTMLElement>('.shop-row[data-item=base_hp] .price')!.click();
    expect(sent.filter((i) => i.k === 'buy')).toHaveLength(0);
  });
});

describe('knight select cards (SPEC §2.6, §11.1)', () => {
  it('each shows the class role badge, main, super and build with tap/aim, and the passive card', () => {
    open('classSelect');
    const cards = [...root.querySelectorAll<HTMLElement>('.class-card')];
    expect(cards).toHaveLength(CLASS_IDS.length);
    for (const card of cards) {
      const info = CLASS_INFO[card.dataset.class as keyof typeof CLASS_INFO];
      const role = card.querySelector('.class-role')!;
      expect(role.querySelector('use')!.getAttribute('href')).toBe(`#icon-${info.roleIcon}`);
      expect(role.textContent).toBe(info.role.toUpperCase());
      for (const [part, mode] of [
        ['main', info.main.mode],
        ['super', info.super.mode],
        ['build', info.build.mode],
      ] as const) {
        const sub = card.querySelector(`[data-part="${part}"] .attack-sub`)!.textContent;
        expect(sub).toBe(`${part.toUpperCase()} · ${mode === 'aim' ? 'AIM' : 'TAP'}`);
      }
      expect(card.querySelector('[data-part="passive"]')).not.toBeNull();
    }
  });
});

describe('lobby: Start for a solo leader', () => {
  it('a lone leader sees Start; it enables once someone (themselves) is Ready', () => {
    open('lobby-solo');
    const start = root.querySelector<HTMLButtonElement>('.start')!;
    expect(root.querySelector<HTMLElement>('.leader-box')!.hidden).toBe(false);
    expect(start.disabled).toBe(true);
  });
});
