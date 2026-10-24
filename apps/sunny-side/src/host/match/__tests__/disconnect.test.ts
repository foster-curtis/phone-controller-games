import { describe, expect, it } from 'vitest';
import { setup } from './fakeSim';

describe('disconnect mid-round', () => {
  it('peer left → egg frozen + input zeroed; peer rejoined → active again', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.msg('b', [100, 0, 0, 0, 0]);
    h.match.playerLeft('b');
    expect(h.sim.frozenCalls).toContainEqual(['b', true]);
    expect(h.sim.frozen.get('b')).toBe(true);
    expect(h.sim.inputs.get('b')).toBeNull();
    const view = h.match.view();
    expect(view.players.find((p) => p.id === 'b')).toMatchObject({ connected: false, alive: true });
    // input from a dropped phone is ignored
    h.msg('b', [100, 0, 0, 0, 0]);
    expect(h.sim.inputs.get('b')).toBeNull();
    // still hittable: it can be knocked out with credit
    h.match.playerRejoined('b', 'key-b');
    expect(h.sim.frozen.get('b')).toBe(false);
    expect(h.last('b').kind).toBe('playing');
    h.match.playerLeft('b');
    h.eliminate('b', 'a');
    expect(h.score('a')).toBe(1);
  });

  it('disconnect during countdown keeps the egg frozen after the countdown', () => {
    const h = setup();
    for (const id of ['a', 'b']) h.join(id);
    h.match.hostAction('start');
    h.match.playerLeft('b');
    h.runMs(3000);
    expect(h.sim.frozen.get('a')).toBe(false);
    expect(h.sim.frozen.get('b')).toBe(true);
  });

  it('standings show the dropped player as disconnected', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    h.match.playerLeft('b');
    const st = h.last('a').standings.find((s) => s.playerId === 'b');
    expect(st).toMatchObject({ connected: false, left: false });
  });
});

describe('self-pause', () => {
  it('pause → frozen + input zeroed; resume → active', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    h.msg('a', [10, 10, 0, 0, 0]);
    h.msg('a', { t: 'pause' });
    expect(h.sim.frozen.get('a')).toBe(true);
    expect(h.sim.inputs.get('a')).toBeNull();
    expect(h.match.view().players[0]!.selfPaused).toBe(true);
    h.msg('a', [10, 10, 0, 0, 0]);
    expect(h.sim.inputs.get('a')).toBeNull();
    h.msg('a', { t: 'resume' });
    expect(h.sim.frozen.get('a')).toBe(false);
    expect(h.match.view().players[0]!.selfPaused).toBe(false);
  });

  it('pausing in the lobby touches no egg', () => {
    const h = setup();
    h.join('a');
    h.msg('a', { t: 'pause' });
    h.msg('a', { t: 'resume' });
    expect(h.sim.frozenCalls).toHaveLength(0);
  });
});

describe('disconnect keeps the spot (C3 note: only Leave removes)', () => {
  it('a dropped player keeps score, color and roster spot; a key rejoin restores them', () => {
    const h = setup();
    h.startGame(['a', 'b', 'c']);
    h.msg('b', { t: 'profile', name: 'Bee', color: 'rose' });
    h.eliminate('c', 'b');
    h.match.playerLeft('b');
    expect(h.kicks).toEqual([]);
    expect(h.sim.removedEggs).toEqual([]);
    expect(h.match.view().players.find((p) => p.id === 'b')).toMatchObject({
      connected: false,
      score: 1,
      color: 'rose',
    });
    expect(h.last('a').standings.find((s) => s.playerId === 'b')).toMatchObject({
      connected: false,
      score: 1,
    });
    // the color stays reserved while they're away
    h.join('s');
    h.msg('s', { t: 'profile', name: 'S', color: 'rose' });
    expect(h.match.view().players.find((p) => p.id === 's')?.color).not.toBe('rose');
    h.join('b2', 'key-b');
    expect(h.match.view().players.find((p) => p.id === 'b2')).toMatchObject({
      name: 'Bee',
      color: 'rose',
      score: 1,
    });
  });
});

describe('host visibility', () => {
  it('host hidden → every phone gets gamePaused and stepping does nothing', () => {
    const h = setup();
    h.startGame(['a', 'b']);
    h.join('s');
    h.match.setHostVisible(false);
    for (const id of ['a', 'b', 's']) expect(h.last(id).kind).toBe('gamePaused');
    expect(h.match.simRunning).toBe(false);
    expect(h.match.view().paused).toBe(true);
    const steps = h.sim.steps;
    h.sim.queue({ type: 'eliminated', id: 'b', by: 'a', respawnMs: 5000, byGhost: false });
    h.step(120);
    expect(h.sim.steps).toBe(steps);
    expect(h.match.view().phase).toBe('playing');
    h.msg('a', [100, 0, 0, 0, 0]);
    expect(h.sim.inputs.get('a')).toBeUndefined();
    h.match.hostAction('next');
    h.match.setHostVisible(true);
    expect(h.last('a').kind).toBe('playing');
    expect(h.last('s').kind).toBe('spectating');
    h.step();
    expect(h.match.view().phase).toBe('results');
  });

  it('countdown does not advance while hidden', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.match.hostAction('start');
    h.match.setHostVisible(false);
    h.runMs(5000);
    expect(h.match.view().phase).toBe('countdown');
    expect(h.match.view().countdownMs).toBe(3000);
    expect(h.last('a').kind).toBe('gamePaused');
  });
});
