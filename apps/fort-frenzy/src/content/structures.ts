// Structures (SPEC §7, §8 build kits). 1×1 tiles; walls and towers share a high path cost (§15.5).
// FF6: the arrow tower (neon knights: pulse turret) only; FF8 adds the bomb tower, walls, snares and
// Fortify.
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

export const structures: StructureDef[] = [arrowTower];
