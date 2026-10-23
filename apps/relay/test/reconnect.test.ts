import { describe, expect, it } from 'vitest';
import { FAST, createRoom, joinRoom, sleep, startRelay } from './helpers';

describe('phone reconnect', () => {
  it('phone drop → host gets peer left', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code, 'key-a');
    await host.next('peer');
    a.phone.close();
    expect(await host.next('peer')).toEqual({
      t: 'peer',
      event: 'left',
      playerId: a.playerId,
      playerKey: 'key-a',
    });
  });

  it('token rejoin inside the window → same playerId + peer rejoined', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code, 'key-a');
    await host.next('peer');
    a.phone.close();
    await host.next('peer');

    const again = await joinRoom(relay, code, 'key-a', a.token);
    expect(again.playerId).toBe(a.playerId);
    expect(await host.next('peer')).toEqual({
      t: 'peer',
      event: 'rejoined',
      playerId: a.playerId,
      playerKey: 'key-a',
    });
  });

  it('a token rejoin while the old socket is still open takes over the slot', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code, 'key-a');
    await host.next('peer');
    const again = await joinRoom(relay, code, 'key-a', a.token);
    expect(again.playerId).toBe(a.playerId);
    expect(await host.next('peer')).toMatchObject({ event: 'rejoined' });
    await a.phone.closed;
    host.send({ t: 'send', to: a.playerId, data: 1 });
    expect(await again.phone.next('msg')).toMatchObject({ data: 1 });
  });

  it('after the window → new playerId + peer joined', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code, 'key-a');
    await host.next('peer');
    a.phone.close();
    await host.next('peer');
    await sleep(FAST.playerReconnectMs! + 100);

    const again = await joinRoom(relay, code, 'key-a', a.token);
    expect(again.playerId).not.toBe(a.playerId);
    expect(await host.next('peer')).toEqual({
      t: 'peer',
      event: 'joined',
      playerId: again.playerId,
      playerKey: 'key-a',
    });
  });
});
