// Lobby and presence (SPEC §11.1–§11.3, §15.6 "Lobby and presence").
import { describe, expect, it } from 'vitest';
import { cleanName, createParty, type Party } from './index';

const COLORS = ['cobalt', 'jade', 'sky', 'bone', 'rose', 'forest'] as const;
type Color = (typeof COLORS)[number];
type Cls = 'engineer' | 'warden';

const party = (): Party<Color, Cls> => createParty<Color, Cls>({ colors: COLORS, maxPlayers: 6 });

/** Joins `n` phones p1..pn (keys k1..kn), named and with a class. */
function filled(n: number, opts: { ready?: boolean } = {}) {
  const p = party();
  for (let i = 1; i <= n; i++) {
    p.connect({ playerId: `p${i}`, key: `k${i}`, deviceId: `d${i}` });
    p.setName(`p${i}`, `Player ${i}`);
    p.setClass(`p${i}`, 'engineer');
    if (opts.ready) p.setReady(`p${i}`, true);
  }
  return p;
}

describe('roster', () => {
  it('assigns colors in brand order, reusing the lowest freed color', () => {
    const p = filled(4);
    expect(p.members.map((m) => m.color)).toEqual(['cobalt', 'jade', 'sky', 'bone']);
    expect(p.remove(null, 'p2')).toMatchObject({ ok: true });
    p.connect({ playerId: 'p5' });
    expect(p.member('p5')!.color).toBe('jade');
    p.connect({ playerId: 'p6' });
    expect(p.member('p6')!.color).toBe('rose');
  });

  it('keeps join order', () => {
    const p = filled(3);
    expect(p.members.map((m) => m.playerId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('a seventh phone sees full; a known phone still rejoins', () => {
    const p = filled(6);
    expect(p.connect({ playerId: 'p7', key: 'k7' })).toEqual({ kind: 'full' });
    expect(p.members).toHaveLength(6);
    p.disconnect('p3');
    expect(p.connect({ playerId: 'p3b', key: 'k3' })).toMatchObject({ kind: 'rejoined' });
    p.remove(null, 'p6');
    expect(p.connect({ playerId: 'p7', key: 'k7' })).toMatchObject({ kind: 'joined' });
  });

  it('rejects colors fewer than the player cap', () => {
    expect(() => createParty({ colors: ['a'], maxPlayers: 2 })).toThrow();
  });
});

describe('names', () => {
  it('trims, collapses whitespace, drops control characters, ≤ 10 characters', () => {
    expect(cleanName('  Ada   Lovelace  ')).toBe('Ada Lovela');
    expect(cleanName('a\u0000b\nc')).toBe('ab c');
    expect(cleanName('🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂')).toBe('🙂'.repeat(10));
    expect(cleanName('abc', 2)).toBe('ab');
  });

  it('refuses an empty name', () => {
    const p = party();
    p.connect({ playerId: 'p1' });
    expect(p.setName('p1', '   ')).toEqual({ ok: false, reason: 'invalid' });
    expect(p.setName('p1', 'Zed')).toEqual({ ok: true });
    expect(p.member('p1')!.name).toBe('Zed');
    expect(p.setName('nobody', 'Zed')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('leader', () => {
  it('the first joiner leads', () => {
    const p = filled(3);
    expect(p.leaderId).toBe('p1');
    expect(p.isLeader('p1')).toBe(true);
    expect(p.isLeader('p2')).toBe(false);
  });

  it('hands off to the next-earliest connected player and doesn’t snap back', () => {
    const p = filled(3);
    p.disconnect('p1');
    expect(p.leaderId).toBe('p2');
    p.connect({ playerId: 'p1', key: 'k1' });
    expect(p.leaderId).toBe('p2');
    p.disconnect('p2');
    expect(p.leaderId).toBe('p1'); // earliest joined connected
  });

  it('skips disconnected players in the handoff', () => {
    const p = filled(3);
    p.disconnect('p2');
    p.disconnect('p1');
    expect(p.leaderId).toBe('p3');
  });

  it('keeps the leader while nobody is connected, then the first back leads', () => {
    const p = filled(2);
    p.disconnect('p2');
    p.disconnect('p1');
    expect(p.leaderId).toBe('p1');
    p.connect({ playerId: 'p2' });
    expect(p.leaderId).toBe('p2');
    p.connect({ playerId: 'p1' });
    expect(p.leaderId).toBe('p2');
  });

  it('a removed leader’s role passes on (TV removal)', () => {
    const p = filled(3);
    p.remove(null, 'p1');
    expect(p.leaderId).toBe('p2');
  });
});

describe('ready and start', () => {
  it('ready needs a name and a class', () => {
    const p = party();
    p.connect({ playerId: 'p1' });
    expect(p.setReady('p1', true)).toEqual({ ok: false, reason: 'invalid' });
    p.setName('p1', 'A');
    expect(p.setReady('p1', true)).toEqual({ ok: false, reason: 'invalid' });
    p.setClass('p1', 'warden');
    expect(p.setReady('p1', true)).toEqual({ ok: true });
    expect(p.member('p1')!.ready).toBe(true);
  });

  it('auto-starts when every connected player is ready (at least 2)', () => {
    const p = filled(3);
    expect(p.canAutoStart()).toBe(false);
    p.setReady('p1', true);
    p.setReady('p2', true);
    expect(p.canAutoStart()).toBe(false);
    p.setReady('p3', true);
    expect(p.canAutoStart()).toBe(true);
    p.setReady('p3', false);
    p.disconnect('p3'); // a dropped phone doesn't hold the lobby
    expect(p.canAutoStart()).toBe(true);
    const solo = filled(1, { ready: true });
    expect(solo.canAutoStart()).toBe(false);
  });

  it('the leader can force-start once 2 players are ready', () => {
    const p = filled(4);
    p.setReady('p2', true);
    expect(p.canForceStart('p1')).toEqual({ ok: false, reason: 'invalid' });
    p.setReady('p3', true);
    expect(p.canForceStart('p1')).toEqual({ ok: true });
    expect(p.canForceStart('p2')).toEqual({ ok: false, reason: 'notLeader' });
  });

  it('starts a run with a slot per named player with a class, in join order', () => {
    const p = filled(3, { ready: true });
    p.connect({ playerId: 'p4' }); // no name or class yet
    p.disconnect('p2');
    const r = p.startRun();
    expect(r).toEqual({
      ok: true,
      slots: [
        {
          slot: 0,
          playerId: 'p1',
          name: 'Player 1',
          color: 'cobalt',
          classId: 'engineer',
          connected: true,
        },
        {
          slot: 1,
          playerId: 'p2',
          name: 'Player 2',
          color: 'jade',
          classId: 'engineer',
          connected: false,
        },
        {
          slot: 2,
          playerId: 'p3',
          name: 'Player 3',
          color: 'sky',
          classId: 'engineer',
          connected: true,
        },
      ],
    });
    expect(p.stage).toBe('combat');
    expect(p.member('p4')!.slot).toBeNull();
    expect(p.startRun()).toEqual({ ok: false, reason: 'phase' });
  });
});

describe('removal', () => {
  it('the leader removes any other player in the lobby', () => {
    const p = filled(3);
    const r = p.remove('p1', 'p3');
    expect(r).toMatchObject({ ok: true, removed: { playerId: 'p3' } });
    expect(p.member('p3')).toBeNull();
    expect(p.remove('p1', 'p1')).toEqual({ ok: false, reason: 'invalid' });
    expect(p.remove('p2', 'p1')).toEqual({ ok: false, reason: 'notLeader' });
    expect(p.remove('p1', 'nobody')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('is lobby-only: once a run starts nobody can be removed, and drops stay in', () => {
    const p = filled(3, { ready: true });
    p.startRun();
    expect(p.remove('p1', 'p2')).toEqual({ ok: false, reason: 'phase' });
    expect(p.remove(null, 'p2')).toEqual({ ok: false, reason: 'phase' });
    p.disconnect('p2');
    expect(p.member('p2')).toMatchObject({ connected: false, slot: 1 });
    p.setStage('build');
    expect(p.remove(null, 'p2')).toEqual({ ok: false, reason: 'phase' });
  });
});

describe('matching (§15.6: playerId → player key → device ID)', () => {
  it('matches a token rejoin by playerId', () => {
    const p = filled(2);
    p.disconnect('p2');
    expect(p.connect({ playerId: 'p2' })).toMatchObject({
      kind: 'rejoined',
      member: { name: 'Player 2' },
    });
    expect(p.member('p2')!.connected).toBe(true);
  });

  it('matches by player key after the token window, taking the new playerId', () => {
    const p = filled(3, { ready: true });
    p.startRun();
    p.disconnect('p2');
    const r = p.connect({ playerId: 'new2', key: 'k2' });
    expect(r).toMatchObject({ kind: 'rejoined', member: { playerId: 'new2', slot: 1 } });
    expect(p.member('p2')).toBeNull();
    expect(p.members).toHaveLength(3);
  });

  it('matches by device ID when the key is unknown', () => {
    const p = filled(2);
    const r = p.connect({ playerId: 'x', key: 'other', deviceId: 'd2' });
    // A device-ID match is a resume into a new room, so it takes the new relay key.
    expect(r).toMatchObject({
      kind: 'rejoined',
      member: { name: 'Player 2', playerId: 'x', key: 'other' },
    });
  });

  it('playerId beats key, and key beats device ID', () => {
    const p = filled(3);
    expect(p.connect({ playerId: 'p1', key: 'k2', deviceId: 'd3' })).toMatchObject({
      member: { name: 'Player 1' },
    });
    expect(p.connect({ playerId: 'y', key: 'k2', deviceId: 'd3' })).toMatchObject({
      member: { name: 'Player 2' },
    });
  });

  it('a rejoin fills in a missing key or device ID', () => {
    const p = party();
    p.connect({ playerId: 'p1' });
    p.connect({ playerId: 'p1', key: 'k1', deviceId: 'd1' });
    expect(p.member('p1')).toMatchObject({ key: 'k1', deviceId: 'd1' });
  });

  it('unknown playerId on disconnect is ignored', () => {
    const p = filled(1);
    expect(p.disconnect('nobody')).toBeNull();
  });
});

describe('late joins (§11.2)', () => {
  it('a phone joining during combat waits for the next build phase', () => {
    const p = filled(2, { ready: true });
    p.startRun();
    expect(p.connect({ playerId: 'late' })).toMatchObject({ kind: 'joined' });
    expect(p.screen('late')).toBe('waiting');
    expect(p.screen('p1')).toBe('run');
    expect(p.waiting().map((m) => m.playerId)).toEqual(['late']);
    expect(p.joinLate('late')).toEqual({ ok: false, reason: 'phase' });
    p.setStage('build');
    expect(p.screen('late')).toBe('name');
    p.setName('late', 'Late');
    expect(p.screen('late')).toBe('lobby');
    expect(p.joinLate('late')).toEqual({ ok: false, reason: 'invalid' }); // no class yet
    p.setClass('late', 'warden');
    expect(p.joinLate('late')).toEqual({
      ok: true,
      slot: {
        slot: 2,
        playerId: 'late',
        name: 'Late',
        color: 'sky',
        classId: 'warden',
        connected: true,
      },
    });
    expect(p.screen('late')).toBe('run');
    expect(p.joinLate('late')).toEqual({ ok: false, reason: 'invalid' });
    expect(p.waiting()).toEqual([]);
  });

  it('slots are held for the whole run: a late slot never reuses a dropped one', () => {
    const p = filled(3, { ready: true });
    p.startRun();
    p.disconnect('p3');
    p.setStage('build');
    p.connect({ playerId: 'late' });
    p.setName('late', 'L');
    p.setClass('late', 'engineer');
    expect(p.joinLate('late')).toMatchObject({ ok: true, slot: { slot: 3 } });
  });

  it('players cannot change class or name mid-run; lobby ready is lobby-only', () => {
    const p = filled(2, { ready: true });
    p.startRun();
    p.setStage('build');
    expect(p.setClass('p1', 'warden')).toEqual({ ok: false, reason: 'phase' });
    expect(p.setName('p1', 'New')).toEqual({ ok: false, reason: 'phase' });
    expect(p.setReady('p1', false)).toEqual({ ok: false, reason: 'phase' });
  });

  it('lobby screens: name first, then class select', () => {
    const p = party();
    p.connect({ playerId: 'p1' });
    expect(p.screen('p1')).toBe('name');
    p.setName('p1', 'A');
    expect(p.screen('p1')).toBe('lobby');
    expect(p.screen('nobody')).toBeNull();
  });

  it('ending a run returns everyone to the lobby, keeping names, colors and classes', () => {
    const p = filled(2, { ready: true });
    p.startRun();
    p.endRun();
    expect(p.stage).toBe('lobby');
    expect(p.members.map((m) => [m.slot, m.ready, m.classId, m.color])).toEqual([
      [null, false, 'engineer', 'cobalt'],
      [null, false, 'engineer', 'jade'],
    ]);
  });
});
