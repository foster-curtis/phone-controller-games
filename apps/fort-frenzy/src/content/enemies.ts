// Enemies (SPEC §9, §9.1 starting stats). Speeds in tiles/s: the Grunt's 1.0 is 1.3 tiles/s and the
// others scale from it. FF6: the Grunt only; the rest of the roster arrives in FF10.
import type { EnemyDef } from './types';

export const grunt = {
  id: 'grunt',
  hp: 100,
  speed: 1.3,
  radius: 0.32,
  flying: false,
  budget: 1,
  ai: 'path',
  field: 'ground',
  attack: {
    shape: 'arc',
    damage: 10,
    range: 0.45,
    cooldownMs: 1000,
    windupMs: 250,
    arcDeg: 90,
    hitsFlyers: false,
  },
  aggro: { radius: 2.5, leash: 5 },
} satisfies EnemyDef;

export const enemies: EnemyDef[] = [grunt];
