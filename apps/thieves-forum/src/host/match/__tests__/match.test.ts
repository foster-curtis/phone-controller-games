// Match state machine (SPEC §6.2, §6.14, §6.15, §6.18, §6.19): the transition table, invalid-event
// no-ops, Start gating, rules on the first Start only, leader handoff, round starts, reveal and podium.
import { rngStream } from '@pcg/game-kit';
import { describe, expect, it } from 'vitest';
import { minPlayers } from '../../../../game.meta';
import { balance } from '../../../content/balance';
import { LAYOUT } from '../../../content/layout';
import { createSim } from '../../sim/world';
import { createMatch, type Effect, type MatchEvent } from '../match';
import { MATCH_TUNING as T } from '../tuning';
import type { MatchPhase, RoundHaul } from '../types';

function setup(opts: { rulesCards?: number } = {}) {
  let t = 1000;
  const m = createMatch({ rng: rngStream(7, 'test'), now: () => t, ...opts });
  const advance = (ms: number) => {
    t += ms;
    return m.dispatch({ type: 'tick' });
  };
  return { m, advance, now: () => t };
}

type M = ReturnType<typeof setup>;

function lobby(m: M['m'], n = 3) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  for (const id of ids) m.dispatch({ type: 'join', id, name: `Name ${id}` });
  return ids;
}

function readyAll(m: M['m'], ids: string[]) {
  for (const id of ids) m.dispatch({ type: 'ready', id, ready: true });
}

const kinds = (fx: Effect[]) => fx.map((e) => e.k);
const phase = (m: M['m']): MatchPhase => m.state().phase;

/** Lobby → Start (→ rules skipped) → roundStart 1. */
function started(n = 3) {
  const s = setup();
  const ids = lobby(s.m, n);
  readyAll(s.m, ids);
  s.m.dispatch({ type: 'leader', id: 'p0', action: 'start' });
  const fx = s.m.dispatch({ type: 'leader', id: 'p0', action: 'skip' });
  return { ...s, ids, fx };
}

function hauls(ids: string[], values: number[]): RoundHaul[] {
  return ids.map((id, i) => ({
    side: { kind: 'player', id },
    bag: 20 + values[i]!,
    items: [],
    haul: values[i]!,
  }));
}

const chars = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, 100 + i]));

/** From roundStart to the end of the reveal (into transition). */
function playRound(s: ReturnType<typeof started>, values: number[]) {
  s.advance(balance.match.openingMs);
  expect(phase(s.m)).toBe('play');
  s.advance(balance.match.roundMs);
  expect(phase(s.m)).toBe('handsUp');
  const round = s.m.state().round;
  s.m.dispatch({ type: 'hauls', round, hauls: hauls(s.ids, values), characters: chars(s.ids) });
  s.advance(T.handsUpMs);
  expect(phase(s.m)).toBe('reveal');
  for (let i = 0; i < 20 && phase(s.m) === 'reveal'; i++) s.advance(T.revealCrownMs);
  expect(phase(s.m)).toBe('transition');
}

