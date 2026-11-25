// Protocol guards (SPEC §12.5): a sample of every phone and host message passes its guard, the other
// direction's guard rejects it, and junk is rejected.
import { describe, expect, it } from 'vitest';
import type { Outfit } from '../../content/types';
import {
  BIT_CATCH,
  BIT_HOLD,
  cleanName,
  GAME_ID,
  type HostMsg,
  isHostMsg,
  isPhoneMsg,
  NAME_MAX,
  type PhoneMsg,
  PROTOCOL_VERSION,
  type Screen,
} from '../messages';

const outfit: Outfit = { tunic: 'woad', mantle: 'linen', hair: 1, skin: 2 };
const item = { item: 'gem-ring', name: 'Gem ring', value: 600, weight: 1 };
const tile = {
  slot: 0,
  item: 'knife',
  name: 'Knife',
  price: 10,
  grabMs: 600,
  rarity: 'common',
  state: 'free',
} as const;

const PHONE: PhoneMsg[] = [
  { t: 'join', name: 'Livia', proto: PROTOCOL_VERSION },
  { t: 'join', name: 'Livia' },
  { t: 'input', x: -100, y: 37, bits: BIT_HOLD | BIT_CATCH },
  { t: 'browse' },
  { t: 'grab', stall: 3, slot: 5 },
  { t: 'dialog', pick: 'browsing' },
  { t: 'dialog', pick: 'leave' },
  { t: 'dialog', pick: 'ask', slot: 4 },
  { t: 'buy', item: 'knife' },
  { t: 'sell', item: 'knife', to: 'pawn' },
  { t: 'sell', item: 'knife', to: 17 },
  { t: 'toss', x: 0, y: 0 },
  { t: 'tipOpen' },
  { t: 'tipSend', target: 3 },
  { t: 'tipCancel' },
  { t: 'color', color: 'jade' },
  { t: 'ready', ready: true },
  { t: 'leader', action: 'start' },
  { t: 'leader', action: 'playAgain' },
  { t: 'leave' },
  { t: 'blobAck', blobId: 2 },
];

const SCREENS: Screen[] = [
  { s: 'joining' },
  {
    s: 'lobby',
    players: [{ name: 'Livia', color: 'jade', ready: true, leader: true, connected: true }],
    you: 0,
    canStart: false,
  },
  { s: 'rules', card: 2, count: 7, leader: false },
  { s: 'roundStart', round: 1, rounds: 3, outfits: [outfit], endsInMs: 4000 },
  { s: 'play', round: 1, rounds: 3, endsInMs: 270_000, name: 'Livia', color: 'jade' },
  { s: 'handsUp', bag: 31, items: [item], total: -4 },
  { s: 'stocks', pot: 5, endsInMs: 20_000 },
  { s: 'walkOn', outfit, entry: 'upperLeft', label: 'top left', endsInMs: 1500 },
  { s: 'matchEnd', place: 1, total: 120, tied: false, leader: true },
  { s: 'waiting', reason: 'nextRound' },
];

