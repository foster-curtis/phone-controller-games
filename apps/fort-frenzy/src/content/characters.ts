// Characters (SPEC §8, §10.1 input table, §6 carry). Starting values for playtesting (§14).
// FF6: the Engineer only; the Warden, Quartermaster and Commander arrive in FF8/FF9.
import type { CharacterDef } from './types';

export const engineer = {
  id: 'engineer',
  hp: 100,
  moveSpeed: 4.5,
  radius: 0.32,
  // Longbow: the longest range in the game (§8). Bolts fly at render PROJECTILE_SPEEDS.bolt (26 t/s,
  // FF3-fix-1; BUILD_PLAN §8 FF7).
  main: {
    shape: 'projectile',
    damage: 34,
    range: 9,
    cooldownMs: 600,
    speed: 26,
    hitsFlyers: true,
  },
  // A wide circle around the Engineer: light area damage and knockback (§8).
  super: {
    shape: 'circle',
    damage: 25,
    range: 0,
    radius: 3,
    cooldownMs: 500,
    knockback: 2.5,
    hitsFlyers: true,
  },
  input: { main: 'aimed', super: 'tap' },
  /** Super charge per point of damage dealt (200 damage fills it). */
  superChargeRate: 0.005,
  passive: { module: 'steady_aim', params: { stillMs: 600, damagePct: 0.25, rangePct: 0.2 } },
  // Arc order left, up, right. The bomb tower joins with FF8's structures.
  build: ['arrow_tower'],
  carryCap: 4,
  // Faster than linear (§6): one crate is barely noticeable, a full load is a real slowdown.
  carrySlowdown: [0, 0.04, 0.1, 0.2, 0.32],
} satisfies CharacterDef;

export const characters: CharacterDef[] = [engineer];