describe('transition table', () => {
  it('runs lobby → rules → (roundStart → play → handsUp → reveal → transition) ×3 → podium → lobby', () => {
    const s = started();
    expect(kinds(s.fx)).toContain('roundStart');
    const seen: MatchPhase[] = [];
    for (let r = 1; r <= 3; r++) {
      expect(s.m.state().round).toBe(r);
      expect(phase(s.m)).toBe('roundStart');
      playRound(s, [r, 2 * r, 0]);
      seen.push(phase(s.m));
      s.advance(T.transitionMs);
    }
    expect(seen).toEqual(['transition', 'transition', 'transition']);
    expect(phase(s.m)).toBe('podium');
    const fx = s.m.dispatch({ type: 'leader', id: 'p0', action: 'playAgain' });
    expect(kinds(fx)).toContain('lobby');
    const st = s.m.state();
    expect(st.phase).toBe('lobby');
    expect(st.players.map((p) => p.id)).toEqual(s.ids);
    expect(st.players.every((p) => !p.ready)).toBe(true);
    expect(st.round).toBe(0);
    expect(st.results).toEqual([]);
  });

  it('emits the wiring effects at each edge', () => {
    const s = started();
    expect(kinds(s.advance(balance.match.openingMs))).toContain('play');
    expect(kinds(s.advance(balance.match.roundMs))).toEqual(['handsUp', 'tv']);
    const fx = s.m.dispatch({
      type: 'hauls',
      round: 1,
      hauls: hauls(s.ids, [1, 2, 3]),
      characters: chars(s.ids),
    });
    expect(fx.filter((e) => e.k === 'screen')).toHaveLength(3);
    expect(kinds(s.advance(T.handsUpMs))).toEqual(['reveal', 'tv']);
  });

  it('holds each timed phase until its deadline', () => {
    const s = started();
    expect(s.advance(balance.match.openingMs - 1)).toEqual([]);
    expect(phase(s.m)).toBe('roundStart');
    s.advance(1);
    expect(phase(s.m)).toBe('play');
    s.advance(balance.match.roundMs - 1);
    expect(phase(s.m)).toBe('play');
    s.advance(1);
    expect(phase(s.m)).toBe('handsUp');
  });

  it('the round timer is 270 s', () => {
    expect(balance.match.roundMs).toBe(270_000);
    const s = started();
    s.advance(balance.match.openingMs);
    expect(s.m.tvView()).toMatchObject({ phase: 'play', timeLeftMs: 270_000 });
    s.advance(70_000);
    expect(s.m.tvView()).toMatchObject({ timeLeftMs: 200_000 });
  });

  it('hands up waits for the hauls before the reveal', () => {
    const s = started();
    s.advance(balance.match.openingMs);
    s.advance(balance.match.roundMs);
    expect(s.advance(T.handsUpMs * 3)).toEqual([]);
    expect(phase(s.m)).toBe('handsUp');
    s.m.dispatch({
      type: 'hauls',
      round: 1,
      hauls: hauls(s.ids, [1, 2, 3]),
      characters: chars(s.ids),
    });
    s.advance(0);
    expect(phase(s.m)).toBe('reveal');
  });
});

describe('invalid events are no-ops', () => {
  const invalid: [MatchPhase, MatchEvent][] = [
    ['lobby', { type: 'control', action: 'next' }],
    ['lobby', { type: 'control', action: 'playAgain' }],
    ['lobby', { type: 'hauls', round: 0, hauls: [], characters: {} }],
    ['lobby', { type: 'tick' }],
    ['lobby', { type: 'ready', id: 'nobody', ready: true }],
    ['lobby', { type: 'leave', id: 'nobody' }],
    ['lobby', { type: 'disconnect', id: 'nobody' }],
    ['lobby', { type: 'join', id: 'x', name: '   ' }],
    ['roundStart', { type: 'control', action: 'start' }],
    ['roundStart', { type: 'ready', id: 'p1', ready: false }],
    ['roundStart', { type: 'color', id: 'p1', color: 'forest' }],
    ['roundStart', { type: 'control', action: 'next' }],
    ['roundStart', { type: 'hauls', round: 1, hauls: [], characters: {} }],
    ['play', { type: 'control', action: 'playAgain' }],
    ['play', { type: 'control', action: 'rules' }],
    ['play', { type: 'hauls', round: 1, hauls: [], characters: {} }],
    ['play', { type: 'leader', id: 'p0', action: 'skip' }],
  ];

  it.each(invalid)('%s ignores %j', (at, event) => {
    const s = at === 'lobby' ? setup() : started();
    if (at === 'lobby') lobby(s.m);
    if (at === 'play') s.advance(balance.match.openingMs);
    expect(phase(s.m)).toBe(at);
    const before = s.m.state();
    expect(s.m.dispatch(event)).toEqual([]);
    expect(s.m.state()).toEqual(before);
  });

  it('hands up ignores hauls for another round and a second hauls', () => {
    const s = started();
    s.advance(balance.match.openingMs);
    s.advance(balance.match.roundMs);
    expect(s.m.dispatch({ type: 'hauls', round: 2, hauls: [], characters: {} })).toEqual([]);
    s.m.dispatch({
      type: 'hauls',
      round: 1,
      hauls: hauls(s.ids, [1, 2, 3]),
      characters: chars(s.ids),
    });
    const before = s.m.state();
    expect(s.m.dispatch({ type: 'hauls', round: 1, hauls: [], characters: {} })).toEqual([]);
    expect(s.m.state()).toEqual(before);
  });

  it('podium ignores start, rules and next', () => {
    const s = started(2);
    for (let r = 0; r < 3; r++) {
      playRound(s, [1, 2]);
      s.advance(T.transitionMs);
    }
    expect(phase(s.m)).toBe('podium');
    for (const action of ['start', 'rules', 'next', 'skip'] as const) {
      expect(s.m.dispatch({ type: 'control', action })).toEqual([]);
    }
  });
});

