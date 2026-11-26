// Sim benchmark (SPEC §12.2 performance target, §12.9; BUILD_PLAN TF2): one round with 8 players and
// their full crowd (24 NPCs), players walking on seeded sticks. Prints mean and p99 ms per step over
// the timed steps and exits non-zero if the mean is over the 2 ms step budget. Runs on demand, not in
// the check gate.
//
//   pnpm --filter @pcg/thieves-forum exec tsx scripts/bench.ts [--seed N] [--steps N]
import { performance } from 'node:perf_hooks';
import { rngStream } from '@pcg/game-kit';
import type { PlayerInput } from '../src/host/sim/types';
import { createSim } from '../src/host/sim/world';

const BUDGET_MS = 2;
const PLAYERS = 8;

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

const seed = arg('seed', 1);
const timed = arg('steps', 6000);
const warm = 60 * 12; // opening + stream-in + a few seconds of crowd
const ids = Array.from({ length: PLAYERS }, (_, i) => `p${i + 1}`);
const sim = createSim({
  seed,
  round: 1,
  players: ids.map((id) => ({ id, side: { kind: 'player' as const, id } })),
  openStalls: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  guards: 1,
});
const prng = rngStream(seed, 'bench');
const sticks = new Map<string, PlayerInput>();
const times: number[] = [];
for (let t = 0; t < warm + timed; t++) {
  if (t % 90 === 0)
    for (const id of ids) {
      const a = prng.next() * 2 * Math.PI;
      const m = 0.4 + prng.next() * 0.6;
      sticks.set(id, {
        move: { x: Math.cos(a) * m, y: Math.sin(a) * m },
        hold: false,
        catch: false,
      });
    }
  const t0 = performance.now();
  sim.step(sticks);
  const dt = performance.now() - t0;
  if (t >= warm) times.push(dt);
}
times.sort((a, b) => a - b);
const mean = times.reduce((s, x) => s + x, 0) / times.length;
const p99 = times[Math.floor(times.length * 0.99)]!;
const npcs = sim.world.characters.filter((c) => c.control.k === 'npc').length;
console.log(
  `bench: ${PLAYERS} players + ${npcs} NPCs, ${times.length} steps: ` +
    `mean ${mean.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms, max ${times[times.length - 1]!.toFixed(3)} ms ` +
    `(budget ${BUDGET_MS} ms mean), state ${sim.hash().toString(16)}`,
);
process.exit(mean <= BUDGET_MS ? 0 : 1);
