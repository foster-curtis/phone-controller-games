import { describe, expect, it } from 'vitest';
import { connect, createRoom, joinRoom, startRelay } from './helpers';

describe('robustness', () => {
  it('malformed JSON → error bad-request and the socket stays open', async () => {
    const relay = await startRelay();
    const c = await connect(relay);
    c.sendRaw('{not json');
    expect(await c.next('error')).toMatchObject({ code: 'bad-request' });
    c.sendRaw('42');
    expect(await c.next('error')).toMatchObject({ code: 'bad-request' });
    expect(c.isClosed).toBe(false);
    c.send({ t: 'create', game: 'g', maxPlayers: 4 });
    expect(await c.next('created')).toMatchObject({ t: 'created' });
  });

  it('unknown t → error bad-request and the socket stays open', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    host.send({ t: 'explode' });
    expect(await host.next('error')).toMatchObject({ code: 'bad-request' });
    const a = await joinRoom(relay, code);
    a.phone.send({ t: 'nope' });
    expect(await a.phone.next('error')).toMatchObject({ code: 'bad-request' });
    a.phone.send({ t: 'send', data: 1 });
    expect(await host.next('msg')).toMatchObject({ data: 1 });
  });

  it('invalid fields → bad-request', async () => {
    const relay = await startRelay();
    const c = await connect(relay);
    c.send({ t: 'create', game: '', maxPlayers: 4 });
    expect(await c.next('error')).toMatchObject({ code: 'bad-request' });
    c.send({ t: 'create', game: 'g', maxPlayers: 'many' });
    expect(await c.next('error')).toMatchObject({ code: 'bad-request' });
    c.send({ t: 'join', game: 'g', code: 'ABCD' });
    expect(await c.next('error')).toMatchObject({ code: 'bad-request' });
  });

  it('a payload larger than maxPayloadBytes closes the socket', async () => {
    const relay = await startRelay({ maxPayloadBytes: 1024 });
    const { host, code } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    await host.next('peer');
    a.phone.send({ t: 'send', data: 'x'.repeat(2048) });
    const { code: closeCode } = await a.phone.closed;
    expect(closeCode).toBe(1009);
    expect(await host.next('peer')).toMatchObject({ event: 'left', playerId: a.playerId });
  });

  it('a phone sending host-only messages (create/lock/kick) → error bad-request', async () => {
    const relay = await startRelay();
    const { code } = await createRoom(relay);
    const a = await joinRoom(relay, code);
    for (const msg of [
      { t: 'create', game: 'g', maxPlayers: 4 },
      { t: 'lock' },
      { t: 'unlock' },
      { t: 'kick', playerId: a.playerId },
      { t: 'reclaim', hostToken: 'x' },
    ]) {
      a.phone.send(msg);
      expect(await a.phone.next('error')).toMatchObject({ code: 'bad-request' });
    }
    expect(a.phone.isClosed).toBe(false);
  });

  it('a host sending join, or an unbound socket sending send/lock → bad-request', async () => {
    const relay = await startRelay();
    const { host, code } = await createRoom(relay);
    host.send({ t: 'join', game: 'test-game', code, playerKey: 'k' });
    expect(await host.next('error')).toMatchObject({ code: 'bad-request' });
    const c = await connect(relay);
    c.send({ t: 'send', data: 1 });
    expect(await c.next('error')).toMatchObject({ code: 'bad-request' });
    c.send({ t: 'lock' });
    expect(await c.next('error')).toMatchObject({ code: 'bad-request' });
  });

  it('GET /healthz → 200', async () => {
    const relay = await startRelay();
    const res = await fetch(`http://127.0.0.1:${relay.port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    const missing = await fetch(`http://127.0.0.1:${relay.port}/nope`);
    expect(missing.status).toBe(404);
  });
});
