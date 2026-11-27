// The NPC shopper (SPEC §6.10): state machine edges (technique 1), steering (technique 2), detours and
// forgetting (3), personality (4), human moments (5) and the mind's rolls.
import { afterEach, describe, expect, it } from 'vitest';
import { rngStream } from '@pcg/game-kit';
import { CONTENT } from '../../../../content';
import { quietSim, stepUntil } from '../../__tests__/helpers';
import type { Character } from '../../types';
import { SIM_HZ } from '../../types';
import { chaseCoin, npc, NPC_HOOKS } from '..';
import { TUNING } from '../../tuning';
import { customerSpot } from '../../nav';

const b = CONTENT.balance;
const noBuy = NPC_HOOKS.buy;
afterEach(() => {
  NPC_HOOKS.buy = noBuy;
});

/** An NPC with a fixed wish list and no distractions, so its path is predictable. */
function focused(c: Character, wish: string[]): Character {
  c.npc.wishList = wish as Character['npc']['wishList'];
  c.npc.personality.distractibility = 0;
  c.npc.personality.browseMs = 2000;
  return c;
}

describe('mind (techniques 1 and 4)', () => {
  it('rolls personality, wish list from open selling shops, wants, purse and sale rate in range', () => {
    for (let s = 0; s < 200; s++) {
      const m = npc.createMind(rngStream(s, 'm'), CONTENT, [
        'pawnbroker',
        'jewelry',
        'bakery',
        'wine',
      ]);
      const p = b.npcs.personality;
      expect(m.personality.speed).toBeGreaterThanOrEqual(p.speed[0]);
      expect(m.personality.speed).toBeLessThanOrEqual(p.speed[1]);
      expect(m.personality.browseMs).toBeGreaterThanOrEqual(p.browseMs[0]);
      expect(m.personality.browseMs).toBeLessThanOrEqual(p.browseMs[1]);
      expect(m.wishList.length).toBeGreaterThanOrEqual(b.npcs.wishList[0]);
      expect(m.wishList.length).toBeLessThanOrEqual(b.npcs.wishList[1]);
      expect(new Set(m.wishList).size).toBe(m.wishList.length);
      for (const s2 of m.wishList) expect(['jewelry', 'bakery', 'wine']).toContain(s2);
      expect(m.wants.length).toBe(m.wishList.length);
      expect(m.purse).toBeGreaterThanOrEqual(b.npcs.purse[0]);
      expect(m.saleRate).toBeGreaterThanOrEqual(b.npcSale.rate[0]);
      expect(m.saleRate).toBeLessThanOrEqual(b.npcSale.rate[1]);
      expect(m.state).toBe('entering');
    }
  });

  it('some NPCs are hurried, most are not', () => {
    let hurried = 0;
    for (let s = 0; s < 1000; s++)
      if (npc.createMind(rngStream(s, 'h'), CONTENT).personality.hurried) hurried++;
    expect(hurried).toBeGreaterThan(50);
    expect(hurried).toBeLessThan(300);
  });
});

describe('state machine (technique 1)', () => {
  it('entering → wandering → approaching → browsing → buying → leaving → off the map', () => {
    const sim = quietSim();
    const c = focused(npc.spawn(sim.context(), 'upperLeft'), ['bakery']);
    const bought: number[] = [];
    NPC_HOOKS.buy = (_ctx, who, stall) => {
      if (who === c) bought.push(stall);
    };
    expect(c.npc.state).toBe('entering');
    expect(c.activity.k).toBe('entering');
    expect(c.x).toBeLessThan(0);
    const states: string[] = [];
    let exited = false;
    for (let t = 0; t < 90 * SIM_HZ && !exited; t++) {
      sim.step();
      if (states[states.length - 1] !== c.npc.state) states.push(c.npc.state);
      if (c.npc.state === 'browsing') {
        expect(c.activity).toEqual({ k: 'browsing', stall: 1 });
        expect(c.pose).toBe('browse');
      }
      exited = sim.events().some((e) => e.ch === 'tv' && e.e === 'exit' && e.character === c.id);
    }
    expect(exited).toBe(true);
    expect(sim.world.characters).not.toContain(c);
    // After buying it is briefly wandering again, then (list done) leaves.
    expect(states).toEqual([
      'entering',
      'wandering',
      'approaching',
      'browsing',
      'buying',
      'wandering',
      'leaving',
    ]);
    expect(bought).toEqual([1]);
  });

  it('goes through its whole wish list in order before leaving', () => {
    const sim = quietSim();
    const c = focused(npc.spawn(sim.context(), 'lowerRight'), ['jewelry', 'bakery']);
    const bought: number[] = [];
    NPC_HOOKS.buy = (_ctx, who, stall) => void (who === c && bought.push(stall));
    stepUntil(sim, () => c.npc.state === 'leaving', 150 * SIM_HZ);
    expect(bought).toEqual([9, 1]);
    expect(c.npc.wishList).toEqual([]);
  });

  /** Three players standing at the bakery's counter spots take every spot. */
  function fullBakery() {
    const sim = quietSim(1, TUNING.npc.spots);
    sim.world.characters.forEach((p, i) => {
      const at = customerSpot(CONTENT.layout, 1, i, TUNING.npc.spots);
      p.x = at.x;
      p.y = at.y;
    });
    return sim;
  }

  it('waits in line when every counter spot is taken, then gives up after a while', () => {
    const sim = fullBakery();
    const c = focused(npc.spawn(sim.context(), 'upperLeft'), ['bakery', 'wine']);
    expect(stepUntil(sim, () => c.npc.state === 'waiting', 40 * SIM_HZ)).toBeGreaterThan(0);
    const waitStart = sim.world.tick;
    expect(stepUntil(sim, () => c.npc.state !== 'waiting', 10 * SIM_HZ)).toBeGreaterThan(0);
    expect(sim.world.tick - waitStart).toBeGreaterThanOrEqual(
      sim.context().ticks(TUNING.npc.waitMaxMs) - 1,
    );
    expect(c.npc.state).toBe('wandering');
    // It tries the rest of its list first.
    expect(c.npc.wishList[0]).toBe('wine');
  });

  it('takes a spot as soon as one frees up while waiting', () => {
    const sim = fullBakery();
    const c = focused(npc.spawn(sim.context(), 'upperLeft'), ['bakery']);
    stepUntil(sim, () => c.npc.state === 'waiting', 40 * SIM_HZ);
    const p = sim.world.characters[1]!;
    p.x = 30;
    p.y = 18;
    sim.step();
    expect(c.npc.state).toBe('approaching');
    expect(c.npc.nav!.spot).toBe(1);
  });

  it('chases a coin when told to (hook for TF13), then shops on', () => {
    const sim = quietSim();
    const c = focused(npc.spawn(sim.context(), 'upperLeft'), ['wine']);
    stepUntil(sim, () => c.npc.state === 'wandering', 10 * SIM_HZ);
    chaseCoin(sim.context(), c, { x: 10, y: 17 });
    expect(c.npc.state).toBe('chasingCoin');
    stepUntil(sim, () => c.npc.state !== 'chasingCoin', 20 * SIM_HZ);
    expect(Math.hypot(c.x - 10, c.y - 17)).toBeLessThan(1.3);
    expect(c.npc.state).toBe('wandering');
  });
});