describe('lobby and Start', () => {
  it('Start needs the leader and ≥ minPlayers ready', () => {
    expect(minPlayers).toBe(2);
    const { m } = setup();
    lobby(m, 3);
    expect(m.tvView()).toMatchObject({ canStart: false });
    m.dispatch({ type: 'ready', id: 'p1', ready: true });
    expect(m.dispatch({ type: 'leader', id: 'p0', action: 'start' })).toEqual([]);
    m.dispatch({ type: 'ready', id: 'p2', ready: true });
    expect(m.tvView()).toMatchObject({ canStart: true });
    expect(m.screenFor('p0')).toMatchObject({ s: 'lobby', canStart: true });
    expect(m.screenFor('p1')).toMatchObject({ s: 'lobby', canStart: false });
    expect(m.dispatch({ type: 'leader', id: 'p1', action: 'start' })).toEqual([]);
    expect(phase(m)).toBe('lobby');
    m.dispatch({ type: 'leader', id: 'p0', action: 'start' });
    expect(phase(m)).toBe('rules');
  });

  it('disconnected ready players do not count', () => {
    const { m } = setup();
    const ids = lobby(m, 2);
    readyAll(m, ids);
    m.dispatch({ type: 'disconnect', id: 'p1' });
    expect(m.tvView()).toMatchObject({ canStart: false });
  });

  it('a lone player cannot start', () => {
    const { m } = setup();
    lobby(m, 1);
    m.dispatch({ type: 'ready', id: 'p0', ready: true });
    expect(m.dispatch({ type: 'control', action: 'start' })).toEqual([]);
  });

  it('gives each joiner a free color and lets them pick an untaken one', () => {
    const { m } = setup();
    lobby(m, 2);
    const [a, b] = m.state().players;
    expect(a!.color).not.toBe(b!.color);
    expect(m.dispatch({ type: 'color', id: 'p1', color: a!.color })).toEqual([]);
    m.dispatch({ type: 'color', id: 'p1', color: 'forest' });
    expect(m.state().players[1]!.color).toBe('forest');
  });

  it('turns away the ninth phone with a full screen', () => {
    const { m } = setup();
    lobby(m, 8);
    expect(m.dispatch({ type: 'join', id: 'late', name: 'Late' })).toEqual([
      { k: 'screen', to: 'late', screen: { s: 'waiting', reason: 'full' } },
    ]);
    expect(m.state().players).toHaveLength(8);
  });

  it('a rejoin keeps the spot and renames', () => {
    const { m } = setup();
    lobby(m, 2);
    m.dispatch({ type: 'disconnect', id: 'p0' });
    m.dispatch({ type: 'join', id: 'p0', name: 'Livia' });
    expect(m.state().players[0]).toMatchObject({ id: 'p0', name: 'Livia', connected: true });
  });
});

