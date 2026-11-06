// Sim benchmark (SPEC §15.2 budget, §15.9): prints per-scenario mean and p99 step time and exits
// non-zero when a peak scenario's p99 (or any scenario's mean) is over the 2 ms step budget. Runs on
// demand, not in the check gate.
//
//   pnpm --filter @pcg/fort-frenzy bench [scenario…]
//
// - `peak`: §15.2's peak counts with synthetic entities: 6 knights (every class, autopilot,
//   invincible), 30 footmen, 150 enemies (the whole roster), 100 projectiles, 60 structures.
// - `boss`: the real peak (FF15): wave 15 in the full sim, the Colossus Mk III in its final phase
//   (rings, Runner calls), its escorts and Swarm packs topped up through the spawn command, 60 built
//   towers, 6 knights and two Commanders' squads to 30 footmen, 100 projectiles.
// - `run2`, `run6`: whole autopilot runs (waves 1–15, soak class rotations), every step timed.
import { rngStream } from '@pcg/game-kit';
import { AutopilotInputSource, createSim, stateHash, type Sim } from '../src/host/sim/index';
import { soakClasses, soakRun, soakStart } from '../src/host/sim/soak';
import type { ProjectileEnt, World } from '../src/host/sim/types';
import { LANE_IDS, type ClassId, type StructureId } from '../src/shared/ids';

const BUDGET_MS = 2;
const PEAK = { knights: 6, footmen: 30, enemies: 150, projectiles: 100, structures: 60 };
/** Every class, two Commanders (the footmen need squads). */
const PEAK_CLASSES: ClassId[] = [
  'engineer',
  'warden',
  'quartermaster',
  'commander',
  'engineer',
  'commander',
];
/** Peak crowd mix: mostly walkers, with packs and every special AI (Grunts weighted ×3, mites ×4). */
const ROSTER = [
  'grunt',
  'grunt',
  'grunt',
  'swarm',
  'swarm',
  'swarm',
  'swarm',
  'runner',
  'brute',
  'flyer',
  'siege',
  'hunter',
] as const;
/** Towers on the lattice: mostly pulse turrets, every third a mortar. */
const TOWERS: StructureId[] = ['arrow_tower', 'arrow_tower', 'bomb_tower'];
const WARM = 300;
const TIMED = 3000;

function autopilotSim(classes: ClassId[], seed: number): Sim {
  const sim = createSim(soakStart(seed, classes));
  for (let i = 0; i < classes.length; i++)
    sim.setSource(i, new AutopilotInputSource(() => sim.world, i));
  sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  return sim;
}

function toCombat(sim: Sim, wave = 1) {
  while (sim.world.phase !== 'build') sim.step();
  if (wave !== 1) {
    sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave });
    sim.step();
  }
  for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
  while ((sim.world.phase as string) !== 'combat') sim.step();
}

