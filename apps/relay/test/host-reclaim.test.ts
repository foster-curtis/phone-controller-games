import { describe, expect, it } from 'vitest';
import { FAST, GAME, connect, createRoom, joinRoom, sleep, startRelay } from './helpers';

describe('host reclaim', () => {
  it('host drop → phones get host away', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    const b = await joinRoom(relay, code);
    host.close();
    expect(await a.phone.next('host')).toEqual({ t: 'host', status: 'away' });
    expect(await b.phone.next('host')).toEqual({ t: 'host', status: 'away' });
  });

  it('reclaim inside the window → reclaimed with roster + phones get host back', async () => {
    const relay = await startRelay();
    const { host, code, hostToken } = await createRoom(relay);
    const a = await joinRoom(relay, code, 'key-a');
    const b = await joinRoom(relay, code, 'key-b');
    b.phone.close();
    await host.next('peer');
    host.close();
    await a.phone.next('host');

    const host2 = await connect(relay);
    host2.send({ t: 'reclaim', hostToken });
    expect(await host2.next('reclaimed')).toEqual({
      t: 'reclaimed',
      code,
      roster: [
        { playerId: a.playerId, playerKey: 'key-a', connected: true },
        { playerId: b.playerId, playerKey: 'key-b', connected: false },
      ],
    });
    expect(await a.phone.next('host')).toEqual({ t: 'host', status: 'back' });

    // The reclaimed host relays as before.
    a.phone.send({ t: 'send', data: 'yo' });
    expect(await host2.next('msg')).toEqual({ t: 'msg', from: a.playerId, data: 'yo' });
  });

  it('after the window → phones get error room-closed and are closed; the code returns no-room', async () => {
    const relay = await startRelay();
    const { host, code, hostToken } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    host.close();
    await a.phone.next('host');
    await sleep(FAST.hostReclaimMs! + 50);
    expect(await a.phone.next('error')).toMatchObject({ code: 'room-closed' });
    await a.phone.closed;

    const p = await connect(relay);
    p.send({ t: 'join', game: GAME, code, playerKey: 'k' });
    expect(await p.next('error')).toMatchObject({ code: 'no-room' });

    const host2 = await connect(relay);
    host2.send({ t: 'reclaim', hostToken });
    expect(await host2.next('error')).toMatchObject({ code: 'no-room' });
  });

  it('a phone joining while the host is away is admitted and told the host is away', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    host.close();
    await host.closed;
    await sleep(30);
    const a = await joinRoom(relay, code);
    expect(await a.phone.next('host')).toEqual({ t: 'host', status: 'away' });
  });
});
