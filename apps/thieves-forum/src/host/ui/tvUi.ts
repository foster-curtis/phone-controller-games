// TV DOM UI (SPEC §6.14–§6.16, §6.18, §6.19, §12.2): renders one `TvView` as DOM over the canvas inside a
// 1920 x 1080 frame that scales to fit (same logical size as the Phaser canvas, so the scene's
// screen coordinates for reveal cards map 1:1). Every screen is `[data-tv=<phase>]`. During `play` the
// HUD is the timer ring, round pill and room code only: no names, scores or player colors (§6.16).
import type { RulesAction, RulesCard } from '@pcg/game-kit';
import backdropUrl from '../../../art/forum/ui/forum-backdrop.svg?url';
import markUrl from '../../../brand/mark.svg?url';
import { balance } from '../../content/balance';
import { title } from '../../../game.meta';
import { createControls, type ControlsEnv } from './controls';
import { clock, h, qrSvg } from './dom';
import { createPodium } from './podium';
import { createRevealLayer, STAGE_H, STAGE_W } from './reveal';
import { createRulesHost, type RulesHost } from './rules/host';
import { PLACEHOLDER_CARDS } from './rules/placeholder';
import type { TvAnchors, TvControl, TvLobbyPlayer, TvView } from './types';

/** SPEC §6.0 (placeholder, §10 open question 1). */
export const TAGLINE = 'Blend in. Swipe gold. Don’t get caught.';

export interface TvUiOptions {
  /** How to play cards (TF15's `src/content/rules.ts`); a dev placeholder until then. */
  rulesCards?: readonly RulesCard[];
  /** Player count for card text that depends on it. */
  playerCount?: () => number;
  /** Test seams for keyboard and gamepad. */
  env?: Partial<ControlsEnv>;
}

export interface TvUi {
  readonly root: HTMLElement;
  render(view: TvView): void;
  /** Reveal card positions from the scene (1920 x 1080 px above each head). */
  setAnchors(anchors: TvAnchors): void;
  /** Host control events: keyboard, gamepad, and the rules shell's Next / Skip. */
  onControl(cb: (c: TvControl) => void): () => void;
  destroy(): void;
}

function lobbyScreen(): { el: HTMLElement; update(v: Extract<TvView, { phase: 'lobby' }>): void } {
  const el = h('section', 'lobby');
  const brand = h('div', 'lobby-brand');
  const mark = h('img', 'lobby-mark');
  mark.src = markUrl;
  mark.alt = '';
  brand.append(mark, h('h1', 'title', title), h('p', 'lobby-tagline body', TAGLINE));

  const join = h('div', 'lobby-join');
  const qr = h('div', 'lobby-qr');
  const code = h('div', 'lobby-code code-tv');
  code.dataset.role = 'room-code';
  join.append(h('p', 'label', 'Scan to join, or enter the code'), qr, code);

  const players = h('div', 'lobby-players');
  const leader = h('p', 'caption lobby-leader');
  leader.dataset.role = 'leader';
  const list = h('ul', 'lobby-list');
  list.dataset.role = 'players';
  const empty = h('p', 'caption lobby-empty', 'Waiting for shoppers…');
  const start = h('p', 'label lobby-start');
  start.dataset.role = 'start-state';
  players.append(h('h2', 'h2', 'Shoppers'), leader, list, empty, start);
  el.append(brand, join, players);

  let shownJoin: string | null = null;
  return {
    el,
    update(v) {
      const key = `${v.code ?? ''}|${v.joinUrl ?? ''}`;
      if (key !== shownJoin) {
        shownJoin = key;
        code.textContent = v.code ?? '····';
        qr.replaceChildren(...(v.joinUrl ? [qrSvg(v.joinUrl, 'Join QR code')] : []));
      }
      list.replaceChildren(...v.players.map(playerRow));
      empty.hidden = v.players.length > 0;
      const lead = v.players.find((p) => p.leader);
      leader.textContent = lead ? `Leader: ${lead.name}` : '';
      leader.hidden = !lead;
      el.dataset.canStart = String(v.canStart);
      start.textContent = v.canStart
        ? 'Ready? Leader taps Start on the phone, or press Enter here.'
        : 'Need 2 or more players to start.';
    },
  };
}

function playerRow(p: TvLobbyPlayer): HTMLElement {
  const li = h('li', 'lobby-row');
  li.dataset.color = p.color;
  li.dataset.ready = String(p.ready);
  if (p.leader) li.dataset.leader = '';
  const dot = h('span', 'lobby-swatch');
  dot.setAttribute('aria-hidden', 'true');
  const name = h('span', 'name-tv', p.name);
  name.dataset.role = 'player';
  const ready = h('span', 'caption lobby-ready', 'Ready');
  ready.dataset.role = 'ready';
  ready.hidden = !p.ready;
  li.append(dot, name, ready);
  return li;
}

function roundText(round: number, rounds: number): string {
  return `ROUND ${round} / ${rounds}`;
}

const SVG = 'http://www.w3.org/2000/svg';
const RING_R = 30;

