// How to play flow (SPEC §6.9): first Start, lobby reopen, Next/Skip, gating, roster changes,
// persistence. Uses the match API only (the kit shell and phone screen are not involved).
import { describe, expect, it } from 'vitest';
import { RULES_CARD_COUNT } from '../../howToPlay/cards';
import { RULES_CARDS, STORAGE_KEY } from '../config';
import { loadPersisted } from '../persist';
import { MemStorage, setup } from './fakeSim';

function lobbyOf(ids: string[]) {
  const h = setup();
  for (const id of ids) h.join(id);
  h.readyAll();
  return h;
}

describe('How to play flow', () => {
  it('RULES_CARDS matches the card list', () => {
    expect(RULES_CARDS).toBe(RULES_CARD_COUNT);
  });

  it('the first Start opens the overview; Rematch never does', () => {
    const h = lobbyOf(['a', 'b']);
    h.match.hostAction('start');
    expect(h.match.view().phase).toBe('rules');
    expect(h.match.view().rules).toMatchObject({ source: 'firstStart', card: 0, cards: 6 });
    expect(h.sim.rounds).toHaveLength(0);
    h.match.hostAction('skip');
    expect(h.match.view().phase).toBe('countdown');
    h.runMs(3000);
    for (let i = 0; i < 20 && h.match.view().phase !== 'matchEnd'; i++) {
      if (h.match.view().phase === 'results') {
        h.match.hostAction('next');
        h.runMs(3000);
      }
      h.eliminate('b', 'a');
    }
    expect(h.match.view().phase).toBe('matchEnd');
    h.match.hostAction('rematch');
    expect(h.match.view().phase).toBe('countdown');
  });

  it('a second Start (overview already seen) begins the match; How to play is lobby-only', () => {
    const h = lobbyOf(['a', 'b']);
    h.match.hostAction('start');
    h.match.hostAction('skip');
    h.runMs(3000);
    h.match.hostAction('howToPlay');
    expect(h.match.view().phase).toBe('playing');
  });

  it('Next through every card starts the countdown on the last one', () => {
    const h = lobbyOf(['a', 'b']);
    h.msg('a', { t: 'leader', action: 'start' });
    for (let i = 0; i < RULES_CARDS - 1; i++) {
      expect(h.match.view().rules?.card).toBe(i);
      expect(h.last('b')).toMatchObject({ kind: 'rules', card: i, cards: RULES_CARDS });
      h.msg('a', { t: 'leader', action: 'next' });
    }
    expect(h.match.view().rules?.card).toBe(RULES_CARDS - 1);
    h.msg('a', { t: 'leader', action: 'next' });
    expect(h.match.view()).toMatchObject({ phase: 'countdown', rules: null, round: 1 });
    expect(h.sim.rounds).toHaveLength(1);
  });

  it('Skip from any card finishes the overview', () => {
    const h = lobbyOf(['a', 'b']);
    h.match.hostAction('start');
    h.match.hostAction('next');
    h.msg('a', { t: 'leader', action: 'skip' });
    expect(h.match.view().phase).toBe('countdown');
  });

  it('How to play from the lobby returns to the lobby and keeps Ready and difficulty', () => {
    const h = lobbyOf(['a', 'b', 'c']);
    h.msg('a', { t: 'leader', action: 'difficulty', difficulty: 'hard' });
    h.msg('a', { t: 'leader', action: 'howToPlay' });
    expect(h.match.view().rules).toMatchObject({ source: 'lobby', card: 0 });
    h.match.hostAction('skip');
    let v = h.match.view();
    expect(v.phase).toBe('lobby');
    expect(v.difficulty).toBe('hard');
    expect(v.players.filter((p) => p.id !== 'a').every((p) => p.ready)).toBe(true);
    // Reading to the end also returns to the lobby, and the room has still not "seen" it.
    h.match.hostAction('howToPlay');
    for (let i = 0; i < RULES_CARDS; i++) h.match.hostAction('next');
    v = h.match.view();
    expect(v.phase).toBe('lobby');
    h.match.hostAction('start');
    expect(h.match.view().rules?.source).toBe('firstStart');
  });

  it('only the leader (and the host) can drive it', () => {
    const h = lobbyOf(['a', 'b']);
    h.msg('b', { t: 'leader', action: 'howToPlay' });
    expect(h.match.view().phase).toBe('lobby');
    h.match.hostAction('howToPlay');
    h.msg('b', { t: 'leader', action: 'next' });
    h.msg('b', { t: 'leader', action: 'skip' });
    expect(h.match.view().rules?.card).toBe(0);
    h.msg('a', { t: 'leader', action: 'next' });
    expect(h.match.view().rules?.card).toBe(1);
  });

  it('actions are ignored while the host is paused', () => {
    const h = lobbyOf(['a', 'b']);
    h.match.hostAction('start');
    h.match.setHostVisible(false);
    h.match.hostAction('next');
    expect(h.match.view().rules?.card).toBe(0);
    expect(h.last('a').kind).toBe('gamePaused');
    h.match.setHostVisible(true);
    expect(h.last('a')).toMatchObject({ kind: 'rules', card: 0 });
  });

  it('leader handoff moves the buttons to the new leader', () => {
    const h = lobbyOf(['a', 'b', 'c']);
    h.match.hostAction('start');
    expect(h.last('a')).toMatchObject({ kind: 'rules', isLeader: true });
    h.match.playerLeft('a');
    expect(h.match.view().leaderId).toBe('b');
    expect(h.last('b')).toMatchObject({ kind: 'rules', isLeader: true });
    h.msg('a', { t: 'leader', action: 'next' });
    h.msg('b', { t: 'leader', action: 'next' });
    expect(h.match.view().rules?.card).toBe(1);
  });

  it('a joiner is seated, not spectating; the match then includes them', () => {
    const h = lobbyOf(['a', 'b']);
    h.match.hostAction('start');
    h.join('c');
    expect(h.last('c')).toMatchObject({ kind: 'rules', isLeader: false });
    expect(h.match.view().players.find((p) => p.id === 'c')?.spectating).toBe(false);
    expect(h.match.view().rules?.playerCount).toBe(3);
    expect(h.last('c').targetScore).toBe(13);
    h.match.hostAction('skip');
    expect(h.sim.lastRound.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('a leave mid-overview drops the player; too few players at the finish go back to the lobby', () => {
    const h = lobbyOf(['a', 'b']);
    h.match.hostAction('start');
    h.msg('b', { t: 'leave' });
    expect(h.match.view().players.map((p) => p.id)).toEqual(['a']);
    expect(h.match.view().rules?.playerCount).toBe(1);
    h.match.hostAction('skip');
    expect(h.match.view().phase).toBe('lobby');
    expect(h.sim.rounds).toHaveLength(0);
    expect(h.last('a').kind).toBe('lobby');
  });

  it('an away player at the finish counts as gone', () => {
    const h = lobbyOf(['a', 'b']);
    h.match.hostAction('start');
    h.match.playerLeft('b');
    h.match.hostAction('skip');
    expect(h.match.view().phase).toBe('lobby');
  });

  it('removal mid-overview works as in the lobby', () => {
    const h = lobbyOf(['a', 'b', 'c']);
    h.match.hostAction('start');
    h.msg('a', { t: 'leader', action: 'remove', playerId: 'c' });
    expect(h.kicks).toContain('c');
    expect(h.match.view().rules?.playerCount).toBe(2);
  });

  it('view.rules carries the player count the match would use, and the target follows', () => {
    const h = lobbyOf(['a', 'b', 'c', 'd']);
    h.match.hostAction('start');
    expect(h.match.view().rules?.playerCount).toBe(4);
    expect(h.match.view().targetScore).toBe(12);
    expect(h.last('a').targetScore).toBe(12);
    h.match.hostAction('skip');
    expect(h.match.view().rules).toBeNull();
    expect(h.match.view().targetScore).toBe(12);
  });
});

describe('How to play persistence', () => {
  it('rulesSeen round-trips through storage', () => {
    const storage = new MemStorage();
    const h = setup(storage);
    for (const id of ['a', 'b']) h.join(id);
    expect(loadPersisted(storage)?.rulesSeen).toBe(false);
    h.readyAll();
    h.match.hostAction('start');
    expect(loadPersisted(storage)?.rulesSeen).toBe(true);
  });

  it('a host refresh during the overview lands in the lobby with rulesSeen kept', () => {
    const storage = new MemStorage();
    const h1 = setup(storage);
    for (const id of ['a', 'b']) h1.join(id);
    h1.readyAll();
    h1.match.hostAction('start');
    expect(h1.match.view().phase).toBe('rules');
    const h2 = setup(storage);
    h2.match.restore([
      { playerId: 'a', playerKey: 'key-a', connected: true },
      { playerId: 'b', playerKey: 'key-b', connected: true },
    ]);
    expect(h2.match.view()).toMatchObject({ phase: 'lobby', rules: null });
    expect(h2.last('a').kind).toBe('lobby');
    h2.readyAll();
    h2.match.hostAction('start'); // seen already: straight to the countdown
    expect(h2.match.view().phase).toBe('countdown');
  });

  it('an old save without rulesSeen still loads, as not seen', () => {
    const storage = new MemStorage();
    const h1 = setup(storage);
    h1.join('a');
    h1.join('b');
    const saved = JSON.parse(storage.getItem(STORAGE_KEY)!);
    delete saved.rulesSeen;
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
    expect(loadPersisted(storage)).not.toBeNull();
    const h2 = setup(storage);
    h2.match.restore([
      { playerId: 'a', playerKey: 'key-a', connected: true },
      { playerId: 'b', playerKey: 'key-b', connected: true },
    ]);
    h2.readyAll();
    h2.match.hostAction('start');
    expect(h2.match.view().phase).toBe('rules');
  });

  it('rejects a malformed rulesSeen', () => {
    const storage = new MemStorage();
    const h = setup(storage);
    h.join('a');
    const saved = JSON.parse(storage.getItem(STORAGE_KEY)!);
    saved.rulesSeen = 'yes';
    storage.setItem(STORAGE_KEY, JSON.stringify(saved));
    expect(loadPersisted(storage)).toBeNull();
  });
});
