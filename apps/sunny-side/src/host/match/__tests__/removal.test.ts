// C3 notes 1, 2, 5: Leave = full removal; host / leader removal of players.
import { describe, expect, it } from 'vitest';
import { STORAGE_KEY } from '../config';
import { loadPersisted } from '../persist';
import { setup, type Harness } from './fakeSim';

function ids(h: Harness): string[] {
  return h.match.view().players.map((p) => p.id);
}

function savedKeys(h: Harness): string[] {
  return loadPersisted(h.storage)?.players.map((p) => p.playerKey) ?? [];
}

/** Every remaining connected phone got a fresh screen without `id` in its standings. */
function expectGoneFromScreens(h: Harness, id: string, others: string[]): void {
  for (const o of others) {
    expect(h.last(o).standings.map((s) => s.playerId)).not.toContain(id);
  }
}

describe('Leave = full removal (C3 note 1)', () => {
  it('in the lobby: left screen, kick, dropped from roster/standings/storage, color freed', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.msg('a', { t: 'leave' });
    expect(h.last('a').kind).toBe('left');
    expect(h.kicks).toEqual(['a']);
    expect(ids(h)).toEqual(['b']);
    expect(savedKeys(h)).toEqual(['key-b']);
    expectGoneFromScreens(h, 'a', ['b']);
    expect(h.match.view().leaderId).toBe('b');
    h.join('c');
    expect(h.match.view().players.find((p) => p.id === 'c')?.color).toBe('crimson');
    expect(h.sim.removedEggs).toEqual([]);
  });

  it('mid-round: egg removed (no points to anyone), score + color dropped, round goes on', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c', 'd']);
    h.msg('b', { t: 'profile', name: 'Bee', color: 'rose' });
    h.eliminate('d', 'b'); // b +1
    h.msg('b', { t: 'leave' });
    expect(h.last('b').kind).toBe('left');
    expect(h.kicks).toEqual(['b']);
    expect(h.sim.removedEggs).toEqual(['b']);
    expect(h.sim.frozen.has('b')).toBe(false);
    expect(ids(h)).toEqual(['a', 'c', 'd']);
    expect(h.match.view().players.every((p) => p.score === 0)).toBe(true);
    expect(h.events.filter((e) => e.type === 'score' && e.playerId !== 'b')).toEqual([]);
    expect(savedKeys(h)).toEqual(['key-a', 'key-c', 'key-d']);
    expectGoneFromScreens(h, 'b', ['a', 'c', 'd']);
    expect(h.match.view().phase).toBe('playing');
    // rose is free again
    h.join('s');
    h.msg('s', { t: 'profile', name: 'S', color: 'rose' });
    expect(h.match.view().players.find((p) => p.id === 's')?.color).toBe('rose');
    // the relay's follow-up `peer left` and stray messages are ignored
    const sentBefore = h.sent.length;
    h.match.playerLeft('b');
    h.msg('b', { t: 'pause' });
    expect(h.sent.length).toBe(sentBefore);
    // a stale sim event for the removed egg changes nothing
    h.eliminate('b', 'a');
    expect(h.score('a')).toBe(0);
    expect(h.match.view().phase).toBe('playing');
  });

  it('mid-round as a ghost: the ghost is removed too, and the leader hands off', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.eliminate('a', 'b');
    h.runMs(5000);
    h.sim.queue({ type: 'ghostSpawned', id: 'a' });
    h.step();
    expect(h.last('a').kind).toBe('ghost');
    h.msg('a', { t: 'leave' });
    expect(h.sim.removedEggs).toEqual(['a']);
    expect(h.sim.inputs.get('a')).toBeNull();
    expect(h.match.view().leaderId).toBe('b');
    expect(h.last('b').isLeader).toBe(true);
    expect(ids(h)).toEqual(['b', 'c']);
  });

  it('during the countdown: egg removed; ≤1 egg left ends the round once play starts', () => {
    const h = setup();
    for (const id of ['a', 'b']) h.join(id);
    h.readyAll();
    h.match.hostAction('start');
    h.msg('b', { t: 'leave' });
    expect(h.sim.removedEggs).toEqual(['b']);
    h.runMs(3000);
    expect(h.match.view().phase).toBe('results');
    expect(h.match.view().survivorId).toBe('a');
  });

  it('on results: dropped from standings and the shown breakdown', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.eliminate('c', 'b');
    h.eliminate('a', 'b');
    expect(h.match.view().survivorId).toBe('b');
    h.msg('c', { t: 'leave' });
    const v = h.match.view();
    expect(v.phase).toBe('results');
    expect(v.breakdown?.players.map((p) => p.playerId)).toEqual(['b', 'a']);
    expect(ids(h)).toEqual(['a', 'b']);
    expectGoneFromScreens(h, 'c', ['a', 'b']);
    const s = h.last('a');
    if (s.kind !== 'results') throw new Error(s.kind);
    expect(s.breakdown?.players.map((p) => p.playerId)).toEqual(['b', 'a']);
    expect(h.sim.removedEggs).toEqual([]);
    // the survivor leaving clears survivorId
    h.msg('b', { t: 'leave' });
    expect(h.match.view().survivorId).toBeNull();
    expect(h.match.view().breakdown?.players.map((p) => p.playerId)).toEqual(['a']);
  });

  it('a later join with the same key is a brand-new player (fresh score, auto color, spectates)', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c', 'd']);
    h.msg('b', { t: 'profile', name: 'Bee', color: 'rose' });
    h.eliminate('c', 'b');
    h.msg('b', { t: 'leave' });
    h.join('b2', 'key-b');
    expect(h.match.view().phase).toBe('playing');
    expect(h.match.view().players.find((p) => p.id === 'b2')).toMatchObject({
      name: 'Egg 5',
      score: 0,
      color: 'cobalt',
      spectating: true,
      left: false,
      joinIndex: 4,
    });
    expect(h.last('b2').kind).toBe('spectating');
  });

  it('a removal that leaves one egg ends the round with the +3 rule', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.eliminate('c', 'a');
    h.msg('b', { t: 'leave' });
    expect(h.match.view().phase).toBe('results');
    expect(h.match.view().survivorId).toBe('a');
    expect(h.score('a')).toBe(1 + 3);
  });
});

