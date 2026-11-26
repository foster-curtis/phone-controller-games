// Phone screens (SPEC §6.17, §6.18, §6.19): every host `screen` kind renders `[data-screen=<kind>]`, the
// lobby and match-end show leader buttons only to the leader, and every dev sample is a valid host
// message. jsdom (src/controller/**).
import { describe, expect, it } from 'vitest';
import { isHostMsg, type Screen } from '../../shared/messages';
import { OUTFIT, SAMPLE_IDS, SAMPLES } from '../samples';
import { mountApp } from './helpers';

const SCREENS: Record<Screen['s'], Screen> = {
  joining: { s: 'joining' },
  lobby: {
    s: 'lobby',
    you: 0,
    canStart: true,
    players: [{ name: 'A', color: 'crimson', ready: false, leader: true, connected: true }],
  },
  rules: { s: 'rules', card: 0, count: 7, leader: false },
  roundStart: { s: 'roundStart', round: 1, rounds: 3, outfits: [OUTFIT], endsInMs: 4000 },
  play: { s: 'play', round: 1, rounds: 3, endsInMs: 1000, name: 'A', color: 'cobalt' },
  handsUp: { s: 'handsUp', bag: 3, items: [], total: 9 },
  stocks: { s: 'stocks', pot: 4, endsInMs: 9000 },
  walkOn: { s: 'walkOn', outfit: OUTFIT, entry: 'upperLeft', label: 'top left', endsInMs: 2000 },
  matchEnd: { s: 'matchEnd', place: 1, total: 99, tied: false, leader: false },
  waiting: { s: 'waiting', reason: 'nextRound' },
};

