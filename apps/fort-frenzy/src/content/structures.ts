// Structures (SPEC §7, §8 build kits). 1×1 tiles; walls and towers share a high path cost (§15.5).
// FF6: the arrow tower (neon knights: pulse turret); FF8: the bomb tower (mortar), walls, snares
// (shock nets) and Fortify.
import type { StructureDef } from './types';

export const arrowTower = {
  id: 'arrow_tower',
  cost: 2,
  hp: 250,
  pathCost: 30,
  blocksProjectiles: true,
  // Long range, single target, hits Flyers (§8).
  attack: {
    shape: 'projectile',
    damage: 14,
    range: 6,
    cooldownMs: 700,
    speed: 26,
    hitsFlyers: true,
  },
} satisfies StructureDef;

/**
 * Bomb tower (neon knights: mortar tower, §8): short range, area damage. Lobs an arcing shell at the
 * nearest ground enemy's position; it bursts on landing and damages everything in `radius`. `speed`
 * is the shell's ground speed (tiles/s); a short lob still takes the minimum flight time
 * (sim/structures/mortar.ts).
 */
export const bombTower = {
  id: 'bomb_tower',
  cost: 3,
  hp: 220,
  pathCost: 30,
  blocksProjectiles: true,
  attack: {
    shape: 'projectile',
    damage: 32,
    range: 4.5,
    cooldownMs: 2000,
    speed: 6,
    radius: 1.3,
    hitsFlyers: false,
  },
} satisfies StructureDef;

/** Wall (§7): reroutes enemies (high path cost); Brutes and the Colossus smash through (§15.5). */
export const wall = {
  id: 'wall',
  cost: 1,
  hp: 300,
  pathCost: 30,
  blocksProjectiles: true,
} satisfies StructureDef;

/**
 * Snare (neon knights: shock net, §7.1): no HP, costs the same as an open tile to path through, 5
 * discharges that each slow every ground enemy on the tile by 40% for 2 s, rearming after 0.5 s.
 */
export const snare = {
  id: 'snare',
  cost: 1,
  hp: null,
  pathCost: 1,
  blocksProjectiles: false,
  discharges: 5,
  rearmMs: 500,
  slow: { effect: 'slow', strength: 0.4, durationMs: 2000 },
} satisfies StructureDef;

/** Fortify (§8): attaches to a tower (a flag on it, not a tile of its own) for a defense bonus. */
export const fortify = {
  id: 'fortify',
  cost: 2,
  hp: null,
  pathCost: 1,
  blocksProjectiles: false,
  attachesTo: ['arrow_tower', 'bomb_tower'],
  defense: 0.35,
} satisfies StructureDef;

export const structures: StructureDef[] = [arrowTower, bombTower, wall, snare, fortify];
