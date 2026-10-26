import { describe, expect, it } from 'vitest';
import type { InputTuple } from '../../../shared/messages';
import { setup } from './fakeSim';

describe('round start', () => {
  it('passes only eligible players to sim.startRound, all frozen', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c', 'd', 'e']) h.join(id);
    h.match.playerLeft('c'); // disconnected → no egg
    h.msg('d', { t: 'pause' }); // self-paused → egg, frozen
    h.readyAll();
    h.match.hostAction('start');
    h.join('f'); // joined during countdown → spectates
    expect(h.sim.lastRound).toEqual([
      { id: 'a', frozen: true },
      { id: 'b', frozen: true },
      { id: 'd', frozen: true },
      { id: 'e', frozen: true },
    ]);
    expect(h.last('f').kind).toBe('spectating');
  });

  it('3 s countdown screen, then playing with eggs unfrozen (self-paused stays frozen)', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c']) h.join(id);
    h.msg('c', { t: 'pause' });
    h.readyAll();
    h.match.hostAction('start');
    expect(h.match.simRunning).toBe(false);
    const first = h.last('a');
    expect(first).toMatchObject({ kind: 'countdown', ms: 3000, round: 1 });
    h.runMs(1000);
    expect(h.last('a')).toMatchObject({ kind: 'countdown', ms: 2000 });
    h.runMs(1000);
    expect(h.last('a')).toMatchObject({ kind: 'countdown', ms: 1000 });
    expect(h.sim.steps).toBe(0);
    expect(h.match.view().countdownMs).toBeGreaterThan(0);
    h.runMs(1000);
    expect(h.match.view().phase).toBe('playing');
    expect(h.match.simRunning).toBe(true);
    expect(h.last('a').kind).toBe('playing');
    expect(h.sim.frozen.get('a')).toBe(false);
    expect(h.sim.frozen.get('b')).toBe(false);
    expect(h.sim.frozen.get('c')).toBe(true);
    expect(h.kinds('a').filter((k) => k === 'countdown')).toHaveLength(3);
  });

  it('forwards input only while playing, from players with an egg or ghost', () => {
    const h = setup();
    const input: InputTuple = [50, -20, 0, 1, 0];
    h.join('a');
    h.join('b');
    h.readyAll();
    h.match.hostAction('start');
    h.msg('a', input);
    expect(h.sim.inputCalls).toHaveLength(0);
    h.runMs(3000);
    h.join('s');
    h.msg('a', input);
    h.msg('s', input); // spectator
    h.msg('a', [999, 0, 0, 0, 0]); // invalid
    expect(h.sim.inputCalls).toEqual([['a', input]]);
  });
});

describe('elimination → ghost', () => {
  it('eliminated screen counts 5→1, then the ghost screen after 5 s', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.eliminate('c', 'a', 5000);
    expect(h.last('c')).toMatchObject({ kind: 'eliminated', respawnMs: 5000 });
    expect(h.match.view().players.find((p) => p.id === 'c')?.alive).toBe(false);
    h.runMs(5000 - 1000 / 60);
    h.sim.queue({ type: 'ghostSpawned', id: 'c' });
    h.step();
    const seen = h
      .screensOf('c')
      .filter((s) => s.kind === 'eliminated')
      .map((s) => (s.kind === 'eliminated' ? s.respawnMs : 0));
    expect(seen).toEqual([5000, 4000, 3000, 2000, 1000]);
    expect(h.last('c').kind).toBe('ghost');
    expect(h.match.view().players.find((p) => p.id === 'c')?.ghost).toBe(true);
    // ghost input reaches the sim
    h.msg('c', [0, 100, 1, 1, 0]);
    expect(h.sim.inputs.get('c')).toEqual([0, 100, 1, 1, 0]);
  });
});

describe('after the round', () => {
  it('results → Next round → countdown with round 2', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    h.eliminate('b', 'a');
    expect(h.last('a')).toMatchObject({ kind: 'results', round: 1 });
    expect(h.match.simRunning).toBe(false);
    h.match.hostAction('next');
    expect(h.last('a')).toMatchObject({ kind: 'countdown', round: 2 });
    expect(h.sim.rounds).toHaveLength(2);
  });

  it('stray sim events outside play are ignored', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    h.eliminate('b', 'a');
    h.match.handleSimEvents([
      { type: 'eliminated', id: 'a', by: 'b', respawnMs: 5000, byGhost: false },
    ]);
    expect(h.score('b')).toBe(0);
  });

  function reachMatchEnd() {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    // 13 to win with 3 players: a scores +2 KOs +3 survivor = 5 per round.
    for (let r = 0; r < 3; r++) {
      h.eliminate('b', 'a');
      h.eliminate('c', 'a');
      if (h.match.view().phase === 'results') {
        h.match.hostAction('next');
        h.runMs(3000);
      }
    }
    expect(h.match.view().phase).toBe('matchEnd');
    return h;
  }

  it('rematch resets scores, keeps the roster (minus leavers) and starts round 1', () => {
    const h = reachMatchEnd();
    h.join('d'); // joined at match end: in the rematch
    const ids = h.match.view().players.map((p) => p.id);
    h.msg('a', { t: 'leader', action: 'rematch' });
    const v = h.match.view();
    expect(v.phase).toBe('countdown');
    expect(v.round).toBe(1);
    expect(v.players.map((p) => p.id)).toEqual(ids);
    expect(v.players.every((p) => p.score === 0)).toBe(true);
    expect(v.leaderId).toBe('a');
    expect(v.targetScore).toBe(12);
    expect(h.sim.lastRound.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('Back to lobby resets scores, keeps names/colors, and drops leavers', () => {
    const h = reachMatchEnd();
    h.msg('b', { t: 'profile', name: 'Bee', color: 'sky' });
    h.msg('c', { t: 'leave' });
    h.msg('a', { t: 'leader', action: 'lobby' });
    const v = h.match.view();
    expect(v.phase).toBe('lobby');
    expect(v.round).toBe(0);
    expect(v.players.map((p) => [p.id, p.score])).toEqual([
      ['a', 0],
      ['b', 0],
    ]);
    expect(h.last('b')).toMatchObject({ kind: 'lobby', name: 'Bee', color: 'sky' });
  });

  it('ignores actions in the wrong phase', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    for (const a of ['start', 'next', 'rematch', 'lobby'] as const) h.match.hostAction(a);
    expect(h.match.view().phase).toBe('playing');
    expect(h.sim.rounds).toHaveLength(1);
  });
});