describe('screens', () => {
  for (const [kind, screen] of Object.entries(SCREENS)) {
    it(`renders [data-screen] for ${kind}`, () => {
      const rig = mountApp();
      rig.emit({ t: 'screen', screen });
      const want = kind === 'joining' ? 'connected' : kind;
      expect(rig.q(`[data-screen=${want}]`)).toBeTruthy();
      expect(rig.app.screen()).toBe(want);
    });
  }

  it('starts on the join form and moves to Connected on `joined`', () => {
    const rig = mountApp();
    expect(rig.q('[data-screen=join]')).toBeTruthy();
    rig.q<HTMLInputElement>('input[name=name]').value = 'Livia';
    rig.q<HTMLFormElement>('form').requestSubmit();
    expect(rig.sent('join')).toEqual([{ t: 'join', name: 'Livia', proto: 1 }]);
    rig.emit({ t: 'joined', name: 'Livia' });
    expect(rig.q('[data-screen=connected]').textContent).toContain('Watch the TV');
  });

  it('shows the top banner on in-round screens only', () => {
    const rig = mountApp();
    rig.emit({ t: 'screen', screen: SCREENS.lobby });
    expect(rig.q('.top-banner').hidden).toBe(true);
    rig.emit({ t: 'screen', screen: SCREENS.play }, { t: 'bag', bag: 42, pack: [], weight: 0, cap: 15 });
    expect(rig.q('.top-banner').hidden).toBe(false);
    expect(rig.q('.top-banner').textContent).toContain('A');
    expect(rig.q('[data-role=coin-pill]').textContent).toBe('42 d');
  });

  it('lobby: leader buttons only for the leader; color and Ready send', () => {
    const rig = mountApp();
    const players = [
      { name: 'A', color: 'crimson', ready: false, leader: true, connected: true },
      { name: 'B', color: 'cobalt', ready: false, leader: false, connected: true },
    ] as const;
    rig.emit({ t: 'screen', screen: { s: 'lobby', players: [...players], you: 1, canStart: true } });
    expect(rig.qa('[data-action=start], [data-action=howToPlay]')).toHaveLength(0);
    rig.q('[data-color=jade]').click();
    rig.q('[data-action=ready]').click();
    expect(rig.sent()).toContainEqual({ t: 'color', color: 'jade' });
    expect(rig.sent()).toContainEqual({ t: 'ready', ready: true });
    expect(rig.q<HTMLButtonElement>('[data-color=crimson]').disabled).toBe(true);

    rig.emit({ t: 'screen', screen: { s: 'lobby', players: [...players], you: 0, canStart: false } });
    expect(rig.q<HTMLButtonElement>('[data-action=start]').disabled).toBe(true);
    rig.emit({ t: 'screen', screen: { s: 'lobby', players: [...players], you: 0, canStart: true } });
    rig.q('[data-action=start]').click();
    rig.q('[data-action=howToPlay]').click();
    expect(rig.sent('leader')).toEqual([
      { t: 'leader', action: 'start' },
      { t: 'leader', action: 'howToPlay' },
    ]);
  });

  it('rules: Next and Skip only for the leader', () => {
    const rig = mountApp();
    rig.emit({ t: 'screen', screen: { s: 'rules', card: 0, count: 7, leader: false } });
    expect(rig.qa('[data-action=next]')).toHaveLength(0);
    rig.emit({ t: 'screen', screen: { s: 'rules', card: 0, count: 7, leader: true } });
    rig.q('[data-action=next]').click();
    expect(rig.sent('leader')).toEqual([{ t: 'leader', action: 'next' }]);
  });

  it('match end: Play again only for the leader; feedback link always', () => {
    const rig = mountApp();
    rig.emit({ t: 'screen', screen: SCREENS.matchEnd });
    expect(rig.qa('[data-action=playAgain]')).toHaveLength(0);
    expect(rig.q<HTMLAnchorElement>('[data-action=feedback]').href).toContain('docs.google.com');
    rig.emit({ t: 'screen', screen: { s: 'matchEnd', place: 2, total: 5, tied: true, leader: true } });
    expect(rig.q('.banner').textContent).toBe('Tied for 2nd');
    rig.q('[data-action=playAgain]').click();
    expect(rig.sent('leader')).toEqual([{ t: 'leader', action: 'playAgain' }]);
  });

  it('round start lays out one or two outfit cards', () => {
    const rig = mountApp();
    rig.sample('roundStart');
    expect(rig.qa('[data-screen=roundStart] .outfit-card')).toHaveLength(1);
    rig.sample('roundStart2');
    expect(rig.qa('[data-screen=roundStart] .outfit-card')).toHaveLength(2);
  });

  it('round start and walk-on count down from receipt', () => {
    const rig = mountApp();
    rig.emit({ t: 'screen', screen: SCREENS.roundStart });
    expect(rig.q('.countdown').textContent).toBe('4');
    rig.advance(1500);
    expect(rig.q('.countdown').textContent).toBe('3');
    rig.emit({ t: 'screen', screen: SCREENS.walkOn });
    expect(rig.q('[data-screen=walkOn] .banner').textContent).toBe("You're walking in at the top left");
    rig.advance(2500);
    expect(rig.q('[data-screen=walkOn] .banner').textContent).toBe('Your turn!');
  });

  it('hands up shows Bag, Items and Total', () => {
    const rig = mountApp();
    rig.sample('handsUp');
    const text = rig.q('[data-screen=handsUp]').textContent!;
    expect(text).toContain('HANDS UP!');
    expect(text).toMatch(/Bag.*42 d/);
    expect(text).toMatch(/Items.*3/);
    expect(text).toMatch(/Total.*88 d/);
  });

  it('stocks shows CAUGHT!, the pot and a ring that runs down', () => {
    const rig = mountApp();
    rig.sample('stocks');
    expect(rig.q('[data-screen=stocks]').textContent).toContain('CAUGHT!');
    expect(rig.q('[data-screen=stocks]').textContent).toContain('18 d');
    rig.advance(6000);
    expect(rig.q('.ring-num').textContent).toBe('6');
  });

  it('waiting: reasons', () => {
    const rig = mountApp();
    rig.sample('full');
    expect(rig.q('[data-screen=waiting]').dataset.reason).toBe('full');
  });

  it('an outdated host shows the update screen', () => {
    const rig = mountApp();
    rig.emit({ t: 'outdated', proto: 2 });
    expect(rig.q('[data-screen=outdated]')).toBeTruthy();
  });
});

describe('dev samples', () => {
  for (const id of SAMPLE_IDS) {
    it(`${id} only holds valid host messages`, () => {
      for (const m of SAMPLES[id]!().msgs) expect(isHostMsg(m), JSON.stringify(m)).toBe(true);
    });
  }
});
