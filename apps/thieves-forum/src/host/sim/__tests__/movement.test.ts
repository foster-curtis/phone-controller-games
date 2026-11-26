// Player movement and shared outfits (SPEC §6.10 gaits and player movement, §6.11, §12.3 disguise
// invariants): jog beats every NPC, the walk band sits inside the NPC speed range, one gait rule, one
// outfit function and pool for everybody.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../content';
import { gaitFor, npcSpeedRange, playerSpeed } from '../movement';
import { npc } from '../npc';
import { TUNING } from '../tuning';
import { SIM_HZ } from '../types';
import { createSim } from '../world';
import { quietSim, roundStart } from './helpers';

const b = CONTENT.balance;

describe('player speed (SPEC §6.10)', () => {
  const range = npcSpeedRange(b);

  it('jog at full tilt is faster than any NPC can walk', () => {
    expect(playerSpeed(1, b)).toBeGreaterThan(range.max);
    expect(playerSpeed(b.movement.jogFrom, b)).toBeGreaterThan(range.max);
  });

  it('the walk band lies inside the NPC speed range', () => {
    for (let m = TUNING.stick.walkFrom; m < b.movement.jogFrom; m += 0.01) {
      const v = playerSpeed(m, b);
      expect(v).toBeGreaterThanOrEqual(range.walkMin - 1e-9);
      expect(v).toBeLessThanOrEqual(range.max);
      expect(gaitFor(v, b)).toBe('walk');
    }
  });

  it('shuffles below the walk band, stands inside the dead zone', () => {
    expect(playerSpeed(0, b)).toBe(0);
    const s = playerSpeed((TUNING.stick.dead + TUNING.stick.walkFrom) / 2, b);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(range.walkMin);
    expect(gaitFor(s, b)).toBe('shuffle');
    expect(gaitFor(playerSpeed(1, b), b)).toBe('jog');
  });

  it('a player at full tilt reaches jog speed in the sim', () => {
    const sim = quietSim(1, 1);
    const p = sim.world.characters[0]!;
    p.x = 5;
    p.y = 31;
    const go = new Map([['p1', { move: { x: 1, y: 0 }, hold: false, catch: false }]]);
    for (let t = 0; t < SIM_HZ; t++) sim.step(go);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(b.movement.jog, 5);
    expect(p.gait).toBe('jog');
  });

  it('no NPC ever walks at jog speed', () => {
    const sim = createSim(roundStart(9, 8));
    let max = 0;
    for (let t = 0; t < 60 * SIM_HZ; t++) {
      sim.step();
      for (const c of sim.world.characters)
        if (c.control.k === 'npc') max = Math.max(max, Math.hypot(c.vx, c.vy));
    }
    expect(max).toBeLessThanOrEqual(range.max + 1e-9);
    expect(max).toBeLessThan(playerSpeed(1, b));
  });
});

describe('outfits (SPEC §6.11)', () => {
  it('players and NPCs draw every piece from the same pool over 1000 draws each', () => {
    const pool = b.outfit;
    const seen = { player: new Set<string>(), npc: new Set<string>() };
    const add = (
      who: 'player' | 'npc',
      o: { tunic: string; mantle: string; hair: number; skin: number },
    ) => {
      seen[who].add(`t:${o.tunic}`);
      seen[who].add(`m:${o.mantle}`);
      seen[who].add(`h:${o.hair}`);
      seen[who].add(`s:${o.skin}`);
    };
    for (let seed = 1; seed <= 125; seed++) {
      const sim = createSim(roundStart(seed, 8));
      for (const c of sim.world.characters) add('player', c.outfit);
      const ctx = sim.context();
      for (let i = 0; i < 8; i++) add('npc', npc.spawn(ctx, 'upperLeft').outfit);
    }
    const all = new Set<string>([
      ...pool.tunics.map((x) => `t:${x}`),
      ...pool.mantles.map((x) => `m:${x}`),
      ...Array.from({ length: pool.hairTones }, (_, i) => `h:${i}`),
      ...Array.from({ length: pool.skinTones }, (_, i) => `s:${i}`),
    ]);
    expect(seen.player).toEqual(all);
    expect(seen.npc).toEqual(all);
  });
});
