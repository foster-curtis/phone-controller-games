// Peak loads (SPEC §15.2 budget, §15.9; FF15) for the bench (scripts/bench.ts) and the TV's stress
// mode (`?debug=1&stress=1`): 6 knights (every class, autopilot, invincible), 30 footmen, 150 enemies,
// 100 projectiles, 60 structures, held there by `topUp` before every step. They use the sim's tooling
// helpers (`spawnEnemy`, `place`, `addSoldier`) and edit HP directly, so they are not replayable.
// - `boss`, the real peak: wave 15 in the full sim with the Colossus Mk III held in its final phase
//   (rings, Runner calls), the wave's own groups and Swarm packs through the spawn command.
// - `synthetic`: the whole roster scattered over the field (every AI, hunted fields, Siege shells).
import { rngStream, type Rng } from '@pcg/game-kit';
import { LANE_IDS, type ClassId, type StructureId } from '../../shared/ids';
import { createSim, type Sim } from './sim';
import { soakStart } from './soak';
import { AutopilotInputSource } from './sources';
import type { EnemyEnt, ProjectileEnt } from './types';

export const PEAK = { knights: 6, footmen: 30, enemies: 150, projectiles: 100, structures: 60 };
export type PeakKind = 'boss' | 'synthetic';

/** Every class, two Commanders (the footmen need squads). */
const PEAK_CLASSES: ClassId[] = [
  'engineer',
  'warden',
  'quartermaster',
  'commander',
  'engineer',
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
/** Towers on the lattice: mostly pulse turrets, every third a mortar. */
const TOWERS: StructureId[] = ['arrow_tower', 'arrow_tower', 'bomb_tower'];
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
 * Towers on a loose lattice across the field (lanes and the base area stay clear) up to
 * `PEAK.structures`, healed: stats reset `maxHp` when effects land, so they can't just be unbreakable.
 */
function lattice(sim: Sim) {
  const w = sim.world;
  const { cols, kinds, occupant } = w.grid;
  for (const st of w.structures) if (st.damageable && st.hp > 0) st.hp = st.maxHp;
  for (let off = 0; off < 3 && w.structures.length < PEAK.structures; off++) {
    for (let row = 6 + off; row < 22 && w.structures.length < PEAK.structures; row += 3) {
      for (let col = 2 + off; col < 34 && w.structures.length < PEAK.structures; col += 3) {
        if (kinds[row * cols + col] !== 'open' || occupant[row * cols + col] !== 0) continue;
        const n = w.structures.length;
        sim.place(TOWERS[n % TOWERS.length]!, col, row, n % PEAK.knights);
      }
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
      blockedBy: [],
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
  let lane = 0;
  return {
    sim,
    colossus,
    topUp() {
      // Swarm packs through the spawn command (the real spawn path) while under the count.
      if (w.enemies.length < PEAK.enemies) {
        const at = LANE_IDS[lane++ % LANE_IDS.length]!;
        sim.command({ c: 'debug', slot: -1, action: 'spawn', enemy: 'swarm', lane: at });
      }
      if (colossus.hp > 0) colossus.hp = colossus.maxHp * FINAL_HP;
      lattice(sim);
      footmen(sim, rng);
      projectiles(sim, rng);
    },
  };
}
