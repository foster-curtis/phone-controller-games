// Late rejoin, Leave and Remove (SPEC §6.3, §6.3.1, §6.5): a phone back under a new relay id is
// matched by player key (seat 0 = relay key, other seats by `hello` seat keys) and gets every seat
// back; Leave and leader/host Remove are full removals.
import { describe, expect, it } from 'vitest';
import { lobbyOf, started } from './harness';

/** A started match on a seed whose first photographer isn't `phone`. */
function startedNotShooting(phone: string, n = 4) {
  for (let seed = 1; seed < 50; seed++) {
    const h = started(n, seed);
    if (h.phPhone() !== phone) return h;
  }
  throw new Error('no seed');
}

describe('late rejoin', () => {
  it('after the relay window, the player key restores name, color, score and turn', () => {
    const h = startedNotShooting('p2');
    const before = { ...h.m.state.players.find((p) => p.id === 'p2#0')! };
    h.playRound([['p2#0']]);
    const score = h.m.state.players.find((p) => p.id === 'p2#0')!.score;
    h.disconnect('p2');
    // The tab was killed: a new relay id, the same key.
    h.d({ type: 'peer', event: 'joined', playerId: 'p9', playerKey: 'k-p2' });
    const p = h.m.state.players.find((q) => q.id === 'p2#0')!;
    expect(p).toMatchObject({
      phoneId: 'p9',
      name: before.name,
      color: before.color,
      score,
      connected: true,
      camera: 'ok',
      spectator: false,
    });
    expect(h.m.state.players.filter((q) => !q.left)).toHaveLength(4);
    expect(h.m.phoneIds()).not.toContain('p2');
    expect(h.m.screenFor('p9').seats).toEqual([
      { seat: 0, name: before.name, color: before.color },
    ]);
    // Still has a turn: the queue holds the same seat id.
    expect([h.photographer().id, ...h.m.state.queue]).toContain('p2#0');
  });

  it('restores every seat of a shared phone: seat 0 by the relay key, the others from hello', () => {
    const h = lobbyOf(3);
    h.msg('p3', { t: 'addSeat', name: 'Kid', seatKey: 'kid-key' });
    h.msg('p3', { t: 'addSeat', name: 'Tot', seatKey: 'tot-key' });
    h.msg('p1', { t: 'leader', action: 'start' });
    h.msg('p1', { t: 'leader', action: 'skip' });
    const ids = h.m.state.players.filter((p) => p.phoneId === 'p3').map((p) => p.id);
    h.disconnect('p3');
    h.d({ type: 'peer', event: 'joined', playerId: 'p7', playerKey: 'k-p3' });
    h.msg('p7', {
      t: 'hello',
      seats: [
        { seat: 0, seatKey: 'k-p3', name: 'P3' },
        { seat: 1, seatKey: 'kid-key', name: 'Kid' },
        { seat: 2, seatKey: 'tot-key', name: 'Tot' },
      ],
    });
    const now = h.m.state.players.filter((p) => p.phoneId === 'p7');
    expect(now.map((p) => p.id)).toEqual(ids);
    expect(now.map((p) => p.name)).toEqual(['P3', 'Kid', 'Tot']);
    expect(now.every((p) => !p.spectator && p.connected)).toBe(true);
    expect(h.m.state.players.filter((p) => !p.left)).toHaveLength(5);
  });

  it('a photographer who rejoins by key keeps shooting from the new phone', () => {
    const h = started(3);
    const old = h.phPhone();
    const r = h.m.state.round!.r;
    h.msg(old, { t: 'shootReady' });
    h.timer('scatter');
    h.msg(old, { t: 'shot', r, photo: 0, at: 0, aspect: 1 });
    h.disconnect(old);
    h.d({ type: 'peer', event: 'joined', playerId: 'p8', playerKey: `k-${old}` });
    expect(h.phPhone()).toBe('p8');
    h.msg('p8', { t: 'shot', r, photo: 1, at: 1, aspect: 1 });
    expect(h.m.state.round!.shots).toBe(2);
    h.d({ type: 'photo', r, photo: 0, url: 'blob:0' });
    h.d({ type: 'photo', r, photo: 1, url: 'blob:1' });
    h.msg('p8', { t: 'shootDone', r, count: 2 });
    expect(h.m.state.phase).toBe('review');
    expect(h.m.screenFor('p8')).toMatchObject({ kind: 'review', role: 'photographer' });
  });

  it('a leader phone rejoining by key after a handoff does not get leadership back', () => {
    const h = startedNotShooting('p1');
    h.disconnect('p1');
    expect(h.m.state.leader).toBe('p2');
    h.d({ type: 'peer', event: 'joined', playerId: 'p9', playerKey: 'k-p1' });
    expect(h.m.state.leader).toBe('p2');
    expect(h.m.screenFor('p9').isLeader).toBe(false);
  });

  it('a key that matches nobody is a new phone (lobby join as usual)', () => {
    const h = lobbyOf(3);
    h.d({ type: 'peer', event: 'joined', playerId: 'p9', playerKey: 'fresh' });
    expect(h.m.state.players.filter((p) => p.phoneId === 'p9')).toHaveLength(0);
  });
});

