// The RD6 debug commands (SPEC §9.5): fill one knight's build meter or every knight's, and force the
// hot side (the unflared plan now and every later wave, until cleared). Commands, so replays keep them.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import type { PortalId } from '../../../shared/ids';
import { hotState } from '../../debugInfo';
import { harness } from './harness';

const side = (p: PortalId) => content.map!.portals[p].side;

describe('debug: meter', () => {
  it('fills one run slot, or every knight without a target', () => {
    const h = harness(2, 1, { classes: ['warden', 'warden'] });
    h.toCombat();
    for (const p of h.sim.world.players) p.meter = 0.2;
    h.sim.command({ c: 'debug', slot: -1, action: 'meter', target: 1 });
    h.run(1);
    expect(h.p(0).meter).toBeLessThan(1);
    expect(h.p(1).meter).toBe(1);
    h.sim.command({ c: 'debug', slot: -1, action: 'meter' });
    h.run(1);
    expect(h.p(0).meter).toBe(1);
  });

  it('refuses an unknown slot', () => {
    const h = harness(1);
    h.toBuild();
    h.sim.command({ c: 'debug', slot: -1, action: 'meter', target: 5, ref: 9 });
    h.run(1);
    expect(h.events('command')).toEqual([
      { e: 'command', ref: 9, slot: -1, ok: false, reason: 'invalid' },
    ]);
  });
});

describe('debug: force the hot side', () => {
  it('moves the unflared hot-side groups to the forced side, and holds for later waves', () => {
    for (const seed of [1, 2, 3]) {
      const h = harness(2, seed);
      h.toCombat();
      const before = h.sim.world.spawns.map((g) => ({ ...g }));
      const was = before[0]!.hot!;
      const forced = was === 'left' ? 'right' : 'left';
      h.sim.command({ c: 'debug', slot: -1, action: 'hot', side: forced });
      h.run(1);
      expect(h.sim.debugHot).toBe(forced);
      const after = h.sim.world.spawns;
      expect(after.length).toBe(before.length);
      after.forEach((g, i) => {
        const b = before[i]!;
        if (g.flared) return;
        expect(g.hot).toBe(forced);
        // Hot-side groups went to the forced side; the rest stayed put.
        if (side(b.portal) === b.hot) expect(side(g.portal)).toBe(forced);
        else expect(g.portal).toBe(b.portal);
      });
      expect(hotState(h.sim.world, content, h.sim.debugHot)).toMatchObject({
        hot: forced,
        forced,
      });

      // The next wave's plan is forced too; null clears it.
      h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 2 });
      h.run(1);
      h.toCombat();
      for (const g of h.sim.world.spawns) expect(g.hot).toBe(forced);
      h.sim.command({ c: 'debug', slot: -1, action: 'hot', side: null });
      h.run(1);
      expect(h.sim.debugHot).toBeNull();
    }
  });
});

describe('debugInfo: portal activity', () => {
  it('counts queued groups per portal and finds the next pulse', () => {
    const h = harness(1);
    h.toCombat();
    const s = hotState(h.sim.world, content, null);
    const queued = s.portals.reduce((n, p) => n + p.queued, 0);
    expect(queued).toBe(h.sim.world.spawns.length);
    expect(s.hot).not.toBeNull();
    expect(s.portals.every((p) => !p.flaring)).toBe(true);
    // Flares go up ~1 s before a group spawns (§9.4).
    h.until(() => hotState(h.sim.world, content, null).portals.some((p) => p.flaring), 60 * 30);
  });
});
