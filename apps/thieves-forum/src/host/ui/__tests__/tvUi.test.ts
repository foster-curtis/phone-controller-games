// @vitest-environment jsdom
// TV DOM UI (SPEC §6.14–§6.16, §6.18, §6.19): every `TvView` phase renders `[data-tv=<phase>]`, the play
// HUD names nobody, podium ties share block and banner, QRs render, and the host keys emit the right
// controls (BUILD_PLAN TF6 acceptance). jsdom, via the docblock above (the node project is the default).
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureView, LOBBY_PLAYERS, PODIUM_ROWS, REVEAL_ENTRIES, UI_SCREENS } from '../fixtures';
import { createTvUi, type TvUi } from '../tvUi';
import { winnersBanner } from '../podium';
import { cardState } from '../reveal';
import type { TvControl, TvPodiumRow, TvView } from '../types';

let ui: TvUi | null = null;
const make = (): { ui: TvUi; events: TvControl[] } => {
  ui?.destroy();
  document.body.replaceChildren();
  const made = createTvUi(document.body);
  ui = made;
  const events: TvControl[] = [];
  made.onControl((c) => events.push(c));
  return { ui: made, events };
};
afterEach(() => {
  ui?.destroy();
  ui = null;
});

const key = (k: string): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
};

describe('screens', () => {
  it.each(UI_SCREENS)('renders %s', (screen) => {
    const { ui } = make();
    const view = fixtureView(screen, 1);
    ui.render(view);
    expect(ui.root.querySelectorAll(`[data-tv=${view.phase}]`)).toHaveLength(1);
    expect(ui.root.dataset.phase).toBe(view.phase);
  });

  it('shows one screen at a time', () => {
    const { ui } = make();
    for (const s of UI_SCREENS) {
      const view = fixtureView(s, 1);
      ui.render(view);
      expect(ui.root.querySelectorAll('[data-tv]')).toHaveLength(1);
    }
  });

  it('lobby lists players with color, ready and the leader; Start state follows canStart', () => {
    const { ui } = make();
    ui.render(fixtureView('lobby'));
    const rows = ui.root.querySelectorAll<HTMLElement>('.lobby-row');
    expect(rows).toHaveLength(LOBBY_PLAYERS.length);
    expect(rows[0]!.dataset.color).toBe('crimson');
    expect(rows[0]!.dataset.ready).toBe('true');
    expect(rows[2]!.dataset.ready).toBe('false');
    expect(ui.root.querySelector('[data-role=leader]')!.textContent).toBe('Leader: Livia');
    expect(ui.root.querySelector('[data-tv=lobby]')!.getAttribute('data-can-start')).toBe('true');
    const v = fixtureView('lobby') as Extract<TvView, { phase: 'lobby' }>;
    ui.render({ ...v, canStart: false });
    expect(ui.root.querySelector('[data-role=start-state]')!.textContent).toMatch(/2 or more/);
  });

  it('renders the room code and a join QR', () => {
    const { ui } = make();
    ui.render(fixtureView('lobby'));
    expect(ui.root.querySelector('[data-role=room-code]')!.textContent).toBe('ABCD');
    const path = ui.root.querySelector('.lobby-qr svg path');
    expect(path?.getAttribute('d')?.length).toBeGreaterThan(100);
  });

  it('the title screen (lobby with no players) keeps code and QR and shows the wordmark', () => {
    const { ui } = make();
    ui.render(fixtureView('title'));
    expect(ui.root.querySelector('.lobby-qr svg')).not.toBeNull();
    expect(ui.root.querySelector('.lobby h1')!.textContent).toBe("Thieves' Forum");
    expect(ui.root.querySelectorAll('.lobby-row')).toHaveLength(0);
  });
});

