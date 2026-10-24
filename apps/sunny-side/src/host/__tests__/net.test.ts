// HostClient ↔ match wiring with a fake relay client and the real match + sim.
import type { HostClient, HostRoom, PeerChange } from '@pcg/net-client';
import { describe, expect, it } from 'vitest';
import type { HostMsg, Screen } from '../../shared/messages';
import { createGameRuntime } from '../game';
import { createMatch } from '../match';
import { createHostNet, type HostClientLike } from '../net';
import { createSim } from '../sim';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

function setup() {
  const peerCbs: ((c: PeerChange) => void)[] = [];
  const msgCbs: ((from: string, data: unknown) => void)[] = [];
  const roomCbs: ((r: HostRoom) => void)[] = [];
  const sent: { msg: HostMsg; to?: string }[] = [];
  const kicked: string[] = [];
  const client: HostClientLike = {
    code: 'ABCD',
    status: 'open',
    send: (data, to) => void sent.push({ msg: data as HostMsg, to }),
    kick: (id) => void kicked.push(id),
    onPeer: (cb) => (peerCbs.push(cb), () => {}),
    onMessage: (cb) => (msgCbs.push(cb), () => {}),
    onRoom: (cb) => (roomCbs.push(cb), () => {}),
    onStatus: () => () => {},
  };
  const net = createHostNet(client);
  const storage = memoryStorage();
  const match = createMatch({ sim: createSim({ seed: 1 }), ...net.deps, storage });
  const newRooms: HostRoom[] = [];
  net.attach(match, (r) => newRooms.push(r));
  const peer = (event: PeerChange['event'], playerId: string) =>
    peerCbs.forEach((cb) => cb({ event, playerId, playerKey: `key-${playerId}` }));
  const message = (from: string, data: unknown) => msgCbs.forEach((cb) => cb(from, data));
  const room = (r: HostRoom) => roomCbs.forEach((cb) => cb(r));
  const lastScreen = (to: string): Screen | undefined =>
    [...sent].reverse().find((s) => s.to === to || s.to === undefined)?.msg.screen;
  return { match, sent, kicked, peer, message, room, lastScreen, newRooms, storage };
}

const flush = () => new Promise<void>((r) => queueMicrotask(r));

describe('createHostNet', () => {
  it('feeds relay peers and messages to the match', async () => {
    const t = setup();
    t.peer('joined', 'p1');
    t.peer('joined', 'p2');
    t.message('p1', { t: 'profile', name: 'Ann', color: 'crimson' });
    t.message('p2', { t: 'profile', name: 'Bob', color: 'cobalt' });
    await flush();
    const v = t.match.view();
    expect(v.players.map((p) => [p.id, p.name, p.color])).toEqual([
      ['p1', 'Ann', 'crimson'],
      ['p2', 'Bob', 'cobalt'],
    ]);
    expect(v.leaderId).toBe('p1');
  });

  it('stamps the leader name on every screen and refreshes it on handoff', async () => {
    const t = setup();
    t.peer('joined', 'p1');
    t.peer('joined', 'p2');
    t.peer('joined', 'p3');
    t.message('p1', { t: 'profile', name: 'Ann', color: 'crimson' });
    t.message('p2', { t: 'profile', name: 'Bob', color: 'cobalt' });
    t.message('p3', { t: 'profile', name: 'Cy', color: 'jade' });
    await flush();
    expect(t.lastScreen('p3')).toMatchObject({ kind: 'lobby', isLeader: false, leaderName: 'Ann' });
    expect(t.lastScreen('p1')).toMatchObject({ kind: 'lobby', isLeader: true, leaderName: 'Ann' });

    // Ann leaves the lobby: Bob leads, and Cy's "Waiting for" follows.
    t.peer('left', 'p1');
    await flush();
    expect(t.match.view().leaderId).toBe('p2');
    expect(t.lastScreen('p2')).toMatchObject({ isLeader: true, leaderName: 'Bob' });
    expect(t.lastScreen('p3')).toMatchObject({ isLeader: false, leaderName: 'Bob' });
  });

  it('restores on a reclaimed room and reports a brand-new room after the first', () => {
    const t = setup();
    t.room({ code: 'ABCD', reclaimed: false, roster: [] });
    expect(t.newRooms).toHaveLength(0);
    t.room({
      code: 'ABCD',
      reclaimed: true,
      roster: [{ playerId: 'p1', playerKey: 'key-p1', connected: true }],
    });
    expect(t.match.view().players.map((p) => p.id)).toEqual(['p1']);
    t.room({ code: 'WXYZ', reclaimed: false, roster: [] });
    expect(t.newRooms.map((r) => r.code)).toEqual(['WXYZ']);
  });

  it('passes kicks through', () => {
    const t = setup();
    t.peer('joined', 'p1');
    t.message('p1', { t: 'leave' });
    expect(t.kicked).toEqual(['p1']);
  });

  it('leader remove of an away player issues a relay kick and resends screens (C3 note)', async () => {
    const t = setup();
    t.peer('joined', 'p1');
    t.peer('joined', 'p2');
    t.peer('joined', 'p3');
    t.peer('left', 'p3'); // tab closed: away, still holding a spot and a color
    await flush();
    t.message('p1', { t: 'leader', action: 'remove', playerId: 'p3' });
    await flush();
    expect(t.kicked).toEqual(['p3']);
    expect(t.match.view().players.map((p) => p.id)).toEqual(['p1', 'p2']);
    for (const id of ['p1', 'p2']) {
      expect(t.lastScreen(id)?.standings.map((s) => s.playerId)).toEqual(['p1', 'p2']);
    }
  });
});

describe('GameRuntime.removePlayer', () => {
  it('routes to match.hostAction remove and kicks through the relay client', () => {
    const peerCbs: ((c: PeerChange) => void)[] = [];
    const kicked: string[] = [];
    const client = {
      code: 'ABCD',
      status: 'open',
      send: () => {},
      kick: (id: string) => void kicked.push(id),
      onPeer: (cb: (c: PeerChange) => void) => (peerCbs.push(cb), () => {}),
      onMessage: () => () => {},
      onRoom: () => () => {},
      onStatus: () => () => {},
      close: () => {},
    } as unknown as HostClient;
    const rt = createGameRuntime({ client, storage: memoryStorage() });
    for (const id of ['p1', 'p2', 'p3']) {
      peerCbs.forEach((cb) => cb({ event: 'joined', playerId: id, playerKey: `key-${id}` }));
    }
    peerCbs.forEach((cb) => cb({ event: 'left', playerId: 'p2', playerKey: 'key-p2' }));
    rt.removePlayer('p2');
    expect(kicked).toEqual(['p2']);
    expect(rt.view().players.map((p) => p.id)).toEqual(['p1', 'p3']);
    rt.destroy();
  });
});
