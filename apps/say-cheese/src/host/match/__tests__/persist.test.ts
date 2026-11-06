// Host-refresh snapshot (SPEC §6.3): serialize → restore round-trips roster, scores, queue, round.
import { describe, expect, it } from 'vitest';
import type { SeatId } from '../../../shared/seats';
import { parsePersisted, restore, serialize } from '../persist';
import type { Effect, PersistedMatch } from '../types';
import { setup, started } from './harness';

const lastPersist = (fx: Effect[]): PersistedMatch | undefined =>
  fx.flatMap((e) => (e.type === 'persist' ? [e.data] : [])).at(-1);

describe('persist', () => {
  it('serialize → JSON → parse → restore round-trips roster, scores, queue and round number', () => {
    const h = started(4);
    const ph = h.photographer().id;
    const x = (['p1#0', 'p2#0', 'p3#0', 'p4#0'] as SeatId[]).find((id) => id !== ph)!;
    h.playRound([[x]]);
    const data = parsePersisted(JSON.stringify(serialize(h.m.state)))!;
    expect(data).not.toBeNull();
    const back = restore(data);
    expect(back.players).toEqual(h.m.state.players);
    expect(back.queue).toEqual(h.m.state.queue);
    expect(back.turn).toBe(h.m.state.turn);
    expect(back.turns).toBe(h.m.state.turns);
    expect(back.leader).toBe(h.m.state.leader);
    expect(back.nextR).toBe(h.m.state.nextR);
    expect(back.players.find((p) => p.id === x)!.score).toBe(1);
  });

  it('the match emits the snapshot as an effect when it changes', () => {
    const h = setup();
    h.connect('a');
    const fx = h.msg('a', { t: 'profile', seat: 0, name: 'Ana' });
    expect(lastPersist(fx)?.players.map((p) => p.name)).toEqual(['Ana']);
  });

  it('a round in progress is replayed with the same photographer after a restore', () => {
    const h = started(3);
    h.playRound();
    h.ctl('next');
    const ph = h.photographer().id;
    const turn = h.m.state.turn;
    h.shoot(2);
    const data = serialize(h.m.state);
    expect(data.replay).toBe(ph);
    const r = setup({ restored: data });
    expect(r.m.state.phase).toBe('announce');
    expect(r.photographer().id).toBe(ph);
    expect(r.m.state.turn).toBe(turn);
    expect(r.m.state.round!.r).toBeGreaterThan(h.m.state.round!.r);
    expect(r.m.state.queue).toEqual(h.m.state.queue);
    expect(r.m.flush().some((e) => e.type === 'screen')).toBe(true);
  });

  it('rejects junk', () => {
    expect(parsePersisted(null)).toBeNull();
    expect(parsePersisted('{')).toBeNull();
    expect(parsePersisted(JSON.stringify({ v: 2 }))).toBeNull();
    const ok = serialize(started(3).m.state);
    expect(parsePersisted(JSON.stringify({ ...ok, players: [{ id: 'x' }] }))).toBeNull();
    expect(parsePersisted(JSON.stringify({ ...ok, phase: 'nope' }))).toBeNull();
  });
});
