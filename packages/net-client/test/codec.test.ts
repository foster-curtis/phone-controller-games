import { describe, expect, it } from 'vitest';
import { decode, encode } from '../src/codec';
import type { ClientToRelay, RelayToClient } from '../src/protocol';

describe('codec', () => {
  it('round-trips every relay → client message', () => {
    const msgs: RelayToClient[] = [
      { t: 'created', code: 'ABCD', hostToken: 'h1' },
      {
        t: 'reclaimed',
        code: 'ABCD',
        roster: [{ playerId: 'p1', playerKey: 'k1', connected: false }],
      },
      { t: 'joined', playerId: 'p1', token: 't1' },
      { t: 'peer', event: 'rejoined', playerId: 'p1', playerKey: 'k1' },
      { t: 'msg', from: 'host', data: { screen: { kind: 'lobby' }, n: [1, 2] } },
      { t: 'host', status: 'away' },
      { t: 'kicked' },
      { t: 'error', code: 'room-locked', message: 'locked' },
    ];
    for (const msg of msgs) {
      expect(decode(JSON.stringify(msg))).toEqual({ ok: true, msg });
    }
  });

  it('encodes client → relay messages as JSON', () => {
    const msgs: ClientToRelay[] = [
      { t: 'create', game: 'g', maxPlayers: 8 },
      { t: 'join', game: 'g', code: 'ABCD', playerKey: 'k', token: 't' },
      { t: 'send', to: 'p1', data: [1, -2, 3, 4, 5] },
      { t: 'kick', playerId: 'p1' },
    ];
    for (const msg of msgs) expect(JSON.parse(encode(msg))).toEqual(msg);
  });

  it('returns an error instead of throwing on non-JSON', () => {
    expect(() => decode('not json {')).not.toThrow();
    const res = decode('not json {');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/JSON/);
  });

  it('rejects non-objects, unknown types, missing fields and binary frames', () => {
    for (const raw of ['42', 'null', '[1,2]', '"x"', '{"t":"nope"}', '{}', '{"t":"joined"}']) {
      expect(decode(raw).ok).toBe(false);
    }
    expect(decode('{"t":"reclaimed","code":"ABCD"}').ok).toBe(false);
    expect(decode(new ArrayBuffer(4)).ok).toBe(false);
  });
});
