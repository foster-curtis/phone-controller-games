// Canned host messages for `/play?dev=1` (SPEC §12.7): one sample per phone screen and sheet, so the whole
// controller can be seen offline. Every message passes `isHostMsg` (samples.test.ts). Never imports host
// code.
import type { Outfit } from '../content/types';
import type { HostMsg, LobbyPlayer, PackItem, Screen } from '../shared/messages';
import type { StallView } from '../shared/viewer/types';

export const OUTFIT: Outfit = { tunic: 'terracotta', mantle: 'linen', hair: 1, skin: 2 };
export const OUTFIT_B: Outfit = { tunic: 'woad', mantle: 'sage', hair: 4, skin: 4 };

const PACK: PackItem[] = [
  { item: 'honey-jar', name: 'Honey jar', value: 8, weight: 2 },
  { item: 'saffron-pouch', name: 'Saffron pouch', value: 24, weight: 1 },
  { item: 'bronze-ring', name: 'Bronze ring', value: 14, weight: 1 },
];

export const PLAYERS: LobbyPlayer[] = [
  { name: 'Livia', color: 'crimson', ready: false, leader: true, connected: true },
  { name: 'Marcus', color: 'cobalt', ready: true, leader: false, connected: true },
  { name: 'Julia', color: 'jade', ready: true, leader: false, connected: false },
];

export const STALL: StallView = {
  stall: 3,
  canopy: 'bakery',
  title: 'Bakery',
  counter: [
    {
      slot: 0,
      item: 'loaf-of-bread',
      name: 'Loaf of bread',
      price: 2,
      grabMs: 600,
      rarity: 'common',
      state: 'free',
    },
    {
      slot: 1,
      item: 'honey-jar',
      name: 'Honey jar',
      price: 8,
      grabMs: 700,
      rarity: 'common',
      state: 'free',
    },
    {
      slot: 2,
      item: 'honey-cake',
      name: 'Honey cake',
      price: 12,
      grabMs: 850,
      rarity: 'uncommon',
      state: 'takenByOther',
    },
    {
      slot: 3,
      item: 'cheese-wheel',
      name: 'Cheese wheel',
      price: 30,
      grabMs: 1200,
      rarity: 'rare',
      state: 'tooHeavy',
    },
  ],
  shelf: [
    {
      slot: 4,
      item: 'honey-cake',
      name: 'Honey cake',
      price: 12,
      grabMs: 1250,
      rarity: 'uncommon',
      state: 'outOfReach',
    },
    {
      slot: 5,
      item: 'cheese-wheel',
      name: 'Cheese wheel',
      price: 30,
      grabMs: 1700,
      rarity: 'rare',
      state: 'outOfReach',
    },
  ],
};

const play = (): HostMsg[] => [
  {
    t: 'screen',
    screen: { s: 'play', round: 1, rounds: 3, endsInMs: 90_000, name: 'Livia', color: 'crimson' },
  },
  { t: 'outfit', outfit: OUTFIT },
  { t: 'bag', bag: 42, pack: PACK, weight: 4, cap: 15 },
  { t: 'context', main: 'browse', tossReadyInMs: 0, tip: true, catch: false },
];

export interface Sample {
  msgs: HostMsg[];
  /** Runs after the messages (e.g. open the pack sheet by tapping the coin pill). */
  after?: (stage: HTMLElement) => void;
}

const screen = (s: Screen): HostMsg[] => [{ t: 'screen', screen: s }];

