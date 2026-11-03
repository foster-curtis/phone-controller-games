// Guards for the phone↔host messages (SPEC §7.3, §7.4): every sample passes, junk fails.
import { describe, expect, it } from 'vitest';
import { CHUNK_B64_MAX, RELAY_MAX_PAYLOAD, isAck, isChunk } from '../blob-transfer/types';
import {
  EMOJI,
  GAME_ID,
  LEADER_ACTIONS,
  MAX_SEATS,
  NAME_MAX,
  type PhoneMsg,
  type Screen,
  isHostMsg,
  isPhoneMsg,
} from '../messages';
import { parseSeatId, seatId, seatKeysStorageKey } from '../seats/types';

const samples: PhoneMsg[] = [
  { t: 'hello', seats: [] },
  {
    t: 'hello',
    seats: [
      { seat: 0, seatKey: 'k0', name: 'Ana' },
      { seat: 1, seatKey: 'k1', name: 'Leo' },
    ],
  },
  { t: 'profile', seat: 0, name: 'Ana' },
  { t: 'addSeat', name: 'Mia', seatKey: 'abc' },
  { t: 'removeSeat', seat: 1 },
  { t: 'seatConfirm', seat: 2 },
  { t: 'camera', ok: true },
  { t: 'camera', ok: false },
  { t: 'ready', ready: true },
  ...LEADER_ACTIONS.map((action) => ({ t: 'leader' as const, action })),
  { t: 'leader', action: 'remove', playerId: 'p3#1' },
  { t: 'shootReady' },
  { t: 'shot', r: 2, photo: 0, at: 1234.5, aspect: 0.75 },
  { t: 'chunk', r: 2, photo: 0, i: 0, n: 3, b64: 'A'.repeat(CHUNK_B64_MAX) },
  { t: 'shootDone', r: 2, count: 15 },
  { t: 'view', photo: 4 },
  { t: 'tag', photo: 4, tagId: 't1', x: 0.5, y: 0, playerId: 'p2#0' },
  { t: 'tag', photo: 4, tagId: 't2', x: 1, y: 0.3, playerId: null },
  { t: 'untag', photo: 4, tagId: 't1' },
  { t: 'finishReview' },
  ...EMOJI.map((_, i) => ({ t: 'emoji' as const, i: i as 0 })),
  { t: 'leave' },
];

const junk: unknown[] = [
  null,
  undefined,
  42,
  'leave',
  [],
  {},
  { t: 'nope' },
  { t: 'hello' },
  { t: 'hello', seats: [{ seat: 0, seatKey: '', name: 'Ana' }] },
  {
    t: 'hello',
    seats: Array.from({ length: MAX_SEATS + 1 }, (_, seat) => ({ seat, seatKey: 'k', name: 'A' })),
  },
  { t: 'profile', seat: 0, name: '' },
  { t: 'profile', seat: 0, name: '   ' },
  { t: 'profile', seat: 0, name: 'x'.repeat(NAME_MAX + 1) },
  { t: 'profile', seat: -1, name: 'Ana' },
  { t: 'profile', seat: MAX_SEATS, name: 'Ana' },
  { t: 'addSeat', name: 'Mia' },
  { t: 'removeSeat', seat: 0.5 },
  { t: 'camera', ok: 'yes' },
  { t: 'ready' },
  { t: 'leader', action: 'explode' },
  { t: 'leader', action: 'remove', playerId: 'p3' },
  { t: 'leader', action: 'remove' },
  { t: 'shot', r: 2, photo: 0, at: 1 },
  { t: 'shot', r: 2, photo: 0, at: 1, aspect: 0 },
  { t: 'shot', r: -1, photo: 0, at: 1, aspect: 1 },
  { t: 'chunk', r: 2, photo: 0, i: 3, n: 3, b64: 'A' },
  { t: 'chunk', r: 2, photo: 0, i: 0, n: 0, b64: '' },
  { t: 'chunk', r: 2, photo: 0, i: 0, n: 1, b64: 'A'.repeat(CHUNK_B64_MAX + 1) },
  { t: 'shootDone', r: 2 },
  { t: 'view', photo: '1' },
  { t: 'tag', photo: 0, tagId: 't', x: 1.1, y: 0, playerId: null },
  { t: 'tag', photo: 0, tagId: 't', x: 0, y: 0, playerId: 'p2' },
  { t: 'tag', photo: 0, tagId: 't', x: 0, y: 0 },
  { t: 'untag', photo: 0 },
  { t: 'emoji', i: EMOJI.length },
  { t: 'emoji', i: 1.5 },
];

describe('isPhoneMsg', () => {
  it('names the relay namespace', () => {
    expect(GAME_ID).toBe('say-cheese');
  });

  it.each(samples.map((m) => [JSON.stringify(m).slice(0, 60), m]))('accepts %s', (_, m) => {
    expect(isPhoneMsg(m)).toBe(true);
  });

  it.each(junk.map((m) => [JSON.stringify(m)?.slice(0, 60) ?? String(m), m]))(
    'rejects %s',
    (_, m) => {
      expect(isPhoneMsg(m)).toBe(false);
    },
  );
});

describe('blob-transfer guards', () => {
  it('a full chunk envelope fits the relay payload', () => {
    const envelope = JSON.stringify({
      t: 'send',
      to: 'host',
      data: { t: 'chunk', r: 9999, photo: 14, i: 99, n: 100, b64: 'A'.repeat(CHUNK_B64_MAX) },
    });
    expect(envelope.length).toBeLessThan(RELAY_MAX_PAYLOAD);
  });

  it('acks', () => {
    expect(isAck({ t: 'photoAck', r: 1, photo: 3 })).toBe(true);
    expect(isAck({ t: 'photoAck', r: 1 })).toBe(false);
    expect(isChunk({ t: 'photoAck', r: 1, photo: 3 })).toBe(false);
  });
});

describe('isHostMsg', () => {
  const screen: Screen = {
    kind: 'rules',
    card: 0,
    cards: 5,
    leaderName: 'Ana',
    isLeader: false,
    seats: [{ seat: 0, name: 'Leo', color: 'jade' }],
    canEmoji: false,
  };

  it('accepts screens and acks', () => {
    expect(isHostMsg({ t: 'screen', screen })).toBe(true);
    expect(isHostMsg({ t: 'photoAck', r: 0, photo: 0 })).toBe(true);
  });

  it('rejects junk', () => {
    expect(isHostMsg({ t: 'screen', screen: { kind: 'nope' } })).toBe(false);
    expect(isHostMsg({ t: 'screen' })).toBe(false);
    expect(isHostMsg(null)).toBe(false);
  });
});

describe('seat ids', () => {
  it('round-trips', () => {
    expect(seatId('p3', 1)).toBe('p3#1');
    expect(parseSeatId('p3#1')).toEqual({ playerId: 'p3', seat: 1 });
    expect(parseSeatId('p3')).toBeNull();
    expect(parseSeatId('#1')).toBeNull();
    expect(parseSeatId('p3#')).toBeNull();
    expect(seatKeysStorageKey('ABCD')).toBe('say-cheese:seats:ABCD');
  });
});