describe('leave and remove', () => {
  it('leave removes from queue and standings; the photographer keeps the −1s', () => {
    const h = startedNotShooting('p2');
    h.playRound([['p2#0'], ['p2#0']]);
    const ph = h.photographer();
    expect(ph.score).toBe(-2);
    h.ctl('next');
    h.msg('p2', { t: 'leave' });
    expect(h.m.screenFor('p2')).toMatchObject({ kind: 'left' });
    expect(h.m.state.queue).not.toContain('p2#0');
    expect(ph.score).toBe(-2);
    h.playRound();
    const res = h.m.tvView();
    expect(res.phase === 'results' && res.standings.map((s) => s.playerId)).not.toContain('p2#0');
  });

  it('the same key later is a new player who spectates', () => {
    const h = startedNotShooting('p2');
    h.msg('p2', { t: 'leave' });
    h.d({ type: 'peer', event: 'joined', playerId: 'p9', playerKey: 'k-p2' });
    expect(h.m.state.players.some((p) => p.phoneId === 'p9')).toBe(false);
    h.msg('p9', { t: 'hello', seats: [{ seat: 0, seatKey: 'k-p2', name: 'P2' }] });
    const fresh = h.m.state.players.find((p) => p.phoneId === 'p9')!;
    expect(fresh.id).toBe('p9#0');
    expect(fresh).toMatchObject({ spectator: true, score: 0 });
    expect(h.m.screenFor('p9')).toMatchObject({ kind: 'spectating' });
  });

  it('leader/host remove: gone from standings and queue, its phone kicked once seatless', () => {
    const h = startedNotShooting('p3');
    const fx = h.remove('p3#0');
    expect(fx).toContainEqual({ type: 'kick', to: 'p3' });
    expect(h.m.state.queue).not.toContain('p3#0');
    expect(h.m.phoneIds()).not.toContain('p3');
    h.playRound();
    const res = h.m.tvView();
    expect(res.phase === 'results' && res.standings.map((s) => s.playerId)).not.toContain('p3#0');
  });

  it('removing one seat of a shared phone keeps the phone (no kick)', () => {
    const h = lobbyOf(3);
    h.msg('p3', { t: 'addSeat', name: 'Kid', seatKey: 'kid' });
    const fx = h.msg('p1', { t: 'leader', action: 'remove', playerId: 'p3#1' });
    expect(fx.some((e) => e.type === 'kick')).toBe(false);
    expect(h.m.state.players.map((p) => p.id)).toEqual(['p1#0', 'p2#0', 'p3#0']);
  });

  it('the leader cannot remove its own seats (it leaves instead)', () => {
    const h = lobbyOf(3);
    h.msg('p1', { t: 'leader', action: 'remove', playerId: 'p1#0' });
    expect(h.m.state.players.map((p) => p.id)).toContain('p1#0');
    h.d({ type: 'control', control: { action: 'remove', playerId: 'p1#0' } });
    expect(h.m.state.players.map((p) => p.id)).not.toContain('p1#0');
  });
});
