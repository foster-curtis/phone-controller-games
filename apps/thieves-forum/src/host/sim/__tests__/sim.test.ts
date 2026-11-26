// The sim core and crowd (SPEC §6.2, §6.10, §6.11, §12.3, §12.9): determinism, churn tolerance, entries
// only, separation, the disguise shape of the view.
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../content';
import { bandFor } from '../npc';
import { CHARACTER_VIEW_KEYS } from '../snapshot';
import { SIM_HZ } from '../types';
import { createSim } from '../world';
import { quietSim, roundStart, stickDriver } from './helpers';

const b = CONTENT.balance;
const OPENING = Math.round((b.match.openingMs / 1000) * SIM_HZ);

function run(seed: number, players: number, steps: number) {
  const sim = createSim(roundStart(seed, players));
  const drive = stickDriver(seed, players);
  for (let t = 0; t < steps; t++) sim.step(drive(t));
  return sim;
}

describe('determinism', () => {
  it('same seed + same inputs → identical WorldView and state hash after 3000 steps', () => {
    const a = run(42, 6, 3000);
    const c = run(42, 6, 3000);
    expect(c.view()).toEqual(a.view());
    expect(c.hash()).toBe(a.hash());
    expect(a.view().characters.length).toBeGreaterThan(6);
  });

  it('a different seed gives a different round', () => {
    expect(run(1, 4, 1000).hash()).not.toBe(run(2, 4, 1000).hash());
  });
});

describe('round start (SPEC §6.2)', () => {
  it('shows only the players during the opening, then streams NPCs in', () => {
    const sim = createSim(roundStart(3, 4));
    for (let t = 0; t < OPENING - 1; t++) {
      sim.step();
      expect(sim.world.characters.every((c) => c.control.k === 'player')).toBe(true);
    }
    expect(sim.world.phase).toBe('opening');
    for (let t = 0; t < 10 * SIM_HZ; t++) sim.step();
    expect(sim.world.phase).toBe('play');
    const npcs = sim.world.characters.filter((c) => c.control.k === 'npc').length;
    expect(npcs).toBe(sim.world.plannedNpcs);
  });

  it('players stand still during the opening whatever the stick says', () => {
    const sim = createSim(roundStart(3, 2));
    const before = sim.world.characters.map((c) => [c.x, c.y]);
    const push = new Map([
      ['p1', { move: { x: 1, y: 0 }, hold: false, catch: false }],
      ['p2', { move: { x: 0, y: 1 }, hold: false, catch: false }],
    ]);
    for (let t = 0; t < OPENING - 2; t++) sim.step(push);
    expect(sim.world.characters.map((c) => [c.x, c.y])).toEqual(before);
  });
});

describe('churn (SPEC §6.10)', () => {
  for (const players of [2, 5, 8]) {
    it(`keeps the live count within ±8% every second for ${players} players over 270 s`, () => {
      const sim = createSim(roundStart(players * 7, players));
      const drive = stickDriver(players, players);
      const band = bandFor(b.npcs.base + b.npcs.perPlayer * players, b);
      const settle = OPENING + Math.round((b.npcs.streamInMs / 1000) * SIM_HZ) + SIM_HZ;
      let arrivals = 0;
      let exits = 0;
      for (let t = 0; t < OPENING + 270 * SIM_HZ; t++) {
        sim.step(drive(t));
        for (const e of sim.events()) {
          if (e.ch === 'tv' && e.e === 'enter') arrivals++;
          if (e.ch === 'tv' && e.e === 'exit') exits++;
        }
        if (t >= settle && t % SIM_HZ === 0) {
          const live = sim.debugView().liveNpcs;
          expect(live).toBeGreaterThanOrEqual(band.min);
          expect(live).toBeLessThanOrEqual(band.max);
        }
      }
      // Constant churn: people keep walking on and off all round.
      expect(exits).toBeGreaterThan(players * 2);
      expect(arrivals).toBeGreaterThan(band.planned + players * 2);
    });
  }

  it('arrivals and departures use only the four lane entries, never the gate', () => {
    const sim = createSim(roundStart(11, 8));
    const drive = stickDriver(11, 8);
    const entries = CONTENT.layout.entries;
    const W = CONTENT.layout.size.w;
    const last = new Map<number, { x: number; y: number }>();
    let seen = 0;
    for (let t = 0; t < OPENING + 150 * SIM_HZ; t++) {
      sim.step(drive(t));
      for (const e of sim.events()) {
        if (e.ch !== 'tv' || (e.e !== 'enter' && e.e !== 'exit')) continue;
        const p =
          e.e === 'enter'
            ? sim.world.characters.find((c) => c.id === e.character)!
            : last.get(e.character)!;
        seen++;
        // Off the left or right edge, beside one of the entries; the gate is at the top (y ≈ 0).
        expect(p.x < 0 || p.x > W).toBe(true);
        const near = entries.some(
          (en) =>
            Math.sign(en.spawn.x - W / 2) === Math.sign(p.x - W / 2) &&
            Math.abs(en.spawn.y - p.y) < 2,
        );
        expect(near).toBe(true);
        expect(p.y).toBeGreaterThan(CONTENT.layout.gate.rect.y + CONTENT.layout.gate.rect.h);
      }
      last.clear();
      for (const c of sim.world.characters) last.set(c.id, { x: c.x, y: c.y });
    }
    expect(seen).toBeGreaterThan(40);
  });
});

describe('bodies (SPEC §5)', () => {
  it('separation pushes overlapping bodies apart', () => {
    const sim = quietSim(1, 2);
    const [a, c] = sim.world.characters;
    a!.x = 20;
    a!.y = 15;
    c!.x = 20.05;
    c!.y = 15;
    for (let t = 0; t < 30; t++) sim.step();
    const d = Math.hypot(a!.x - c!.x, a!.y - c!.y);
    expect(d).toBeGreaterThan((a!.r + c!.r) * 0.95);
  });

  it('nobody walks into a stall', () => {
    const sim = quietSim(1, 1);
    const p = sim.world.characters[0]!;
    p.x = 5;
    p.y = 12;
    const up = new Map([['p1', { move: { x: 0, y: -1 }, hold: false, catch: false }]]);
    for (let t = 0; t < 120; t++) sim.step(up);
    expect(p.y).toBeGreaterThanOrEqual(CONTENT.layout.lanes.upper.rect.y + p.r - 1e-9);
  });
});

describe('disguise (SPEC §6.11)', () => {
  it('every character view has exactly the allowlisted keys, players and NPCs alike', () => {
    const sim = run(5, 4, OPENING + 10 * SIM_HZ);
    const view = sim.view();
    expect(view.characters.length).toBeGreaterThan(4);
    for (const c of view.characters)
      expect(Object.keys(c).sort()).toEqual([...CHARACTER_VIEW_KEYS].sort());
  });

  it('player characters are built exactly like NPCs (same keys in the same order)', () => {
    const sim = run(5, 4, OPENING + 10 * SIM_HZ);
    const player = sim.world.characters.find((c) => c.control.k === 'player')!;
    const npc = sim.world.characters.find((c) => c.control.k === 'npc')!;
    expect(Object.keys(player)).toEqual(Object.keys(npc));
    expect(Object.keys(player.npc)).toEqual(Object.keys(npc.npc));
  });
});