describe('How to play (game-kit sequencer)', () => {
  it('shows only on the first Start', () => {
    const s = setup({ rulesCards: 2 });
    const ids = lobby(s.m, 2);
    readyAll(s.m, ids);
    s.m.dispatch({ type: 'control', action: 'start' });
    expect(s.m.tvView()).toEqual({ phase: 'rules', card: 0, count: 2 });
    expect(s.m.screenFor('p0')).toEqual({ s: 'rules', card: 0, count: 2, leader: true });
    s.m.dispatch({ type: 'leader', id: 'p0', action: 'next' });
    expect(s.m.state().rulesCard).toBe(1);
    s.m.dispatch({ type: 'leader', id: 'p0', action: 'next' });
    expect(phase(s.m)).toBe('roundStart');
    for (let r = 0; r < 3; r++) {
      s.advance(balance.match.openingMs);
      s.advance(balance.match.roundMs);
      s.m.dispatch({
        type: 'hauls',
        round: r + 1,
        hauls: hauls(ids, [0, 0]),
        characters: chars(ids),
      });
      for (let i = 0; i < 20 && phase(s.m) !== 'roundStart' && phase(s.m) !== 'podium'; i++) {
        s.advance(T.transitionMs);
      }
    }
    expect(phase(s.m)).toBe('podium');
    s.m.dispatch({ type: 'control', action: 'playAgain' });
    readyAll(s.m, ids);
    s.m.dispatch({ type: 'control', action: 'start' });
    expect(phase(s.m)).toBe('roundStart');
  });

  it('opens from the lobby and returns there', () => {
    const { m } = setup({ rulesCards: 3 });
    lobby(m, 2);
    expect(m.dispatch({ type: 'leader', id: 'p1', action: 'howToPlay' })).toEqual([]);
    m.dispatch({ type: 'leader', id: 'p0', action: 'howToPlay' });
    expect(phase(m)).toBe('rules');
    const fx = m.dispatch({ type: 'control', action: 'skip' });
    expect(kinds(fx)).toContain('lobby');
    expect(phase(m)).toBe('lobby');
  });

  it('a lobby How to play does not use up the first-Start rules', () => {
    const { m } = setup();
    const ids = lobby(m, 2);
    m.dispatch({ type: 'control', action: 'rules' });
    m.dispatch({ type: 'control', action: 'skip' });
    readyAll(m, ids);
    m.dispatch({ type: 'control', action: 'start' });
    expect(phase(m)).toBe('rules');
  });
});

describe('leader', () => {
  it('hands off to the next-earliest connected player, with no snap-back', () => {
    const { m } = setup();
    lobby(m, 3);
    const leader = () => m.state().players.find((p) => p.leader)?.id;
    expect(leader()).toBe('p0');
    m.dispatch({ type: 'disconnect', id: 'p0' });
    expect(leader()).toBe('p1');
    m.dispatch({ type: 'reconnect', id: 'p0' });
    expect(leader()).toBe('p1');
    m.dispatch({ type: 'leave', id: 'p1' });
    expect(leader()).toBe('p0');
    expect(m.state().players.filter((p) => p.leader)).toHaveLength(1);
  });

  it('only the leader phone drives; the TV controls always can', () => {
    const s = started(2);
    for (let r = 0; r < 3; r++) {
      playRound(s, [1, 2]);
      s.advance(T.transitionMs);
    }
    expect(s.m.dispatch({ type: 'leader', id: 'p1', action: 'playAgain' })).toEqual([]);
    expect(s.m.screenFor('p0')).toMatchObject({ s: 'matchEnd', leader: true });
    expect(s.m.screenFor('p1')).toMatchObject({ s: 'matchEnd', leader: false });
    s.m.dispatch({ type: 'control', action: 'playAgain' });
    expect(phase(s.m)).toBe('lobby');
  });
});

