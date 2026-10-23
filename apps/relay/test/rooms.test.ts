import { describe, expect, it } from 'vitest';
import { HOST_SENDER, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@pcg/net-client';
import { generateCode } from '../src/codes';
import { GAME, connect, createRoom, joinRoom, startRelay } from './helpers';

describe('room codes', () => {
  it('created code has 4 chars from ROOM_CODE_ALPHABET', async () => {
    const relay = await startRelay();
    for (let i = 0; i < 5; i++) {
      const { code, hostToken } = await createRoom(relay);
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(ROOM_CODE_LENGTH).toBe(4);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
      expect(hostToken.length).toBeGreaterThan(10);
    }
  });

  it('generateCode retries on collision', () => {
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4];
    let i = 0;
    const taken = new Set(['AAAA']);
    const code = generateCode(
      (c) => taken.has(c),
      () => seq[i++]! / ROOM_CODE_ALPHABET.length,
    );
    expect(code).toBe('BCDE');
    expect(i).toBe(12);
  });

  it('codes are scoped per game: join with the wrong game gets no-room', async () => {
    const relay = await startRelay();
    const { code } = await createRoom(relay, 8, 'game-a');
    const phone = await connect(relay);
    phone.send({ t: 'join', game: 'game-b', code, playerKey: 'k' });
    expect(await phone.next('error')).toMatchObject({ code: 'no-room' });
    phone.send({ t: 'join', game: 'game-a', code, playerKey: 'k' });
    expect(await phone.next('joined')).toMatchObject({ t: 'joined' });
  });

  it('unknown code gets no-room', async () => {
    const relay = await startRelay();
    const phone = await connect(relay);
    phone.send({ t: 'join', game: GAME, code: 'ZZZZ', playerKey: 'k' });
    expect(await phone.next('error')).toMatchObject({ code: 'no-room' });
  });
});

describe('join and forwarding', () => {
  it('join → joined, and the host gets peer joined with the playerKey', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const { playerId, token } = await joinRoom(relay, code, 'my-key');
    expect(playerId).not.toBe(HOST_SENDER);
    expect(token.length).toBeGreaterThan(10);
    expect(await host.next('peer')).toEqual({
      t: 'peer',
      event: 'joined',
      playerId,
      playerKey: 'my-key',
    });
  });

  it("a phone's send reaches the host with the relay-assigned from (spoofed from ignored)", async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const { phone, playerId } = await joinRoom(relay, code);
    phone.send({ t: 'send', from: 'host', to: 'p999', data: { x: 1 } });
    expect(await host.next('msg')).toEqual({ t: 'msg', from: playerId, data: { x: 1 } });
  });

  it('host send with to reaches only that phone', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    const b = await joinRoom(relay, code);
    host.send({ t: 'send', to: b.playerId, data: 'hi-b' });
    expect(await b.phone.next('msg')).toEqual({ t: 'msg', from: HOST_SENDER, data: 'hi-b' });
    expect((await a.phone.drain()).filter((m) => m.t === 'msg')).toEqual([]);
  });

  it('broadcast reaches all phones and not the host', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    const b = await joinRoom(relay, code);
    await host.drain(50);
    host.send({ t: 'send', data: [1, 2] });
    expect(await a.phone.next('msg')).toEqual({ t: 'msg', from: HOST_SENDER, data: [1, 2] });
    expect(await b.phone.next('msg')).toEqual({ t: 'msg', from: HOST_SENDER, data: [1, 2] });
    expect((await host.drain()).filter((m) => m.t === 'msg')).toEqual([]);
  });

  it('room-full at maxPlayers', async () => {
    const relay = await startRelay();
    const { code } = await createRoom(relay, 2);
    await joinRoom(relay, code);
    await joinRoom(relay, code);
    const third = await connect(relay);
    third.send({ t: 'join', game: GAME, code, playerKey: 'k3' });
    expect(await third.next('error')).toMatchObject({ code: 'room-full' });
  });

  it('maxPlayers is clamped to 1..16', async () => {
    const relay = await startRelay();
    const { code } = await createRoom(relay, 0);
    await joinRoom(relay, code);
    const second = await connect(relay);
    second.send({ t: 'join', game: GAME, code, playerKey: 'k2' });
    expect(await second.next('error')).toMatchObject({ code: 'room-full' });
  });
});
