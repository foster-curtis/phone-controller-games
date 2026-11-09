// Seats in the match (SPEC §6.3, §6.3.1): add/remove, the 8-seat cap, colors, per-phone ready and
// camera, mid-match spectators.
import { describe, expect, it } from 'vitest';
import { MAX_SEATS, PLAYER_COLOR_IDS } from '../../../shared/messages';
import { lobbyOf, setup, started } from './harness';

describe('seats', () => {
  it('addSeat adds a player on the same phone; removeSeat removes one', () => {
    const h = setup();
    h.join('a', 'Ana');
    h.msg('a', { t: 'addSeat', name: 'Leo', seatKey: 'kLeo' });
    h.msg('a', { t: 'addSeat', name: 'Mia', seatKey: 'kMia' });
    expect(h.m.state.players.map((p) => [p.id, p.name, p.playerKey])).toEqual([
      ['a#0', 'Ana', 'k-a'],
      ['a#1', 'Leo', 'kLeo'],
      ['a#2', 'Mia', 'kMia'],
    ]);
    h.msg('a', { t: 'removeSeat', seat: 1 });
    expect(h.m.state.players.map((p) => p.id)).toEqual(['a#0', 'a#2']);
    h.msg('a', { t: 'addSeat', name: 'Leo', seatKey: 'kLeo2' });
    expect(h.m.state.players.map((p) => p.id)).toEqual(['a#0', 'a#2', 'a#1']);
    expect(h.m.screenFor('a')).toMatchObject({
      kind: 'lobby',
      seats: [
        { seat: 0, name: 'Ana' },
        { seat: 1, name: 'Leo' },
        { seat: 2, name: 'Mia' },
      ],
    });
  });

  it('caps the room at 8 seats across phones: the 9th addSeat and a 9th phone are refused', () => {
    const h = setup();
    h.join('a', 'A');
    for (let i = 1; i < 6; i++) h.msg('a', { t: 'addSeat', name: `A${i}`, seatKey: `k${i}` });
    h.join('b', 'B');
    h.join('c', 'C');
    expect(h.m.state.players).toHaveLength(MAX_SEATS);
    expect(h.m.screenFor('a')).toMatchObject({ kind: 'lobby', canAddSeat: false });
    h.msg('b', { t: 'addSeat', name: 'B1', seatKey: 'kb1' });
    h.join('d', 'D');
    expect(h.m.state.players).toHaveLength(MAX_SEATS);
    expect(h.m.state.players.some((p) => p.phoneId === 'd')).toBe(false);
    h.msg('c', { t: 'removeSeat', seat: 0 });
    h.msg('d', { t: 'profile', seat: 0, name: 'D' });
    expect(h.m.state.players.some((p) => p.phoneId === 'd')).toBe(true);
  });

  it('colors are unique, lowest free first', () => {
    const h = lobbyOf(3);
    expect(h.m.state.players.map((p) => p.color)).toEqual(PLAYER_COLOR_IDS.slice(0, 3));
    h.msg('p2', { t: 'removeSeat', seat: 0 });
    h.join('p4');
    expect(h.m.state.players.find((p) => p.id === 'p4#0')!.color).toBe(PLAYER_COLOR_IDS[1]);
  });

  it('Ready and camera are per phone and cover all its seats', () => {
    const h = setup();
    h.join('a', 'Ana', { camera: null, ready: false });
    h.msg('a', { t: 'addSeat', name: 'Leo', seatKey: 'k' });
    h.msg('a', { t: 'ready', ready: true });
    h.msg('a', { t: 'camera', ok: false });
    expect(h.m.state.players.map((p) => [p.ready, p.camera])).toEqual([
      [true, 'denied'],
      [true, 'denied'],
    ]);
    h.msg('a', { t: 'addSeat', name: 'Mia', seatKey: 'k2' });
    expect(h.m.state.players[2]).toMatchObject({ ready: true, camera: 'denied' });
  });

  it('profile renames in the lobby only', () => {
    const h = started(3);
    h.msg('p1', { t: 'profile', seat: 0, name: 'New' });
    expect(h.m.state.players[0]!.name).toBe('P1');
  });

  it('hello restores a phone’s seats once', () => {
    const h = setup();
    h.connect('a');
    const seats = [
      { seat: 0, seatKey: 'k-a', name: 'Ana' },
      { seat: 1, seatKey: 'kLeo', name: 'Leo' },
    ];
    h.msg('a', { t: 'hello', seats });
    h.msg('a', { t: 'hello', seats });
    expect(h.m.state.players.map((p) => p.id)).toEqual(['a#0', 'a#1']);
  });

  it('mid-match joiners spectate: not tagged, not in the queue, in the next match', () => {
    const h = started(3);
    h.join('late', 'Late');
    const late = h.m.state.players.find((p) => p.id === 'late#0')!;
    expect(late.spectator).toBe(true);
    expect(h.m.state.queue).not.toContain('late#0');
    expect(h.m.screenFor('late')).toMatchObject({ kind: 'spectating' });
    h.msg('late', { t: 'addSeat', name: 'X', seatKey: 'kx' }); // lobby only
    expect(h.m.state.players.filter((p) => p.phoneId === 'late')).toHaveLength(1);
    while (h.m.state.phase !== 'matchEnd') {
      h.playRound();
      h.ctl('next');
    }
    expect(h.m.tvView()).toMatchObject({ phase: 'matchEnd' });
    const end = h.m.tvView();
    expect(end.phase === 'matchEnd' && end.standings.map((s) => s.playerId)).not.toContain(
      'late#0',
    );
    h.ctl('rematch');
    expect(late.spectator).toBe(false);
    expect([h.photographer().id, ...h.m.state.queue]).toContain('late#0');
  });

  it('Leave game removes every seat on the phone, from the queue and the standings', () => {
    const h = started(4);
    const phone = h.m.state.queue[0]!.split('#')[0]!;
    h.msg(phone, { t: 'leave' });
    expect(h.m.screenFor(phone)).toMatchObject({ kind: 'left' });
    expect(h.m.state.queue).not.toContain(`${phone}#0`);
    h.playRound();
    const res = h.m.tvView();
    expect(res.phase === 'results' && res.standings.map((p) => p.playerId)).not.toContain(
      `${phone}#0`,
    );
  });

  it('removing the photographer mid-round ends the round with no score', () => {
    const h = started(4);
    const ph = h.photographer().id;
    h.shoot(2);
    const fx = h.remove(ph);
    expect(h.m.state.turn).toBe(2);
    expect(h.photographer().id).not.toBe(ph);
    expect(fx.some((e) => e.type === 'releasePhotos')).toBe(true);
    expect(h.m.state.players.every((p) => p.score === 0)).toBe(true);
  });
});