describe('round start', () => {
  it('sends a RoundStart per round with seed, open stalls, guards and the sim outfits', () => {
    const s = started(3);
    const starts = [s.fx.find((e) => e.k === 'roundStart')!];
    for (let r = 1; r < 3; r++) {
      playRound(s, [0, 0, 0]);
      starts.push(s.advance(T.transitionMs).find((e) => e.k === 'roundStart')!);
    }
    const open = s.m.state().openStalls;
    expect(open).toHaveLength(7);
    const seeds = new Set<number>();
    starts.forEach((e, i) => {
      if (e.k !== 'roundStart') throw new Error('no roundStart');
      expect(e.start.round).toBe(i + 1);
      expect(e.start.players.map((p) => p.id)).toEqual(s.ids);
      expect(e.start.players[0]!.side).toEqual({ kind: 'player', id: 'p0' });
      expect(e.start.openStalls).toEqual(open);
      expect(e.start.guards).toBe(balance.guards.start.small[i]);
      seeds.add(e.start.seed);
      // The phone's "THIS IS YOU" outfit is the one the sim gives the character.
      const sim = createSim(e.start);
      for (const [j, p] of e.start.players.entries()) {
        expect(e.outfits[p.id]).toEqual(sim.world.characters[j]!.outfit);
      }
    });
    expect(seeds.size).toBe(3);
  });

  it('uses the large guard table from 5 players', () => {
    const s = started(5);
    const e = s.fx.find((x) => x.k === 'roundStart');
    expect(e?.k === 'roundStart' && e.start.guards).toBe(balance.guards.start.large[0]);
    expect(s.m.state().openStalls).toHaveLength(9);
  });

  it('keeps the open stalls fixed for the match and lists the always-open shops', () => {
    const s = started(4);
    const first = s.m.state().openStalls;
    const shops = first.map((id) => LAYOUT.stalls[id]!.shop);
    expect(shops).toEqual(expect.arrayContaining(['pawnbroker', 'jewelry']));
    s.m.dispatch({ type: 'join', id: 'late', name: 'Late' });
    playRound(s, [0, 0, 0, 0]);
    s.advance(T.transitionMs);
    expect(s.m.state().round).toBe(2);
    expect(s.m.state().openStalls).toEqual(first);
  });

  it('shows THIS IS YOU, then the play screen with no TV identity', () => {
    const s = started(2);
    expect(s.m.screenFor('p0')).toMatchObject({
      s: 'roundStart',
      round: 1,
      rounds: 3,
      endsInMs: 4000,
    });
    s.advance(balance.match.openingMs);
    expect(s.m.screenFor('p1')).toMatchObject({ s: 'play', name: 'Name p1', endsInMs: 270_000 });
    expect(Object.keys(s.m.tvView()).sort()).toEqual([
      'code',
      'phase',
      'round',
      'rounds',
      'timeLeftMs',
    ]);
  });

  it('a join after Start waits for the next round start', () => {
    const s = started(2);
    s.m.dispatch({ type: 'join', id: 'late', name: 'Late' });
    expect(s.m.screenFor('late')).toEqual({ s: 'waiting', reason: 'nextRound' });
    expect(s.m.state().players[2]).toMatchObject({ waiting: true, joinedRound: 2 });
    playRound(s, [0, 0]);
    const fx = s.advance(T.transitionMs);
    const e = fx.find((x) => x.k === 'roundStart');
    expect(e?.k === 'roundStart' && e.start.players.map((p) => p.id)).toEqual(['p0', 'p1', 'late']);
    expect(s.m.screenFor('late')).toMatchObject({ s: 'roundStart', round: 2 });
  });
});

