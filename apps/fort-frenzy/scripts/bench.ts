// Sim benchmark (SPEC §15.2 budget, §15.9): prints per-scenario mean and p99 step time and exits
// non-zero when a mean is over the 2 ms step budget. Runs on demand, not in the check gate.
//
//   pnpm --filter @pcg/fort-frenzy bench
//
// `peak` holds §15.2's peak counts with synthetic entities: 6 knights (autopilot, invincible),
// 30 footmen, 150 enemies, 100 projectiles, 60 structures. `slice` is a real 2-player autopilot run
// of the content's waves.
import { rngStream } from '@pcg/game-kit';
import { AutopilotInputSource, createSim, type Sim } from '../src/host/sim/index';
import type { RunStart } from '../src/host/sim/types';
import { PLAYER_COLOR_IDS } from '../src/shared/ids';

const BUDGET_MS = 2;
const PEAK = { knights: 6, footmen: 30, enemies: 150, projectiles: 100, structures: 60 };
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

function startOf(players: number, seed: number): RunStart {
  return {
    seed,
    settings: { theme: 'neon-knights', difficulty: 'normal' },
    slots: Array.from({ length: players }, (_, i) => ({
      slot: i,
      name: `Bot${i + 1}`,
      color: PLAYER_COLOR_IDS[i % PLAYER_COLOR_IDS.length]!,
      classId: 'engineer' as const,
      connected: true,
    })),
  };
}

function autopilotSim(players: number, seed: number): Sim {
  const sim = createSim(startOf(players, seed));
  for (let i = 0; i < players; i++) sim.setSource(i, new AutopilotInputSource(() => sim.world, i));
  sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  return sim;
}

function toCombat(sim: Sim) {
  while (sim.world.phase !== 'build') sim.step();
  for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
  while ((sim.world.phase as string) !== 'combat') sim.step();
}

function time(sim: Sim): number {
  const t0 = process.hrtime.bigint();
  sim.step();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

function peak(): { times: number[]; counts: string } {
  const sim = autopilotSim(PEAK.knights, 7);
  const rng = rngStream(7, 'bench');
  toCombat(sim);
  const w = sim.world;
  for (const s of w.spawns) s.atTick += 1e9; // the bench keeps its own crowd
  w.base.hp = w.base.maxHp = 1e12;

  // 60 turrets on a loose lattice across the field (lanes and the base area stay clear).
  let placed = 0;
  for (let row = 6; row < 22 && placed < PEAK.structures; row += 3) {
    for (let col = 2; col < 34 && placed < PEAK.structures; col += 3) {
      if (w.grid.kinds[row * w.grid.cols + col] !== 'open') continue;
      // Unbreakable, so the counts hold at peak while the crowd attacks and shells them.
      const st = sim.place('arrow_tower', col, row, placed % PEAK.knights);
      st.hp = st.maxHp = 1e12;
      placed++;
    }
  }
  for (let i = 0; i < PEAK.footmen; i++) {
    const u = sim.addSoldier(0, 4 + rng.next() * 28, 5 + rng.next() * 16);
    u.hp = u.maxHp = 1e12;
  }

  const topUp = () => {
    while (w.enemies.length < PEAK.enemies) {
      // The whole roster (FF10): every AI kind, hunted fields, Siege shells and mite packs.
      const kind = ROSTER[w.nextId % ROSTER.length]!;
      const e = sim.spawnEnemy(kind, 1 + rng.next() * 34, 8 + rng.next() * 15);
      e.hp = e.maxHp = 1e9;
    }
    while (w.projectiles.length < PEAK.projectiles) {
      const a = rng.next() * Math.PI * 2;
      w.projectiles.push({
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
      });
    }
  };

  for (let i = 0; i < 300; i++) {
    topUp();
    sim.step();
  }
  const times: number[] = [];
  for (let i = 0; i < 3000; i++) {
    topUp();
    times.push(time(sim));
  }
  const counts =
    `${w.players.length} knights, ${w.soldiers.length} footmen, ${w.enemies.length} enemies, ` +
    `${w.projectiles.length} projectiles, ${w.structures.length} structures`;
  return { times, counts };
}

function slice(): { times: number[]; counts: string } {
  const sim = autopilotSim(2, 21);
  const times: number[] = [];
  let buildStart = -1;
  let maxEnemies = 0;
  while (sim.world.phase !== 'summary' && sim.world.tick < 60 * 60 * 10) {
    const w = sim.world;
    if (w.phase === 'build') {
      if (buildStart < 0) buildStart = w.tick;
      if (w.tick - buildStart > 300) {
        for (const p of w.players)
          if (!p.ready) sim.command({ c: 'ready', slot: p.slot, ready: true });
      }
    } else buildStart = -1;
    times.push(time(sim));
    maxEnemies = Math.max(maxEnemies, w.enemies.length);
  }
  return { times, counts: `2 knights, waves 1–${sim.world.wave}, peak ${maxEnemies} enemies` };
}

function stats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))]!;
  return { mean, p99, max: sorted[sorted.length - 1]! };
}

const scenarios: { name: string; run(): { times: number[]; counts: string } }[] = [
  { name: 'peak', run: peak },
  { name: 'slice', run: slice },
];

let over = false;
for (const sc of scenarios) {
  const { times, counts } = sc.run();
  const s = stats(times);
  const ok = s.mean <= BUDGET_MS;
  if (!ok) over = true;
  console.log(
    `bench ${sc.name.padEnd(6)} mean ${s.mean.toFixed(3)} ms  p99 ${s.p99.toFixed(3)} ms  ` +
      `max ${s.max.toFixed(3)} ms  (${times.length} steps; ${counts})${ok ? '' : `  OVER ${BUDGET_MS} ms`}`,
  );
}
if (over) process.exit(1);