export const SAMPLES: Record<string, () => Sample> = {
  lobby: () => ({ msgs: screen({ s: 'lobby', players: PLAYERS, you: 0, canStart: true }) }),
  rules: () => ({ msgs: screen({ s: 'rules', card: 1, count: 7, leader: true }) }),
  roundStart: () => ({
    msgs: [
      {
        t: 'screen',
        screen: {
          s: 'play',
          round: 1,
          rounds: 3,
          endsInMs: 90_000,
          name: 'Livia',
          color: 'crimson',
        },
      },
      ...screen({ s: 'roundStart', round: 1, rounds: 3, outfits: [OUTFIT], endsInMs: 5000 }),
    ],
  }),
  roundStart2: () => ({
    msgs: screen({
      s: 'roundStart',
      round: 2,
      rounds: 3,
      outfits: [OUTFIT, OUTFIT_B],
      endsInMs: 5000,
    }),
  }),
  walkOn: () => ({
    msgs: screen({
      s: 'walkOn',
      outfit: OUTFIT,
      entry: 'upperLeft',
      label: 'top left',
      endsInMs: 6000,
    }),
  }),
  play: () => ({ msgs: play() }),
  toss: () => ({
    msgs: [
      ...play(),
      { t: 'context', main: 'pickpocket', tossReadyInMs: 6000, tip: true, catch: true },
    ],
  }),
  stall: () => ({ msgs: [...play(), { t: 'stallView', view: STALL }] }),
  dialog: () => ({
    msgs: [
      ...play(),
      { t: 'stallView', view: STALL },
      {
        t: 'dialog',
        open: true,
        buy: [
          { item: 'loaf-of-bread', name: 'Loaf of bread', price: 2 },
          { item: 'honey-jar', name: 'Honey jar', price: 8 },
          { item: 'honey-cake', name: 'Honey cake', price: 12 },
        ],
        ask: [{ slot: 4, item: 'honey-cake', name: 'Honey cake' }],
      },
    ],
  }),
  pawn: () => ({
    msgs: [
      ...play(),
      {
        t: 'pawnSheet',
        sheet: {
          endsInMs: 20_000,
          offers: [
            { item: 'honey-jar', name: 'Honey jar', price: 5 },
            { item: 'saffron-pouch', name: 'Saffron pouch', price: 15 },
            { item: 'bronze-ring', name: 'Bronze ring', price: 8 },
          ],
        },
      },
    ],
  }),
  sell: () => ({
    msgs: [
      ...play(),
      {
        t: 'sellSheet',
        sheet: {
          to: 7,
          wants: ['saffron-pouch', 'pepper-pouch'],
          offers: [{ item: 'saffron-pouch', name: 'Saffron pouch', price: 31 }],
        },
      },
    ],
  }),
  pack: () => ({
    msgs: play(),
    after: (stage) => stage.querySelector<HTMLElement>('[data-role=coin-pill]')?.click(),
  }),
  tip: () => ({
    msgs: [
      ...play(),
      {
        t: 'tipSnapshot',
        snapshot: { id: 1, w: 960, h: 540, mime: 'image/jpeg', bytes: 52_000 },
        hits: [
          { targetId: 1, x: 120, y: 200, w: 60, h: 110 },
          { targetId: 2, x: 400, y: 260, w: 60, h: 110 },
          { targetId: 3, x: 700, y: 180, w: 60, h: 110 },
        ],
        fee: 10,
        endsInMs: 20_000,
      },
    ],
  }),
  caught: () => ({ msgs: [...play(), { t: 'caught', pot: 18, by: 'player' }] }),
  stocks: () => ({ msgs: screen({ s: 'stocks', pot: 18, endsInMs: 12_000 }) }),
  handsUp: () => ({ msgs: screen({ s: 'handsUp', bag: 42, items: PACK, total: 88 }) }),
  matchEnd: () => ({
    msgs: screen({ s: 'matchEnd', place: 2, total: 214, tied: false, leader: true }),
  }),
  waiting: () => ({ msgs: screen({ s: 'waiting', reason: 'nextRound' }) }),
  full: () => ({ msgs: screen({ s: 'waiting', reason: 'full' }) }),
  toast: () => ({
    msgs: [...play(), { t: 'toast', kind: 'lucky', text: 'Lucky! +19' }],
  }),
};

export const SAMPLE_IDS = Object.keys(SAMPLES);