function playScreen(): { el: HTMLElement; update(v: Extract<TvView, { phase: 'play' }>): void } {
  const el = h('section', 'hud');
  const top = h('div', 'hud-top');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'hud-ring');
  svg.setAttribute('viewBox', '0 0 72 72');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(SVG, 'circle');
  const arc = document.createElementNS(SVG, 'circle');
  for (const c of [track, arc]) {
    c.setAttribute('cx', '36');
    c.setAttribute('cy', '36');
    c.setAttribute('r', String(RING_R));
    c.setAttribute('pathLength', '100');
  }
  track.setAttribute('class', 'hud-ring-track');
  arc.setAttribute('class', 'hud-ring-arc');
  arc.setAttribute('stroke-dasharray', '100');
  svg.append(track, arc);
  const time = h('span', 'hud-time money');
  time.dataset.role = 'timer';
  const pill = h('span', 'hud-pill label');
  pill.dataset.role = 'round-pill';
  top.append(svg, time, pill);
  const code = h('div', 'hud-code code');
  code.dataset.role = 'room-code';
  el.append(top, code);

  // The ring's full length: the first time left seen in a round (the host can set a round length).
  let total = balance.match.roundMs;
  let seenRound = -1;
  return {
    el,
    update(v) {
      if (v.round !== seenRound) {
        seenRound = v.round;
        total = Math.max(v.timeLeftMs, 1);
      }
      const frac = Math.min(1, Math.max(0, v.timeLeftMs / total));
      arc.setAttribute('stroke-dashoffset', String(100 - frac * 100));
      time.textContent = clock(v.timeLeftMs);
      pill.textContent = roundText(v.round, v.rounds);
      code.textContent = v.code ?? '';
      code.hidden = v.code === null;
    },
  };
}

function bannerScreen(
  phase: 'roundStart' | 'handsUp' | 'transition',
  big: (v: Extract<TvView, { phase: typeof phase }>) => string,
): { el: HTMLElement; update(v: Extract<TvView, { phase: typeof phase }>): void } {
  const el = h('section', `banner-screen is-${phase}`);
  const pill = h('p', 'hud-pill label');
  pill.dataset.role = 'round-pill';
  const text = h('h2', 'banner');
  text.dataset.role = 'banner';
  el.append(pill, text);
  return {
    el,
    update(v) {
      pill.textContent = roundText(v.round, v.rounds);
      text.textContent = big(v);
    },
  };
}

export function createTvUi(parent: HTMLElement, opts: TvUiOptions = {}): TvUi {
  const root = h('div', 'tv-ui');
  const bg = h('img', 'tv-bg');
  bg.src = backdropUrl;
  bg.alt = '';
  const frame = h('div', 'tv-frame');
  root.append(bg, frame);
  parent.append(root);

  const fit = (): void => {
    const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H) || 1;
    frame.style.setProperty('--tv-scale', String(s));
    frame.style.setProperty('--tv-x', `${(window.innerWidth - STAGE_W * s) / 2}px`);
    frame.style.setProperty('--tv-y', `${(window.innerHeight - STAGE_H * s) / 2}px`);
  };
  fit();
  window.addEventListener('resize', fit);

  const lobby = lobbyScreen();
  const play = playScreen();
  const roundStart = bannerScreen('roundStart', (v) =>
    'endsInMs' in v ? String(Math.max(0, Math.ceil(v.endsInMs / 1000))) : '',
  );
  const handsUp = bannerScreen('handsUp', () => 'HANDS UP!');
  const transition = bannerScreen('transition', () => '');
  const reveal = createRevealLayer();
  const revealScreen = h('section', 'reveal');
  revealScreen.append(h('p', 'hud-pill label'), reveal.el);
  const podium = createPodium();

  const screens: Record<TvView['phase'], HTMLElement | null> = {
    lobby: lobby.el,
    rules: null,
    roundStart: roundStart.el,
    play: play.el,
    handsUp: handsUp.el,
    reveal: revealScreen,
    transition: transition.el,
    podium: podium.el,
  };
  for (const [phase, el] of Object.entries(screens)) if (el) el.dataset.tv = phase;

  const listeners = new Set<(c: TvControl) => void>();
  const emit = (c: TvControl): void => {
    for (const cb of [...listeners]) cb(c);
  };

  let view: TvView | null = null;
  let current: HTMLElement | null = null;
  let rules: RulesHost | null = null;
  const onRulesAction = (a: RulesAction): void => emit(a);

  const controls = createControls(
    () => view?.phase ?? 'lobby',
    () => view?.phase === 'lobby' && view.canStart,
    emit,
    opts.env,
  );

  const mount = (el: HTMLElement | null, phase: TvView['phase']): void => {
    root.dataset.phase = phase;
    if (el === current) return;
    current?.remove();
    current = el;
    if (el) frame.append(el);
  };

  return {
    root,
    render(v) {
      view = v;
      if (v.phase === 'rules') {
        if (!rules) {
          rules = createRulesHost(opts.rulesCards ?? PLACEHOLDER_CARDS, onRulesAction, opts.env);
        }
        mount(rules.element, 'rules');
        rules.element.dataset.tv = 'rules';
        rules.show(v.card, v.count, opts.playerCount?.() ?? 0);
        return;
      }
      if (rules) {
        rules.destroy();
        rules = null;
      }
      switch (v.phase) {
        case 'lobby':
          lobby.update(v);
          break;
        case 'play':
          play.update(v);
          break;
        case 'roundStart':
          roundStart.update(v);
          break;
        case 'handsUp':
          handsUp.update(v);
          break;
        case 'transition':
          transition.update(v);
          break;
        case 'reveal':
          reveal.update(v.reveal, v.step);
          revealScreen.querySelector('.hud-pill')!.textContent = roundText(
            v.reveal.round,
            balance.match.rounds,
          );
          break;
        case 'podium':
          podium.update(v.rows, v.feedbackUrl, v.step);
          break;
      }
      mount(screens[v.phase], v.phase);
    },
    setAnchors: (a) => reveal.setAnchors(a),
    onControl(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    destroy() {
      controls.destroy();
      window.removeEventListener('resize', fit);
      rules?.destroy();
      rules = null;
      root.remove();
    },
  };
}
