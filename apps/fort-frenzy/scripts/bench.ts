// Sim benchmark (SPEC §15.2 budget, §15.9): prints per-scenario mean and p99 step time and exits
// non-zero when a peak scenario's p99 (or any scenario's mean) is over the 2 ms step budget. Runs on
// demand, not in the check gate. Each peak line ends with the final state hash, so a perf change
// can show it left the sim's results alone.
//
//   pnpm --filter @pcg/fort-frenzy bench [scenario…]
//
// - `boss`: the real peak (FF15): wave 15 in the full sim, the Colossus Mk III in its final phase,
//   Swarm packs through the spawn command, 60 towers, 6 knights (every class), 30 footmen, 100
//   projectiles (sim/peak.ts).
// - `peak`: the same counts with the whole roster scattered over the field.
// - `run2`, `run6`: whole autopilot runs (waves 1–15, soak class rotations), every step timed.
import { stateHash } from '../src/host/sim/index';
import { peakLoad, type PeakKind } from '../src/host/sim/peak';
import { soakClasses, soakRun } from '../src/host/sim/soak';
import type { World } from '../src/host/sim/types';

const BUDGET_MS = 2;
const WARM = 300;
const TIMED = 3000;

interface Outcome {
  times: number[];
  counts: string;
  /** Held to the p99 budget (the §15.2 peak), not just the mean. */
  peak: boolean;
}

function counts(w: World): string {
  return (
    `${w.players.length} knights, ${w.soldiers.length} footmen, ${w.enemies.length} enemies, ` +
    `${w.projectiles.length} projectiles, ${w.structures.length} structures, ` +
    `state ${stateHash(w).toString(16)}`
  );
}

function peak(kind: PeakKind, seed: number): Outcome {
  const load = peakLoad(kind, seed);
  const { sim } = load;
  const w = sim.world;
  for (let i = 0; i < WARM; i++) {
    load.topUp();
    sim.step();
  }
  if (load.colossus && !load.colossus.boss?.finalPhase)
    throw new Error('bench boss: the Colossus is not in its final phase');
  const times: number[] = [];
  let enemies = 0;
  for (let i = 0; i < TIMED; i++) {
    load.topUp();
    const t0 = process.hrtime.bigint();
    sim.step();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    enemies += w.enemies.length;
  }
  if (load.colossus && load.colossus.hp <= 0) throw new Error('bench boss: the Colossus died');
  const boss = load.colossus ? ', Colossus Mk III final phase' : '';
  return {
    times,
    counts: `${counts(w)}; mean ${Math.round(enemies / TIMED)} enemies${boss}`,
    peak: true,
  };
}

function run(players: number, rotation: number): Outcome {
  const times: number[] = [];
  let t0 = process.hrtime.bigint();
  // Each step is timed from the end of the previous one's bookkeeping (soakRun's loop wraps `step`).
  const r = soakRun({
    seed: 21,
    classes: soakClasses(players, rotation),
    onStep: () => {
      const t1 = process.hrtime.bigint();
      times.push(Number(t1 - t0) / 1e6);
      t0 = process.hrtime.bigint();
    },
  });
  if (r.phase !== 'summary') throw new Error(`bench run${players}: ended in ${r.phase}`);
  return {
    times,
    counts: `${r.classes.join('/')}, waves 1–${r.wave} (${r.result}), peak ${r.maxEnemies} enemies`,
    peak: false,
  };
}

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]!;
  return { mean, p99, max: sorted[sorted.length - 1]! };
}

const scenarios: { name: string; run(): Outcome }[] = [
  { name: 'boss', run: () => peak('boss', 15) },
  { name: 'peak', run: () => peak('synthetic', 7) },
  { name: 'run2', run: () => run(2, 0) },
  { name: 'run6', run: () => run(6, 1) },
];

const only = process.argv.slice(2);
let over = false;
for (const sc of scenarios) {
  if (only.length > 0 && !only.includes(sc.name)) continue;
  const o = sc.run();
  const s = stats(o.times);
  const ok = s.mean <= BUDGET_MS && (!o.peak || s.p99 <= BUDGET_MS);
  if (!ok) over = true;
  console.log(
    `bench ${sc.name.padEnd(5)} mean ${s.mean.toFixed(3)} ms  p99 ${s.p99.toFixed(3)} ms  ` +
      `max ${s.max.toFixed(3)} ms  (${o.times.length} steps; ${o.counts})${ok ? '' : `  OVER ${BUDGET_MS} ms`}`,
  );
}
if (over) process.exit(1);
