// Offline dev mode (`play.html?dev=1`): no relay. A local fake client drives the real app, with a live
// input-tuple readout and a switcher for every Screen variant and overlay.
import type { ConnectionStatus, ControllerClient } from '@pcg/net-client';
import {
  PLAYER_COLOR_IDS,
  isInput,
  type PlayerColorId,
  type Screen,
  type ScreenKind,
  type RoundBreakdown,
  type RoundPointItem,
  type Standing,
} from '../shared/messages';
import { createApp, OVERLAY_NAMES, type App, type ClientLike } from './app';
import { el } from './dom';
import { SCREEN_KINDS } from './screens';

export interface LocalClient extends ClientLike {
  /** Delivers a host message to the app. */
  emit(data: unknown): void;
  setStatus(s: ConnectionStatus): void;
  setHostStatus(s: 'present' | 'away'): void;
  /** Every message the app sent. */
  sent: unknown[];
}

/** An in-memory ControllerClient. Used by dev mode and by the tests. */
export function createLocalClient(): LocalClient {
  const msg = new Set<(d: unknown) => void>();
  const status = new Set<(s: ConnectionStatus) => void>();
  const host = new Set<(s: 'present' | 'away') => void>();
  const kicked = new Set<() => void>();
  const errors = new Set<(e: never) => void>();
  const sub = <T>(set: Set<T>, cb: T) => {
    set.add(cb);
    return () => void set.delete(cb);
  };
  const client = {
    status: 'open' as ConnectionStatus,
    playerId: 'dev',
    hostStatus: 'present' as 'present' | 'away',
    sent: [] as unknown[],
    connect: () => Promise.resolve({ playerId: 'dev' }),
    send(d: unknown) {
      client.sent.push(d);
    },
    close() {},
    onMessage: (cb: (d: unknown) => void) => sub(msg, cb),
    onStatus: (cb: (s: ConnectionStatus) => void) => sub(status, cb),
    onHostStatus: (cb: (s: 'present' | 'away') => void) => sub(host, cb),
    onKicked: (cb: () => void) => sub(kicked, cb),
    onError: (cb: Parameters<ControllerClient['onError']>[0]) =>
      sub(errors, cb as (e: never) => void),
    emit(d: unknown) {
      for (const cb of [...msg]) cb(d);
    },
    setStatus(s: ConnectionStatus) {
      client.status = s;
      for (const cb of [...status]) cb(s);
    },
    setHostStatus(s: 'present' | 'away') {
      client.hostStatus = s;
      for (const cb of [...host]) cb(s);
    },
  };
  return client;
}

const NAMES = ['Benedict', 'Yolko', 'Scramble', 'Poach', 'Omelette', 'Sunny', 'Shelly', 'Humpty'];

/** 10-char names for the long-list screens (spectating, results, matchEnd). */
const LONG_NAMES = [
  'Benedict_1',
  'Yolkodile2',
  'Scramble_3',
  'Poacher_04',
  'Omelette_5',
  'Sunnyside6',
  'Shellshock',
  'Humpty_Dmp',
];

/** Realistic 8-player round: KOs, a survivor, falls, a leaver (matches sampleStandings(8, true)). */
export function sampleBreakdown(): RoundBreakdown {
  const st = sampleStandings(8, true);
  const ko = (i: number, points = 1): RoundPointItem => ({
    kind: 'ko',
    victimId: st[i]!.playerId,
    victimName: st[i]!.name,
    points,
  });
  const by = (i: number) => ({ by: st[i]!.playerId, byName: st[i]!.name });
  const fell = { by: null, byName: null };
  const items: RoundPointItem[][] = [
    [ko(5), ko(6), { kind: 'survivor', points: 3 }],
    [ko(2), ko(3), ko(7)],
    [],
    [],
    [],
    [],
    [],
    [],
  ];
  const outs = [null, fell, by(1), by(1), fell, by(0), by(0), by(1)];
  return {
    round: 2,
    players: st.map((s, i) => ({
      playerId: s.playerId,
      name: s.name,
      color: s.color,
      points: items[i]!.reduce((a, x) => a + x.points, 0),
      total: s.score,
      left: s.left,
      items: items[i]!,
      out: outs[i]!,
    })),
  };
}