describe('play HUD', () => {
  it('has the timer, round pill and room code and nothing that names or colors a player', () => {
    const { ui } = make();
    // Names, colors and scores were on screen just before; none may survive into play.
    ui.render(fixtureView('reveal', 3));
    ui.render(fixtureView('play'));
    const hud = ui.root.querySelector('[data-tv=play]') as HTMLElement;
    expect(hud.querySelector('[data-role=timer]')!.textContent).toBe('3:01');
    expect(hud.querySelector('[data-role=round-pill]')!.textContent).toBe('ROUND 2 / 3');
    expect(hud.querySelector('[data-role=room-code]')!.textContent).toBe('ABCD');
    const text = hud.textContent ?? '';
    for (const e of [...REVEAL_ENTRIES, ...LOBBY_PLAYERS]) expect(text).not.toContain(e.name);
    expect(text).toBe('3:01ROUND 2 / 3ABCD');
    for (const el of [hud, ...hud.querySelectorAll<Element>('*')]) {
      expect(el.hasAttribute('data-color')).toBe(false);
      expect(el.getAttribute('class') ?? '').not.toMatch(/player|crimson|cobalt|jade|berry|score/);
      expect(el.getAttribute('style') ?? '').not.toMatch(/player|--pc/);
    }
    expect(document.querySelector('.reveal-card')).toBeNull();
  });

  it('the ring empties as time runs out', () => {
    const { ui } = make();
    const play = (timeLeftMs: number): TvView => ({
      phase: 'play',
      round: 1,
      rounds: 3,
      timeLeftMs,
      code: null,
    });
    ui.render(play(200_000));
    const arc = ui.root.querySelector('.hud-ring-arc')!;
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBe(0);
    ui.render(play(50_000));
    expect(Number(arc.getAttribute('stroke-dashoffset'))).toBeCloseTo(75, 5);
    expect(ui.root.querySelector('[data-role=room-code]')!.hasAttribute('hidden')).toBe(true);
  });
});

describe('reveal', () => {
  it('pops cards lowest haul first and shrinks earlier ones to a +haul tag', () => {
    expect([0, 1, 2].map((i) => cardState(i, 2))).toEqual(['tag', 'open', 'hidden']);
    const { ui } = make();
    ui.render(fixtureView('reveal', 2));
    const cards = [...ui.root.querySelectorAll<HTMLElement>('[data-role=reveal-card]')];
    expect(cards.map((c) => c.dataset.state)).toEqual(['tag', 'open', 'hidden']);
    expect(cards[0]!.querySelector('[data-role=haul-tag]')!.textContent).toBe('+8');
    expect(cards[1]!.querySelector('[data-role=haul]')!.textContent).toBe('+24');
    expect(cards[1]!.textContent).toContain('Octavia');
    // item icons with values
    expect(cards[1]!.querySelectorAll('.reveal-item')).toHaveLength(2);
    // no match totals
    expect(ui.root.querySelector('[data-role=total]')).toBeNull();
  });

  it('stands cards on the scene anchors (1920 x 1080 → percent)', () => {
    const { ui } = make();
    ui.render(fixtureView('reveal', 3));
    ui.setAnchors({ 11: { x: 960, y: 540 }, 12: { x: 480, y: 270 } });
    const cards = ui.root.querySelectorAll<HTMLElement>('[data-role=reveal-card]');
    expect(cards[0]!.style.left).toBe('50%');
    expect(cards[0]!.style.top).toBe('50%');
    expect(cards[1]!.style.left).toBe('25%');
    expect(cards[1]!.style.top).toBe('25%');
  });
});

describe('podium', () => {
  const rows: TvPodiumRow[] = [
    { name: 'Ann', color: 'crimson', total: 90, place: 1 },
    { name: 'Bo', color: 'cobalt', total: 90, place: 1 },
    { name: 'Cy', color: 'jade', total: 40, place: 3 },
    { name: 'Di', color: 'berry', total: 10, place: 4 },
  ];
  const view = (step: number): TvView => ({
    phase: 'podium',
    rows,
    feedbackUrl: 'https://example.com/form',
    step,
  });

  it('reveals 3rd, then 2nd, then 1st with the banner', () => {
    const { ui } = make();
    ui.render(fixtureView('podium', 0));
    const slot = (p: number) =>
      ui.root.querySelector<HTMLElement>(`.podium-slot[data-place="${p}"]`)!;
    expect(ui.root.querySelectorAll('[data-role=podium-unknown]')).toHaveLength(3);
    expect(
      ui.root.querySelectorAll('[data-role=podium-rest] [data-role=podium-player]'),
    ).toHaveLength(2);
    expect(ui.root.querySelector<HTMLElement>('[data-role=winner-banner]')!.hidden).toBe(true);
    ui.render(fixtureView('podium', 1));
    expect(slot(3).textContent).toContain('Octavia');
    expect(slot(2).querySelector('[data-role=podium-unknown]')).not.toBeNull();
    ui.render(fixtureView('podium', 2));
    expect(slot(2).textContent).toContain('Livia');
    expect(slot(1).querySelector('[data-role=podium-unknown]')).not.toBeNull();
    ui.render(fixtureView('podium', 3));
    expect(slot(1).textContent).toContain('Marcus');
    expect(ui.root.querySelector('[data-role=winner-banner]')!.textContent).toBe('Marcus WINS!');
  });

  it('ties share the block and the banner', () => {
    expect(winnersBanner(PODIUM_ROWS)).toBe('Marcus WINS!');
    expect(winnersBanner(rows)).toBe('Ann & Bo WIN!');
    const { ui } = make();
    ui.render(view(3));
    const first = ui.root.querySelectorAll(
      '.podium-slot[data-place="1"] [data-role=podium-player]',
    );
    expect([...first].map((e) => e.querySelector('.podium-name')!.textContent)).toEqual([
      'Ann',
      'Bo',
    ]);
    expect(ui.root.querySelector('[data-role=winner-banner]')!.textContent).toBe('Ann & Bo WIN!');
    // nobody on 2nd: the block shows no player
    expect(
      ui.root.querySelectorAll('.podium-slot[data-place="2"] [data-role=podium-player]'),
    ).toHaveLength(0);
  });

  it('shows match totals and the feedback QR', () => {
    const { ui } = make();
    ui.render(view(3));
    expect(
      ui.root.querySelector('.podium-slot[data-place="1"] [data-role=total]')!.textContent,
    ).toBe('90');
    expect(ui.root.querySelector('[data-role=podium-rest] [data-role=total]')!.textContent).toBe(
      '10',
    );
    expect(
      ui.root.querySelector('.podium-feedback svg path')?.getAttribute('d')?.length,
    ).toBeGreaterThan(100);
  });
});

