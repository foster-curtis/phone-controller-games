import { describe, expect, it } from 'vitest';
import { PLAYER_COLOR_IDS, isPlayerColorId } from '../../../shared/messages';
import { NAME_MAX } from '../config';
import { Roster, sanitizeName, standings } from '../roster';
import { setup } from './fakeSim';

describe('names', () => {
  it('trims and caps at 10 chars', () => {
    expect(sanitizeName('   Sunny  ', 0)).toBe('Sunny');
    expect(sanitizeName('ABCDEFGHIJKLMNOP', 0)).toBe('ABCDEFGHIJ');
    expect(sanitizeName('ABCDEFGHIJKLMNOP', 0)).toHaveLength(NAME_MAX);
    // code points, not UTF-16 units
    expect(Array.from(sanitizeName('🍳🍳🍳🍳🍳🍳🍳🍳🍳🍳🍳🍳', 0))).toHaveLength(10);
  });

  it('empty or blank → "Egg N" (join order, 1-based)', () => {
    expect(sanitizeName('', 0)).toBe('Egg 1');
    expect(sanitizeName('    ', 2)).toBe('Egg 3');
  });

  it('joiners get "Egg N" until they send a profile; profile name is sanitized', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    expect(h.last('b').name).toBe('Egg 2');
    h.msg('b', { t: 'profile', name: '  Scrambled Legs  ', color: 'jade' });
    expect(h.last('b').name).toBe('Scrambled');
    h.msg('b', { t: 'profile', name: '   ', color: 'jade' });
    expect(h.last('b').name).toBe('Egg 2');
  });
});

describe('colors', () => {
  it('auto-assigns the first free PlayerColorId in brand order', () => {
    const h = setup();
    for (const id of ['a', 'b', 'c']) h.join(id);
    const colors = h.match.view().players.map((p) => p.color);
    expect(colors).toEqual(['crimson', 'cobalt', 'jade']);
    expect(colors.every(isPlayerColorId)).toBe(true);
    // free one up; the next joiner gets the first gap
    h.msg('a', { t: 'profile', name: 'A', color: 'rose' });
    h.join('d');
    expect(h.match.view().players.find((p) => p.id === 'd')?.color).toBe('crimson');
  });

  it('rejects a taken color and lists taken colors on the lobby screen', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.msg('b', { t: 'profile', name: 'Bee', color: 'crimson' });
    const s = h.last('b');
    expect(s.kind).toBe('lobby');
    expect(s.color).toBe('cobalt');
    expect(s.name).toBe('Bee');
    if (s.kind !== 'lobby') throw new Error();
    expect(s.takenColors).toEqual(['crimson']);
    const a = h.last('a');
    if (a.kind !== 'lobby') throw new Error();
    expect(a.takenColors).toEqual(['cobalt']);
  });

  it('accepts a free color and ignores an invalid one', () => {
    const h = setup();
    h.join('a');
    h.msg('a', { t: 'profile', name: 'A', color: 'forest' });
    expect(h.last('a').color).toBe('forest');
    h.msg('a', { t: 'profile', name: 'Z', color: '#ff0000' });
    expect(h.last('a').color).toBe('forest');
    expect(h.last('a').name).toBe('A');
  });

  it('runs out after 8 colors (null)', () => {
    const r = new Roster();
    for (let i = 0; i < 9; i++) r.add(`p${i}`, `k${i}`);
    expect(r.players.slice(0, 8).map((p) => p.color)).toEqual([...PLAYER_COLOR_IDS]);
    expect(r.players[8]!.color).toBeNull();
  });
});

describe('mid-match joiners', () => {
  it('spectate until the next round starts, then get an egg', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    h.join('c');
    expect(h.last('c').kind).toBe('spectating');
    expect(h.match.view().players.find((p) => p.id === 'c')?.spectating).toBe(true);
    expect(h.sim.lastRound.map((e) => e.id)).toEqual(['a', 'b']);
    h.eliminate('b');
    expect(h.last('c').kind).toBe('results');
    h.match.hostAction('next');
    expect(h.sim.lastRound.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(h.last('c').kind).toBe('countdown');
    expect(h.match.view().players.find((p) => p.id === 'c')?.spectating).toBe(false);
  });
});

describe('standings', () => {
  it('sorts by score, then join order', () => {
    const r = new Roster();
    const a = r.add('a', 'ka');
    const b = r.add('b', 'kb');
    const c = r.add('c', 'kc');
    a.score = 1;
    b.score = 3;
    c.score = 1;
    expect(standings(r.players).map((s) => s.playerId)).toEqual(['b', 'a', 'c']);
  });
});
