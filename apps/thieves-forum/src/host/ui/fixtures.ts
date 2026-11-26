// `TvView` fixtures for `?ui=<screen>` and tests (SPEC §12.7): one sample view per screen, plain data.
import { feedbackUrl } from '@pcg/catalog';
import type { RevealEntry } from '../sim/snapshot';
import { GAME_ID } from '../../shared/messages';
import type { ItemId } from '../../content/types';
import type { TvLobbyPlayer, TvPodiumRow, TvView } from './types';

export const UI_SCREENS = [
  'title',
  'lobby',
  'rules',
  'roundStart',
  'play',
  'handsUp',
  'reveal',
  'transition',
  'podium',
] as const;
export type UiScreen = (typeof UI_SCREENS)[number];

export function isUiScreen(s: string): s is UiScreen {
  return (UI_SCREENS as readonly string[]).includes(s);
}

export const LOBBY_PLAYERS: TvLobbyPlayer[] = [
  { name: 'Livia', color: 'crimson', ready: true, leader: true },
  { name: 'Marcus', color: 'cobalt', ready: true, leader: false },
  { name: 'Octavia', color: 'jade', ready: false, leader: false },
  { name: 'Gaius', color: 'berry', ready: false, leader: false },
];

const loaf: ItemId = 'loaf-of-bread';
const honey: ItemId = 'honey-jar';
const cheese: ItemId = 'cheese-wheel';

export const REVEAL_ENTRIES: RevealEntry[] = [
  {
    character: 11,
    name: 'Gaius',
    color: 'berry',
    bag: 6,
    items: [{ item: loaf, value: 2 }],
    haul: 8,
    top: false,
  },
  {
    character: 12,
    name: 'Octavia',
    color: 'jade',
    bag: 14,
    items: [
      { item: honey, value: 8 },
      { item: loaf, value: 2 },
    ],
    haul: 24,
    top: false,
  },
  {
    character: 13,
    name: 'Marcus',
    color: 'cobalt',
    bag: 30,
    items: [{ item: cheese, value: 6 }],
    haul: 36,
    top: true,
  },
];

export const PODIUM_ROWS: TvPodiumRow[] = [
  { name: 'Marcus', color: 'cobalt', total: 120, place: 1 },
  { name: 'Livia', color: 'crimson', total: 95, place: 2 },
  { name: 'Octavia', color: 'jade', total: 60, place: 3 },
  { name: 'Gaius', color: 'berry', total: 41, place: 4 },
  { name: 'Quinta', color: 'sky', total: 12, place: 5 },
];

export const PREVIEW_JOIN_URL = 'https://thieves-forum.fostercurtis.dev/play?code=ABCD';

/** The fixture view for a screen; `step` picks the reveal / podium step and rules card. */
export function fixtureView(screen: UiScreen, step = 1): TvView {
  switch (screen) {
    case 'title':
      return {
        phase: 'lobby',
        code: 'ABCD',
        joinUrl: PREVIEW_JOIN_URL,
        players: [],
        canStart: false,
      };
    case 'lobby':
      return {
        phase: 'lobby',
        code: 'ABCD',
        joinUrl: PREVIEW_JOIN_URL,
        players: LOBBY_PLAYERS,
        canStart: true,
      };
    case 'rules':
      return { phase: 'rules', card: step, count: 7 };
    case 'roundStart':
      return { phase: 'roundStart', round: 2, rounds: 3, endsInMs: 3200 };
    case 'play':
      return { phase: 'play', round: 2, rounds: 3, timeLeftMs: 181_000, code: 'ABCD' };
    case 'handsUp':
      return { phase: 'handsUp', round: 2, rounds: 3 };
    case 'reveal':
      return { phase: 'reveal', reveal: { round: 2, entries: REVEAL_ENTRIES }, step };
    case 'transition':
      return { phase: 'transition', round: 2, rounds: 3 };
    case 'podium':
      return {
        phase: 'podium',
        rows: PODIUM_ROWS,
        feedbackUrl: feedbackUrl(GAME_ID),
        step,
      };
  }
}