describe('reveal and podium', () => {
  it('reveals lowest haul → highest and crowns tied top earners', () => {
    const s = started(4);
    s.advance(balance.match.openingMs);
    s.advance(balance.match.roundMs);
    s.m.dispatch({
      type: 'hauls',
      round: 1,
      hauls: hauls(s.ids, [12, -6, 30, 30]),
      characters: chars(s.ids),
    });
    expect(s.m.screenFor('p1')).toEqual({ s: 'handsUp', bag: 14, items: [], total: -6 });
    s.advance(T.handsUpMs);
    const v = s.m.tvView();
    if (v.phase !== 'reveal') throw new Error(v.phase);
    expect(v.step).toBe(1);
    expect(v.reveal.entries.map((e) => [e.name, e.haul, e.top, e.character])).toEqual([
      ['Name p1', -6, false, 101],
      ['Name p0', 12, false, 100],
      ['Name p2', 30, true, 102],
      ['Name p3', 30, true, 103],
    ]);
    for (let step = 2; step <= 4; step++) {
      s.advance(T.revealCardMs);
      expect(s.m.tvView()).toMatchObject({ phase: 'reveal', step });
    }
    s.advance(T.revealCrownMs - 1);
    expect(phase(s.m)).toBe('reveal');
    s.advance(1);
    expect(phase(s.m)).toBe('transition');
  });

  it('names pack items on the hands-up screen', () => {
    const s = started(2);
    s.advance(balance.match.openingMs);
    s.advance(balance.match.roundMs);
    const h = hauls(s.ids, [0, 5]);
    h[1]!.items = [{ item: 'amphora', value: 5, weight: 3 }];
    s.m.dispatch({ type: 'hauls', round: 1, hauls: h, characters: chars(s.ids) });
    const scr = s.m.screenFor('p1');
    expect(scr).toMatchObject({ s: 'handsUp', total: 5 });
    if (scr?.s !== 'handsUp') throw new Error();
    expect(scr.items[0]).toMatchObject({ item: 'amphora', value: 5, weight: 3 });
    expect(scr.items[0]!.name.length).toBeGreaterThan(0);
  });

  it('podium sums the round hauls, shares tied places and steps 0 → 3', () => {
    const s = started(3);
    const rounds = [
      [10, 5, 20],
      [-4, 9, -10],
      [6, 2, 2],
    ];
    for (const v of rounds) {
      playRound(s, v);
      s.advance(T.transitionMs);
    }
    // Totals: p0 12, p1 16, p2 12.
    const v = s.m.tvView();
    if (v.phase !== 'podium') throw new Error(v.phase);
    expect(v.step).toBe(0);
    expect(v.rows.map((r) => [r.name, r.total, r.place])).toEqual([
      ['Name p1', 16, 1],
      ['Name p0', 12, 2],
      ['Name p2', 12, 2],
    ]);
    expect(s.m.screenFor('p2')).toEqual({
      s: 'matchEnd',
      place: 2,
      total: 12,
      tied: true,
      leader: false,
    });
    for (let step = 1; step <= 3; step++) {
      s.advance(T.podiumStepMs);
      expect(s.m.tvView()).toMatchObject({ step });
    }
    expect(s.advance(T.podiumStepMs * 5)).toEqual([]);
  });

  it('a late joiner totals only the rounds they played', () => {
    const s = started(2);
    playRound(s, [5, 5]);
    s.m.dispatch({ type: 'join', id: 'late', name: 'Late' });
    s.advance(T.transitionMs);
    s.ids.push('late');
    playRound(s, [1, 1, 7]);
    s.advance(T.transitionMs);
    playRound(s, [1, 1, 7]);
    s.advance(T.transitionMs);
    const v = s.m.tvView();
    if (v.phase !== 'podium') throw new Error(v.phase);
    expect(v.rows.map((r) => [r.name, r.total, r.place])).toEqual([
      ['Late', 14, 1],
      ['Name p0', 7, 2],
      ['Name p1', 7, 2],
    ]);
  });
});
