// Test helpers for the headless sim (SPEC §12.9): round starts, seeded player sticks, an isolated
// play-phase world for NPC state machine tests.
import { rngStream } from '@pcg/game-kit';
import type { PlayerInput, RoundStart } from '../types';
import { createSim, type Sim } from '../world';

export function roundStart(seed: number, players: number, openStalls?: number[]): RoundStart {
  const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  return {
    seed,
    round: 1,
    players: ids.map((id) => ({ id, side: { kind: 'player', id } })),
    openStalls:
      openStalls ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].slice(0, Math.min(10, Math.max(6, players + 4))),
    guards: 1,
  };
}

/** Seeded wandering sticks for every player, changed every 1–4 s. */
export function stickDriver(
  seed: number,
  players: number,
): (tick: number) => Map<string, PlayerInput> {
  const rng = rngStream(seed, 'test-sticks');
  const sticks = new Map<string, PlayerInput>();
  const next = new Map<string, number>();
  return (tick) => {
    for (let i = 1; i <= players; i++) {
      const id = `p${i}`;
      if ((next.get(id) ?? 0) > tick) continue;
      const a = rng.next() * 2 * Math.PI;
      const m = rng.next() < 0.1 ? 0 : 0.3 + rng.next() * 0.7;
      sticks.set(id, {
        move: { x: Math.cos(a) * m, y: Math.sin(a) * m },
        hold: false,
        catch: false,
      });
      next.set(id, tick + rng.int(60, 240));
    }
    return sticks;
  };
}

/** A sim in `play` with no crowd churn: NPCs appear only when a test spawns them. */
export function quietSim(seed = 1, players = 0): Sim {
  const sim = createSim(roundStart(seed, players, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
  sim.world.phase = 'play';
  sim.world.phaseEndsAt = 1_000_000;
  sim.world.plannedNpcs = 0;
  return sim;
}

export function stepUntil(sim: Sim, done: () => boolean, maxSteps: number): number {
  for (let i = 0; i < maxSteps; i++) {
    if (done()) return i;
    sim.step();
  }
  return done() ? maxSteps : -1;
}