describe('steering and human moments (techniques 2, 3, 5)', () => {
  it('walks curvy, not ruler-straight, and still arrives', () => {
    const sim = quietSim(4);
    const c = focused(npc.spawn(sim.context(), 'lowerLeft'), ['jewelry']);
    stepUntil(sim, () => c.npc.state === 'wandering' && c.npc.nav!.path.length > 0, 10 * SIM_HZ);
    const headings = new Set<number>();
    let arrived = false;
    // 60 s (was 40): TF2-fix-1 shoppers stop, look round and change their minds on the way.
    for (let t = 0; t < 60 * SIM_HZ && !arrived; t++) {
      sim.step();
      if (Math.hypot(c.vx, c.vy) > 0.5)
        headings.add(Math.round((Math.atan2(c.vy, c.vx) * 180) / Math.PI));
      arrived = c.npc.state === 'browsing';
    }
    expect(arrived).toBe(true);
    expect(headings.size).toBeGreaterThan(8);
  });

  it('pauses before choosing a direction after walking in', () => {
    const sim = quietSim();
    const c = npc.spawn(sim.context(), 'upperLeft');
    stepUntil(sim, () => c.npc.state === 'wandering', 10 * SIM_HZ);
    expect(c.npc.nav!.pauseUntil).toBeGreaterThan(sim.world.tick);
    const [lo] = TUNING.npc.pauseMs;
    for (let i = 0; i < sim.context().ticks(lo) - 2; i++) sim.step();
    expect(Math.hypot(c.vx, c.vy)).toBeLessThan(0.3);
  });

  it('distractible NPCs slow, glance, browse on a whim or wander off; focused ones never do', () => {
    let detours = 0;
    let forgets = 0;
    let backs = 0;
    for (let s = 1; s <= 6; s++) {
      const sim = quietSim(s);
      const ctx = sim.context();
      const crowd = Array.from({ length: 10 }, (_, i) => {
        const c = npc.spawn(
          ctx,
          (['upperLeft', 'upperRight', 'lowerLeft', 'lowerRight'] as const)[i % 4],
        );
        c.npc.personality.distractibility = 0.9;
        c.npc.wishList = ['wine', 'smithy', 'jewelry'];
        return c;
      });
      for (let t = 0; t < 60 * SIM_HZ; t++) {
        sim.step();
        for (const c of crowd) {
          const nav = c.npc.nav!;
          if (nav.detour) detours++;
          if (nav.leg === 'roam') forgets++;
          if (nav.leg === 'back') backs++;
        }
      }
    }
    expect(detours).toBeGreaterThan(0);
    expect(forgets).toBeGreaterThan(0);
    expect(backs).toBeGreaterThan(0);

    const sim = quietSim(2);
    const c = focused(npc.spawn(sim.context(), 'upperLeft'), ['wine', 'smithy']);
    for (let t = 0; t < 60 * SIM_HZ; t++) {
      sim.step();
      expect(c.npc.nav!.detour).toBe(false);
      expect(c.npc.nav!.leg).not.toBe('roam');
    }
  });

  it('hurried NPCs walk briskly on some legs; nobody else does', () => {
    const sim = quietSim(3);
    const ctx = sim.context();
    const fast = npc.spawn(ctx, 'upperLeft');
    fast.npc.personality.hurried = true;
    const slow = npc.spawn(ctx, 'lowerLeft');
    slow.npc.personality.hurried = false;
    for (const c of [fast, slow]) c.npc.wishList = ['wine', 'smithy', 'jewelry', 'rugs'];
    const gaits = { fast: new Set<string>(), slow: new Set<string>() };
    for (let t = 0; t < 120 * SIM_HZ; t++) {
      sim.step();
      gaits.fast.add(fast.gait);
      gaits.slow.add(slow.gait);
    }
    expect(gaits.fast.has('brisk')).toBe(true);
    expect(gaits.slow.has('brisk')).toBe(false);
    expect(gaits.slow.has('jog')).toBe(false);
  });
});
