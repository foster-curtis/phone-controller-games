// Peak loads (SPEC §15.2 budget, §15.9; FF15) for the bench (scripts/bench.ts) and the TV's stress
// mode (`?debug=1&stress=1`): 6 knights (every knight, autopilot, invincible), 30 footmen, 150
// enemies, 100 projectiles, 24 real builds (each knight's own, 4 apiece, with their behaviors; RD14),
// held there by `topUp` before every step. They use the sim's tooling helpers (`spawnEnemy`,
// `addBuild`, `addSoldier`) and edit HP directly, so they are not replayable.
// - `boss`, the real peak: wave 15 in the full sim with the Colossus Mk III held in its final phase
//   (rings, Runner calls), the wave's own groups and Swarm packs through the spawn command.
// - `synthetic`: the whole roster scattered over the field (every AI, hunted fields, Siege shells).
import { rngStream, type Rng } from '@pcg/game-kit';
import { PORTAL_IDS, type BuildId, type ClassId } from '../../shared/ids';
import { createSim, type Sim } from './sim';
import { soakStart } from './soak';
import { AutopilotInputSource } from './sources';
import type { BuildEnt, EnemyEnt, ProjectileEnt } from './types';

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

/** A lattice spot: where a build goes, whose it is, and the build standing there now. */
interface Spot {
  x: number;
  y: number;
  owner: number;
  kind: BuildId;
  build: BuildEnt | null;
}

/**
 * `PEAK.builds` spots on a loose lattice across the field (portals and the base area stay clear),
 * owners in slot turns, each spot the owner's own build: 4 per knight (the §15.2 count is 6 Rangers ×
 * 4 mines; here every kit's behavior runs: mines, shield generators, beacons, rally flags).
 */
function lattice(sim: Sim): Spot[] {
  const spots: Spot[] = [];
  for (let row = 6; row < 22; row += 4) {
    for (let col = 3; col < 34 && spots.length < PEAK.builds; col += 6) {
      const owner = spots.length % PEAK.knights;
      const p = sim.world.players.find((q) => q.slot === owner)!;
      const kind = sim.content.knights.find((k) => k.id === p.classId)!.build;
      spots.push({ x: col + 0.5, y: row + 0.5, owner, kind, build: null });
    }
  }
  return spots;
}

/**
 * Real builds (RD14): every spot whose build is gone (a mine burst, a generator destroyed, the
 * owner's newer build replaced it) gets a new one while the map holds under `PEAK.builds` (the
 * autopilot's own builds count too); HP builds are healed.
 */
function builds(sim: Sim, spots: Spot[]) {
  const w = sim.world;
  for (const b of w.builds) if (b.targetable && b.hp > 0) b.hp = b.maxHp;
  for (const spot of spots) {
    if (spot.build && w.builds.includes(spot.build)) continue;
    spot.build = null;
    if (w.builds.length >= PEAK.builds) continue;
    spot.build = sim.addBuild(spot.kind, spot.x, spot.y, spot.owner);
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
  const spots = lattice(sim);
  builds(sim, spots);

  if (kind === 'synthetic') {
    for (const s of w.spawns) s.atTick += 1e9; // the load keeps its own crowd
    return {
      sim,
      colossus: null,
      topUp() {
        builds(sim, spots);
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
      builds(sim, spots);
      footmen(sim, rng);
      projectiles(sim, rng);
    },
  };
}