const HOST: HostMsg[] = [
  { t: 'joined', name: 'Livia' },
  { t: 'outdated', proto: 2 },
  ...SCREENS.map((screen) => ({ t: 'screen', screen }) as const),
  {
    t: 'stallView',
    view: { stall: 7, canopy: 'spices', title: 'Spices', counter: [tile], shelf: [] },
  },
  { t: 'stallView', view: null },
  { t: 'holdStart', id: 1, kind: 'grab', durationMs: 600, elapsedMs: 40, stall: 7, slot: 0 },
  { t: 'holdStart', id: 2, kind: 'pickpocket', durationMs: 2000, elapsedMs: 0 },
  { t: 'holdEnd', id: 1, result: 'caught' },
  { t: 'toast', kind: 'lucky', text: 'Lucky! +18 d', amount: 18 },
  { t: 'bag', bag: 20, pack: [item], weight: 1, cap: 15 },
  { t: 'outfit', outfit },
  { t: 'context', main: 'pickpocket', tossReadyInMs: 0, tip: true, catch: true },
  { t: 'context', main: null, tossReadyInMs: 3000, tip: false, catch: false },
  {
    t: 'dialog',
    open: true,
    buy: [{ item: 'knife', name: 'Knife', price: 10 }],
    ask: [{ slot: 4, item: 'gladius', name: 'Gladius' }],
  },
  {
    t: 'sellSheet',
    sheet: { to: 17, wants: ['knife'], offers: [{ item: 'knife', name: 'Knife', price: 12 }] },
  },
  { t: 'sellSheet', sheet: null },
  { t: 'pawnSheet', sheet: { offers: [], endsInMs: 12_000 } },
  { t: 'caught', pot: 7, by: 'guard' },
  {
    t: 'tipSnapshot',
    snapshot: { id: 9, w: 960, h: 540, mime: 'image/jpeg', bytes: 51_000 },
    hits: [{ targetId: 0, x: 10, y: 20, w: 30, h: 60 }],
    fee: 10,
    endsInMs: 20_000,
  },
  { t: 'tipResult', result: 'missed', fee: 10 },
  { t: 'chunk', blobId: 9, i: 0, n: 5, b64: 'AAAA' },
];

const JUNK: unknown[] = [
  null,
  undefined,
  42,
  'join',
  [],
  {},
  { t: 'nope' },
  { t: 'join' },
  { t: 'join', name: 'x', proto: -1 },
  { t: 'input', x: 101, y: 0, bits: 0 },
  { t: 'input', x: 0.5, y: 0, bits: 0 },
  { t: 'input', x: 0, y: 0, bits: 8 },
  { t: 'grab', stall: -1, slot: 0 },
  { t: 'dialog', pick: 'ask' },
  { t: 'sell', item: 'knife', to: 'npc' },
  { t: 'color', color: 'teal' },
  { t: 'leader', action: 'kick' },
  { t: 'screen', screen: { s: 'play' } },
  {
    t: 'screen',
    screen: { s: 'roundStart', round: 1, rounds: 3, outfits: [{ tunic: 'neon' }], endsInMs: 1 },
  },
  { t: 'holdEnd', id: 1, result: 'won' },
  { t: 'context', main: 'steal', tossReadyInMs: 0, tip: true, catch: true },
  { t: 'chunk', blobId: 1, i: 3, n: 3, b64: '' },
  { t: 'tipResult', result: 'landed' },
];

describe('messages', () => {
  it('constants', () => {
    expect(GAME_ID).toBe('thieves-forum');
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('the phone guard accepts every phone message and the host guard rejects them', () => {
    for (const m of PHONE) {
      expect(isPhoneMsg(m), JSON.stringify(m)).toBe(true);
      if (m.t !== 'join') expect(isHostMsg(m), JSON.stringify(m)).toBe(false);
    }
  });

  it('the host guard accepts every host message and the phone guard rejects them', () => {
    for (const m of HOST) {
      expect(isHostMsg(m), JSON.stringify(m)).toBe(true);
      expect(isPhoneMsg(m), JSON.stringify(m)).toBe(false);
    }
  });

  it('covers every screen kind', () => {
    expect(SCREENS.map((s) => s.s)).toEqual([
      'joining',
      'lobby',
      'rules',
      'roundStart',
      'play',
      'handsUp',
      'stocks',
      'walkOn',
      'matchEnd',
      'waiting',
    ]);
  });

  it('rejects junk', () => {
    for (const j of JUNK) {
      expect(isPhoneMsg(j), JSON.stringify(j)).toBe(false);
      expect(isHostMsg(j), JSON.stringify(j)).toBe(false);
    }
  });

  it('cleanName trims and caps', () => {
    expect(cleanName('  Gaius   Julius ')).toBe('Gaius Julius');
    expect(cleanName('x'.repeat(40))).toHaveLength(NAME_MAX);
    expect(cleanName('   ')).toBe('');
  });
});