export function sampleStandings(n = 5, long = false): Standing[] {
  return PLAYER_COLOR_IDS.slice(0, n).map((color, i) => ({
    playerId: `p${i}`,
    name: (long ? LONG_NAMES : NAMES)[i] ?? `Egg ${i + 1}`,
    color,
    score: Math.max(0, 9 - i * 2),
    connected: i !== 3,
    left: i === 4,
  }));
}

export function sampleScreen(kind: ScreenKind, color: PlayerColorId = 'crimson'): Screen {
  const longList = kind === 'spectating' || kind === 'results' || kind === 'matchEnd';
  const base = {
    isLeader: true,
    round: 2,
    targetScore: 11,
    name: longList ? 'Benedict_1' : 'Benedict',
    color,
    standings: longList ? sampleStandings(8, true) : sampleStandings(),
  };
  switch (kind) {
    case 'lobby':
      return { ...base, kind, takenColors: ['cobalt', 'jade'], canStart: true };
    case 'countdown':
      return { ...base, kind, ms: 3000 };
    case 'eliminated':
      return { ...base, kind, respawnMs: 5000 };
    case 'results':
      return { ...base, kind, survivorId: 'p0', breakdown: sampleBreakdown() };
    case 'matchEnd':
      return { ...base, kind, winnerId: 'p0', breakdown: sampleBreakdown() };
    case 'playing':
    case 'ghost':
    case 'spectating':
    case 'gamePaused':
    case 'left':
      return { ...base, kind };
  }
}

export function startDev(root: HTMLElement): App {
  const client = createLocalClient();
  const readout = el('div', { class: 'dev-readout', 'aria-live': 'off' });
  const stage = el('div', { class: 'dev-stage' });
  root.append(stage, readout);

  const app = createApp({
    root: stage,
    client,
    code: 'DEV1',
    onSent: (m) => {
      if (isInput(m)) readout.textContent = `[${m.join(', ')}]`;
    },
  });
  readout.textContent = `[${app.sender.tuple().join(', ')}]`;

  const toggle = el('button', { type: 'button', class: 'dev-toggle', text: 'dev' });
  const panel = el('div', { class: 'dev-panel' });
  panel.hidden = true;
  toggle.addEventListener('click', () => (panel.hidden = !panel.hidden));

  // Current sample (kind + player color), so the banner/pad colors can be checked per player color.
  let curKind: ScreenKind = 'playing';
  let curColor: PlayerColorId = 'crimson';
  const emit = () => client.emit({ t: 'screen', screen: sampleScreen(curKind, curColor) });
  const screens = el('div', { class: 'dev-row' });
  for (const kind of SCREEN_KINDS) {
    const b = el('button', { type: 'button', 'data-dev-screen': kind, text: kind });
    b.addEventListener('click', () => {
      curKind = kind;
      emit();
    });
    screens.append(b);
  }
  const colors = el('div', { class: 'dev-row' });
  for (const color of PLAYER_COLOR_IDS) {
    const b = el('button', { type: 'button', 'data-dev-color': color, text: color });
    b.addEventListener('click', () => {
      curColor = color;
      emit();
    });
    colors.append(b);
  }
  const overlays = el('div', { class: 'dev-row' });
  for (const name of OVERLAY_NAMES) {
    const b = el('button', { type: 'button', 'data-dev-overlay': name, text: name });
    b.addEventListener('click', () => {
      const on = !app.overlays().includes(name);
      if (name === 'reconnecting') client.setStatus(on ? 'reconnecting' : 'open');
      else if (name === 'hostAway') client.setHostStatus(on ? 'away' : 'present');
      else app.setOverlay(name, on);
    });
    overlays.append(b);
  }
  panel.append(screens, colors, overlays);
  root.append(toggle, panel);

  client.emit({ t: 'screen', screen: sampleScreen('playing') });
  return app;
}