describe('host controls', () => {
  it('Enter starts only when the lobby can start; H opens How to play', () => {
    const { ui, events } = make();
    const v = fixtureView('lobby') as Extract<TvView, { phase: 'lobby' }>;
    ui.render({ ...v, canStart: false });
    key('Enter');
    expect(events).toEqual([]);
    key('h');
    expect(events).toEqual(['rules']);
    ui.render({ ...v, canStart: true });
    key('Enter');
    key(' ');
    key('ArrowRight');
    expect(events).toEqual(['rules', 'start', 'start', 'start']);
  });

  it('Enter on the podium plays again; keys do nothing during play', () => {
    const { ui, events } = make();
    ui.render(fixtureView('play'));
    key('Enter');
    key('h');
    expect(events).toEqual([]);
    ui.render(fixtureView('podium', 3));
    key('Enter');
    expect(events).toEqual(['playAgain']);
  });

  it('How to play: Enter / → = next, Esc = skip, once each, and the card follows the view', () => {
    const { ui, events } = make();
    ui.render({ phase: 'rules', card: 0, count: 7 });
    expect(ui.root.querySelector('.tv-rules')!.getAttribute('data-card')).toBe('0');
    expect(ui.root.querySelector('[data-tv=rules] .pcg-rules__dot.is-on')).not.toBeNull();
    key('Enter');
    key('ArrowRight');
    key('Escape');
    expect(events).toEqual(['next', 'next', 'skip']);
    ui.render({ phase: 'rules', card: 3, count: 7 });
    expect(ui.root.querySelector('.tv-rules')!.getAttribute('data-card')).toBe('3');
    expect(ui.root.querySelectorAll('.pcg-rules__dot')).toHaveLength(7);
    ui.render(fixtureView('lobby'));
    expect(document.querySelector('.tv-rules')).toBeNull();
  });

  it('a gamepad A press confirms once per press', () => {
    ui?.destroy();
    document.body.replaceChildren();
    let pressed = false;
    const pad = {
      buttons: Array.from({ length: 16 }, (_, i) => ({
        get pressed() {
          return i === 0 && pressed;
        },
      })),
    };
    const frames: (() => void)[] = [];
    const made = createTvUi(document.body, {
      env: {
        getGamepads: () => [pad as unknown as Gamepad],
        requestAnimationFrame: (cb) => frames.push(() => cb(0)),
        cancelAnimationFrame: () => undefined,
      },
    });
    ui = made;
    const events: TvControl[] = [];
    made.onControl((c) => events.push(c));
    made.render(fixtureView('podium', 3));
    const tick = (): void => frames.shift()?.();
    tick();
    pressed = true;
    tick();
    tick();
    expect(events).toEqual(['playAgain']);
    pressed = false;
    tick();
    pressed = true;
    tick();
    expect(events).toEqual(['playAgain', 'playAgain']);
  });
});
