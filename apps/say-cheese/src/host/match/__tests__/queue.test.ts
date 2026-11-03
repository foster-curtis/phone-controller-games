// Turn queue (SPEC §6.1, §6.3): once each, no-camera skipped, disconnected swapped to the end.
import { describe, expect, it } from 'vitest';
import type { SeatId } from '../../../shared/seats';
import { takeNext } from '../queue';
import type { Player } from '../types';
import { setup, started } from './harness';

const p = (id: SeatId, o: Partial<Player> = {}) =>
  ({ id, left: false, spectator: false, camera: 'ok', connected: true, ...o }) as Player;

describe('takeNext', () => {
  it('a disconnected head swaps with the next connected seat and moves to the end', () => {
    const players = [p('a#0', { connected: false }), p('b#0'), p('c#0')];
    expect(takeNext(['a#0', 'b#0', 'c#0'], players)).toEqual({
      photographer: 'b#0',
      queue: ['c#0', 'a#0'],
    });
  });

  it('skips everyone when nobody left in the queue is connected', () => {
    const players = [p('a#0', { connected: false }), p('b#0', { connected: false })];
    expect(takeNext(['a#0', 'b#0'], players)).toEqual({ photographer: null, queue: [] });
  });

  it('drops seats that left or lost their camera', () => {
    const players = [p('a#0', { left: true }), p('b#0', { camera: 'denied' }), p('c#0')];
    expect(takeNext(['a#0', 'b#0', 'c#0'], players)).toEqual({ photographer: 'c#0', queue: [] });
  });
});

describe('in a match', () => {
  it('every seat photographs exactly once, then the match ends', () => {
    const h = started(6, 7);
    const order: string[] = [];
    while (h.m.state.phase !== 'matchEnd') {
      order.push(h.photographer().id);
      h.playRound();
      h.ctl('next');
    }
    expect(order).toHaveLength(6);
    expect(new Set(order).size).toBe(6);
    expect(h.m.state.turns).toBe(6);
  });

  it('no-camera phones’ seats are skipped', () => {
    const h = setup();
    h.join('p1');
    h.join('p2', 'B', { camera: false });
    h.join('p3', 'C', { camera: null });
    h.join('p4');
    h.ctl('start');
    h.ctl('skip');
    const order: string[] = [];
    while (h.m.state.phase !== 'matchEnd') {
      order.push(h.photographer().id);
      h.playRound();
      h.ctl('next');
    }
    expect(order.sort()).toEqual(['p1#0', 'p4#0']);
  });

  it('a disconnected photographer at turn start goes last; still gone at the end → skipped', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const h = started(4, seed);
      const upcoming = h.m.state.queue[0]!;
      const phone = upcoming.split('#')[0]!;
      h.playRound();
      h.disconnect(phone);
      h.ctl('next');
      expect(h.photographer().id).not.toBe(upcoming);
      expect(h.m.state.queue.at(-1)).toBe(upcoming);
      const order: string[] = [];
      while (h.m.state.phase !== 'matchEnd') {
        order.push(h.photographer().id);
        h.playRound();
        h.ctl('next');
      }
      expect(order).toHaveLength(2);
      expect(order).not.toContain(upcoming);
    }
  });

  it('a swapped photographer who comes back takes their turn at the end', () => {
    const h = started(4, 3);
    const upcoming = h.m.state.queue[0]!;
    h.playRound();
    h.disconnect(upcoming.split('#')[0]!);
    h.ctl('next');
    h.rejoin(upcoming.split('#')[0]!);
    const order: string[] = [];
    while (h.m.state.phase !== 'matchEnd') {
      order.push(h.photographer().id);
      h.playRound();
      h.ctl('next');
    }
    expect(order).toHaveLength(3);
    expect(order.at(-1)).toBe(upcoming);
  });
});