describe('host / leader removal (C3 note 2)', () => {
  it('host remove: kick, egg removed, color freed, every phone resynced and persisted', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.msg('c', { t: 'profile', name: 'Cee', color: 'rose' });
    const sentBefore = h.sent.length;
    h.match.hostAction({ kind: 'remove', playerId: 'c' });
    expect(h.kicks).toEqual(['c']);
    expect(h.sim.removedEggs).toEqual(['c']);
    expect(ids(h)).toEqual(['a', 'b']);
    // a removed phone gets no `left` screen: the relay kick tells it it was removed
    expect(h.sent.slice(sentBefore).some((s) => s.to === 'c')).toBe(false);
    expectGoneFromScreens(h, 'c', ['a', 'b']);
    expect(savedKeys(h)).toEqual(['key-a', 'key-b']);
    expect(h.storage.getItem(STORAGE_KEY)).not.toContain('key-c');
    h.join('d');
    h.msg('d', { t: 'profile', name: 'D', color: 'rose' });
    expect(h.match.view().players.find((p) => p.id === 'd')?.color).toBe('rose');
  });

  it('removes disconnected ("away") players in the lobby so others can take the spot', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c']) h.join(id);
    h.match.playerLeft('b');
    h.match.playerLeft('c');
    h.match.hostAction({ kind: 'remove', playerId: 'b' });
    h.msg('a', { t: 'leader', action: 'remove', playerId: 'c' });
    expect(h.kicks).toEqual(['b', 'c']);
    expect(ids(h)).toEqual(['a']);
    expect(h.last('a').standings.map((s) => s.playerId)).toEqual(['a']);
    h.join('d');
    expect(h.match.view().players.find((p) => p.id === 'd')?.color).toBe('cobalt');
  });

  it('leader remove of a disconnected player mid-round removes their egg', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.match.playerLeft('c');
    h.msg('a', { t: 'leader', action: 'remove', playerId: 'c' });
    expect(h.kicks).toEqual(['c']);
    expect(h.sim.removedEggs).toEqual(['c']);
    expect(ids(h)).toEqual(['a', 'b']);
    expect(h.match.view().phase).toBe('playing');
  });

  it('removing a late rejoiner also removes their stale egg', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.match.playerLeft('c');
    h.join('c2', 'key-c');
    h.match.hostAction({ kind: 'remove', playerId: 'c2' });
    expect(h.kicks).toEqual(['c2']);
    expect(h.sim.removedEggs).toContain('c');
    expect(ids(h)).toEqual(['a', 'b']);
  });

  it('removing the leader hands leadership off (host only)', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c']) h.join(id);
    h.match.hostAction({ kind: 'remove', playerId: 'a' });
    expect(h.match.view().leaderId).toBe('b');
    expect(h.last('b').isLeader).toBe(true);
  });

  it('leader self-remove, non-leader remove, unknown targets and bad payloads are ignored', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c']) h.join(id);
    h.msg('a', { t: 'leader', action: 'remove', playerId: 'a' });
    h.msg('b', { t: 'leader', action: 'remove', playerId: 'c' });
    h.msg('a', { t: 'leader', action: 'remove', playerId: 'zz' });
    h.msg('a', { t: 'leader', action: 'remove' });
    h.msg('a', { t: 'leader', action: 'remove', playerId: 7 });
    h.match.hostAction({ kind: 'remove', playerId: 'zz' });
    expect(h.kicks).toEqual([]);
    expect(ids(h)).toEqual(['a', 'b', 'c']);
  });

  it('removal is ignored while the host is hidden (like other leader actions)', () => {
    const h = setup();
    for (const id of ['a', 'b']) h.join(id);
    h.match.setHostVisible(false);
    h.match.hostAction({ kind: 'remove', playerId: 'b' });
    h.msg('a', { t: 'leader', action: 'remove', playerId: 'b' });
    expect(h.kicks).toEqual([]);
    // Leave still works from the paused overlay
    h.msg('b', { t: 'leave' });
    expect(h.kicks).toEqual(['b']);
  });

  it('screens and the view carry playerId + connected for remove controls / away state', () => {
    const h = setup();
    for (const id of ['a', 'b']) h.join(id);
    h.match.playerLeft('b');
    expect(h.last('a').standings).toEqual([
      expect.objectContaining({ playerId: 'a', connected: true }),
      expect.objectContaining({ playerId: 'b', connected: false }),
    ]);
    expect(h.match.view().players.map((p) => [p.id, p.connected])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });
});
