import { describe, expect, it } from 'vitest';
import type { RoundBreakdown, Screen } from '../../../shared/messages';
import { MemStorage, setup } from './fakeSim';

function breakdownOf(s: Screen): RoundBreakdown | null | undefined {
  if (s.kind !== 'results' && s.kind !== 'matchEnd') throw new Error(`no breakdown on ${s.kind}`);
  return s.breakdown;
}

describe('round breakdown (C2 note)', () => {
  it('itemizes KOs, the survivor bonus and how each player went out', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c', 'd']);
    h.msg('a', { t: 'profile', name: 'Ann', color: 'crimson' });
    h.eliminate('c', 'a');
    h.eliminate('d', 'a');
    h.eliminate('b', null); // fell off, no credit → a is the sole survivor

    const v = h.match.view();
    expect(v.phase).toBe('results');
    const bd = v.breakdown;
    expect(bd?.round).toBe(1);
    expect(bd?.players.map((p) => p.playerId)).toEqual(['a', 'b', 'c', 'd']);
    const [a, b, c, d] = bd!.players;
    expect(a).toEqual({
      playerId: 'a',
      name: 'Ann',
      color: 'crimson',
      points: 5,
      total: 5,
      left: false,
      items: [
        { kind: 'ko', victimId: 'c', victimName: 'Egg 3', points: 1 },
        { kind: 'ko', victimId: 'd', victimName: 'Egg 4', points: 1 },
        { kind: 'survivor', points: 3 },
      ],
      out: null,
    });
    expect(b).toMatchObject({ points: 0, total: 0, items: [], out: { by: null, byName: null } });
    expect(c).toMatchObject({ points: 0, items: [], out: { by: 'a', byName: 'Ann' } });
    expect(d).toMatchObject({ out: { by: 'a', byName: 'Ann' } });
    // totals match the standings
    const standings = h.last('b').standings;
    expect(bd!.players.map((p) => [p.playerId, p.total])).toEqual(
      standings.map((s) => [s.playerId, s.score]),
    );
  });

  it('the results screen sent to every phone carries the same breakdown', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.join('s'); // mid-round joiner: spectates, not in the breakdown
    h.eliminate('c', 'b');
    h.eliminate('a', 'b');
    const bd = h.match.view().breakdown;
    expect(bd?.players.map((p) => p.playerId)).toEqual(['b', 'a', 'c']);
    for (const id of ['a', 'b', 'c', 's']) {
      const s = h.last(id);
      expect(s.kind).toBe('results');
      expect(breakdownOf(s)).toEqual(bd);
    }
    // cleared once the next round starts; the next round gets its own
    h.match.hostAction('next');
    expect(h.match.view().breakdown).toBeNull();
    h.runMs(3000);
    h.eliminate('a', 'c');
    h.eliminate('b', null);
    h.eliminate('s', null);
    const bd2 = h.match.view().breakdown!;
    expect(bd2.round).toBe(2);
    expect(bd2.players.map((p) => p.playerId)).toContain('s');
    expect(bd2.players.find((p) => p.playerId === 'c')).toMatchObject({
      points: 4,
      items: [
        { kind: 'ko', victimId: 'a', points: 1 },
        { kind: 'survivor', points: 3 },
      ],
    });
  });

  it('the final round breakdown is on matchEnd', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    while (h.match.view().phase !== 'matchEnd') {
      h.eliminate('b', 'a'); // a: +1 +3 per round
      if (h.match.view().phase === 'results') {
        h.match.hostAction('next');
        h.runMs(3000);
      }
    }
    const v = h.match.view();
    expect(v.round).toBe(4);
    expect(v.breakdown?.round).toBe(4);
    expect(v.breakdown?.players[0]).toMatchObject({ playerId: 'a', points: 4, total: 16 });
    for (const id of ['a', 'b']) {
      const s = h.last(id);
      expect(s.kind).toBe('matchEnd');
      expect(breakdownOf(s)).toEqual(v.breakdown);
    }
  });

  it('a player who left is dropped from the breakdown; stale credit to them does not count', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c', 'd']);
    h.eliminate('d', 'a'); // a +1
    h.msg('a', { t: 'leave' }); // a and their points are gone
    h.eliminate('c', 'a'); // a stale sim credit to a removed player
    const bd = h.match.view().breakdown!;
    expect(bd.players.map((p) => p.playerId)).toEqual(['b', 'c', 'd']);
    const [b, c, d] = bd.players;
    expect(c).toMatchObject({ points: 0, out: { by: null, byName: null, ghost: false } });
    expect(d).toMatchObject({ out: { by: 'a', byName: 'Egg 1', ghost: false } });
    expect(b).toMatchObject({ points: 3, items: [{ kind: 'survivor', points: 3 }], out: null });
  });

  it('out.ghost: knocked out by a ghost (C3 note)', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c', 'd']);
    h.eliminate('d', null, 5000, true); // a ghost pulse, no living credit
    h.eliminate('c', 'a', 5000, true); // a ghost finished a's push: a keeps the credit
    h.eliminate('b', null); // fell off
    const bd = h.match.view().breakdown!;
    const out = (id: string) => bd.players.find((p) => p.playerId === id)?.out;
    expect(out('d')).toEqual({ by: null, byName: null, ghost: true });
    expect(out('c')).toEqual({ by: 'a', byName: 'Egg 1', ghost: true });
    expect(out('b')).toEqual({ by: null, byName: null, ghost: false });
    expect(out('a')).toBeNull();
    expect(h.score('a')).toBe(1 + 3);
    const s = h.last('d');
    expect(breakdownOf(s)?.players.find((p) => p.playerId === 'd')?.out?.ghost).toBe(true);
  });

  it('a late rejoiner is listed under their new id', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.match.playerLeft('c');
    h.join('c2', 'key-c'); // late rejoin: old egg 'c' stays on the pan
    h.eliminate('c', 'b');
    h.eliminate('a', 'b');
    const bd = h.match.view().breakdown!;
    expect(bd.players.map((p) => p.playerId)).toEqual(['b', 'a', 'c2']);
    expect(bd.players[0]!.items[0]).toEqual({
      kind: 'ko',
      victimId: 'c2',
      victimName: 'Egg 3',
      points: 1,
    });
    expect(bd.players[2]!.out).toEqual({ by: 'b', byName: 'Egg 2', ghost: false });
  });

  it('is null after a host-refresh restore', () => {
    const storage = new MemStorage();
    const h1 = setup(storage);
    h1.startGame(['a', 'b']);
    h1.eliminate('b', 'a');
    expect(h1.match.view().breakdown).not.toBeNull();
    const h2 = setup(storage);
    h2.match.restore([
      { playerId: 'a', playerKey: 'key-a', connected: true },
      { playerId: 'b', playerKey: 'key-b', connected: true },
    ]);
    expect(h2.match.view().phase).toBe('results');
    expect(h2.match.view().breakdown).toBeNull();
    expect(breakdownOf(h2.last('a')) ?? null).toBeNull();
    expect(breakdownOf(h2.last('b')) ?? null).toBeNull();
  });
});
