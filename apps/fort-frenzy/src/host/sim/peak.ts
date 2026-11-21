// Peak loads (SPEC §15.2 budget, §15.9; FF15) for the bench (scripts/bench.ts) and the TV's stress
// mode (`?debug=1&stress=1`): 6 knights (every knight, autopilot, invincible), 30 footmen, 150
// enemies, 100 projectiles, 24 builds (6 Rangers × 4 mines with Minefield; placeholder bodies until
// RD3 places real builds), held there by `topUp` before every step. They use the sim's tooling
// helpers (`spawnEnemy`, `addBuild`, `addSoldier`) and edit HP directly, so they are not replayable.
// - `boss`, the real peak: wave 15 in the full sim with the Colossus Mk III held in its final phase
//   (rings, Runner calls), the wave's own groups and Swarm packs through the spawn command.
// - `synthetic`: the whole roster scattered over the field (every AI, hunted fields, Siege shells).
import { rngStream, type Rng } from '@pcg/game-kit';
import { BUILD_IDS, PORTAL_IDS, type ClassId } from '../../shared/ids';
import { createSim, type Sim } from './sim';
import { soakStart } from './soak';
import { AutopilotInputSource } from './sources';
import type { EnemyEnt, ProjectileEnt } from './types';

export const PEAK = { knights: 6, footmen: 30, enemies: 150, projectiles: 100, builds: 24 };
export type PeakKind = 'boss' | 'synthetic';

/** Every class, two Commanders (the footmen need squads). */
const PEAK_CLASSES: ClassId[] = [
  'ranger',
  'warden',
  'artificer',
  'commander',
  'ranger',
  'commander',
];
/** Synthetic crowd mix: mostly walkers, with packs and every special AI (Grunts ×3, mites ×4). */
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
/** The Colossus's HP fraction held in the bench: under content's `finalAt` (0.5). */
const FINAL_HP = 0.45;

export interface PeakLoad {
  readonly sim: Sim;
  /** Call before every step: refills the counts and holds the boss and squads. */
  topUp(): void;
  /** The boss, in the `boss` load. */
  readonly colossus: EnemyEnt | null;
}

function toCombat(sim: Sim, wave: number) {
  while (sim.world.phase !== 'build') sim.step();
  if (wave !== 1) {
    sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave });
    sim.step();
  }
  for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
  while ((sim.world.phase as string) !== 'combat') sim.step();
}

/**
 * Builds on a loose lattice across the field (portals and the base area stay clear) up to
 * `PEAK.builds`, every kind in turn, healed (placeholder bodies until RD3 gives them behaviors).
 */
function lattice(sim: Sim) {
  const w = sim.world;
  for (const b of w.builds) if (b.targetable && b.hp > 0) b.hp = b.maxHp;
  for (let row = 6; row < 22 && w.builds.length < PEAK.builds; row += 4) {
    for (let col = 3; col < 34 && w.builds.length < PEAK.builds; col += 6) {
      const n = w.builds.length;
      sim.addBuild(BUILD_IDS[n % BUILD_IDS.length]!, col + 0.5, row + 0.5, n % PEAK.knights);
    }
  }
}

/** The two Commanders' squads topped up to `PEAK.footmen`, healed (stats reset `maxHp` each step). */
function footmen(sim: Sim, rng: Rng) {
  const w = sim.world;
  const leads = w.players.filter((p) => p.classId === 'commander');
  for (let i = w.soldiers.length; i < PEAK.footmen; i++) {
    const lead = leads[i % leads.length]!;
    sim.addSoldier(lead.slot, lead.x + (rng.next() - 0.5) * 3, lead.y + (rng.next() - 0.5) * 3);
  }
  for (const u of w.soldiers) if (u.hp > 0) u.hp = u.maxHp;
}

function projectiles(sim: Sim, rng: Rng) {
  const w = sim.world;
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
      pierce: 0,
      hit: [],
      expiresAt: w.tick + 15,
      arc: null,
    };
    w.projectiles.push(p);
  }
}

/** Builds a peak load (a few thousand steps to reach it), seeded. */
export function peakLoad(kind: PeakKind, seed: number): PeakLoad {
  const sim = createSim(soakStart(seed, PEAK_CLASSES));
  for (let i = 0; i < PEAK_CLASSES.length; i++)
    sim.setSource(i, new AutopilotInputSource(() => sim.world, i));
  sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  const rng = rngStream(seed, `peak:${kind}`);
  const w = sim.world;
  toCombat(sim, kind === 'boss' ? 15 : 1);
  w.base.hp = w.base.maxHp = 1e12;
  lattice(sim);

  if (kind === 'synthetic') {
    for (const s of w.spawns) s.atTick += 1e9; // the load keeps its own crowd
    return {
      sim,
      colossus: null,
      topUp() {
        lattice(sim);
        footmen(sim, rng);
        while (w.enemies.length < PEAK.enemies) {
          const e = sim.spawnEnemy(
            ROSTER[w.nextId % ROSTER.length]!,
            1 + rng.next() * 34,
            8 + rng.next() * 15,
          );
          e.hp = e.maxHp = 1e9;
        }
        projectiles(sim, rng);
      },
    };
  }

  // The Colossus walks in first on wave 15 (Mk III).
  while (!w.enemies.some((e) => e.boss)) sim.step();
  const colossus = w.enemies.find((e) => e.boss)!;
  let portal = 0;
  return {
    sim,
    colossus,
    topUp() {
      // Swarm packs through the spawn command (the real spawn path) while under the count.
      if (w.enemies.length < PEAK.enemies) {
        const at = PORTAL_IDS[portal++ % PORTAL_IDS.length]!;
        sim.command({ c: 'debug', slot: -1, action: 'spawn', enemy: 'swarm', portal: at });
      }
      if (colossus.hp > 0) colossus.hp = colossus.maxHp * FINAL_HP;
      lattice(sim);
      footmen(sim, rng);
      projectiles(sim, rng);
    },
  };
}
