import { describe, expect, it } from 'vitest';
import { GAME, connect, createRoom, joinRoom, sleep, startRelay } from './helpers';

describe('lock / unlock', () => {
  it('locked: a new join gets room-locked while a token reconnect succeeds', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code, 'key-a');
    host.send({ t: 'lock' });
    await sleep(30);

    const newcomer = await connect(relay);
    newcomer.send({ t: 'join', game: GAME, code, playerKey: 'key-new' });
    expect(await newcomer.next('error')).toMatchObject({ code: 'room-locked' });

    a.phone.close();
    await a.phone.closed;
    const again = await joinRoom(relay, code, 'key-a', a.token);
    expect(again.playerId).toBe(a.playerId);
  });

  it('unlock lets new joins in again', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    host.send({ t: 'lock' });
    await sleep(30);
    const p = await connect(relay);
    p.send({ t: 'join', game: GAME, code, playerKey: 'k' });
    expect(await p.next('error')).toMatchObject({ code: 'room-locked' });

    host.send({ t: 'unlock' });
    await sleep(30);
    p.send({ t: 'join', game: GAME, code, playerKey: 'k' });
    expect(await p.next('joined')).toMatchObject({ t: 'joined' });
  });
});

describe('kick', () => {
  it('kick → kicked + socket closed + the token no longer reclaims the slot', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay, 1);
    const a = await joinRoom(relay, code, 'key-a');
    await host.next('peer');

    host.send({ t: 'kick', playerId: a.playerId });
    expect(await a.phone.next('kicked')).toEqual({ t: 'kicked' });
    await a.phone.closed;
    expect(a.phone.isClosed).toBe(true);

    // The slot is free (maxPlayers 1) and the old token gets a fresh identity.
    const again = await joinRoom(relay, code, 'key-a', a.token);
    expect(again.playerId).not.toBe(a.playerId);
    expect(again.token).not.toBe(a.token);
    expect(await host.next('peer')).toMatchObject({ event: 'joined', playerId: again.playerId });
  });
});