function time(sim: Sim): number {
  const t0 = process.hrtime.bigint();
  sim.step();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

/** 60 unbreakable towers on a loose lattice across the field (lanes and the base area stay clear). */
function lattice(sim: Sim) {
  const w = sim.world;
  let placed = 0;
  for (let row = 6; row < 22 && placed < PEAK.structures; row += 3) {
    for (let col = 2; col < 34 && placed < PEAK.structures; col += 3) {
      if (
        w.grid.kinds[row * w.grid.cols + col] !== 'open' ||
        w.grid.occupant[row * w.grid.cols + col]
      )
        continue;
      // Unbreakable, so the counts hold at peak while the crowd attacks and shells them.
      const st = sim.place(TOWERS[placed % TOWERS.length]!, col, row, placed % PEAK.knights);
      st.hp = st.maxHp = 1e12;
      placed++;
    }
  }
}

/**
 * Tops the two Commanders' squads up to `PEAK.footmen` between them, at full HP (stats refresh
 * `maxHp` every step, so they are healed rather than made unbreakable).
 */
function footmen(sim: Sim, rng: ReturnType<typeof rngStream>) {
  const w = sim.world;
  const leads = w.players.filter((p) => p.classId === 'commander');
  for (let i = w.soldiers.length; i < PEAK.footmen; i++) {
    const lead = leads[i % leads.length]!;
    sim.addSoldier(lead.slot, lead.x + (rng.next() - 0.5) * 3, lead.y + (rng.next() - 0.5) * 3);
  }
  for (const u of w.soldiers) if (u.hp > 0) u.hp = u.maxHp;
}

function topUpProjectiles(w: World, rng: ReturnType<typeof rngStream>) {
  while (w.projectiles.length < PEAK.projectiles) {
    const a = rng.next() * Math.PI * 2;
    const p: ProjectileEnt = {
      id: w.nextId++,
      x: 2 + rng.next() * 32,
      y: 4 + rng.next() * 18,
      vx: Math.cos(a) * 24,
      vy: Math.sin(a) * 24,
      r: 0.12,
      side: 'ours',
      source: w.base.id,
      from: 'archer',
      slot: 'attack',
      damage: 1,
      kind: 'ranged',
      tags: [],
      effects: [],
      hitsFlyers: true,
      blockedBy: [],
      pierce: 0,
      hit: [],
      expiresAt: w.tick + 15,
      arc: null,
    };
    w.projectiles.push(p);
  }
}

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

function peak(): Outcome {
  const sim = autopilotSim(PEAK_CLASSES, 7);
  const rng = rngStream(7, 'bench');
  toCombat(sim);
  const w = sim.world;
  for (const s of w.spawns) s.atTick += 1e9; // the bench keeps its own crowd
  w.base.hp = w.base.maxHp = 1e12;
  lattice(sim);

  const topUp = () => {
    footmen(sim, rng);
    while (w.enemies.length < PEAK.enemies) {
      // The whole roster (FF10): every AI kind, hunted fields, Siege shells and mite packs.
      const kind = ROSTER[w.nextId % ROSTER.length]!;
      const e = sim.spawnEnemy(kind, 1 + rng.next() * 34, 8 + rng.next() * 15);
      e.hp = e.maxHp = 1e9;
    }
    topUpProjectiles(w, rng);
  };

  for (let i = 0; i < WARM; i++) {
    topUp();
    sim.step();
  }
  const times: number[] = [];
  for (let i = 0; i < TIMED; i++) {
    topUp();
    times.push(time(sim));
  }
  return { times, counts: counts(w), peak: true };
}

function boss(): Outcome {
  const sim = autopilotSim(PEAK_CLASSES, 15);
  const rng = rngStream(15, 'bench-boss');
  toCombat(sim, 15);
  const w = sim.world;
  w.base.hp = w.base.maxHp = 1e12;
  lattice(sim);
  // The Colossus walks in first (wave 15: Mk III); hold it in its final phase, alive.
  while (!w.enemies.some((e) => e.boss)) sim.step();
  const colossus = w.enemies.find((e) => e.boss)!;
  let lane = 0;
  // Packs arrive through the spawn command (the real spawn path); the wave's own groups keep coming.
  const topUp = () => {
    if (w.enemies.length < PEAK.enemies) {
      sim.command({
        c: 'debug',
        slot: -1,
        action: 'spawn',
        enemy: 'swarm',
        lane: LANE_IDS[lane++ % LANE_IDS.length]!,
      });
    }
    // Below `finalAt` (half) of its HP and never killed, so the final phase holds.
    if (colossus.hp > 0) colossus.hp = colossus.maxHp * 0.45;
    footmen(sim, rng);
    topUpProjectiles(w, rng);
  };
  for (let i = 0; i < WARM; i++) {
    topUp();
    sim.step();
  }
  if (!colossus.boss?.finalPhase)
    throw new Error('bench boss: the Colossus is not in its final phase');
  const times: number[] = [];
  let enemies = 0;
  for (let i = 0; i < TIMED; i++) {
    topUp();
    times.push(time(sim));
    enemies += w.enemies.length;
  }
  if (colossus.hp <= 0) throw new Error('bench boss: the Colossus died');
  return {
    times,
    counts: `${counts(w)}; mean ${Math.round(enemies / TIMED)} enemies, Colossus Mk III final phase`,
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
  { name: 'peak', run: peak },
  { name: 'boss', run: boss },
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
