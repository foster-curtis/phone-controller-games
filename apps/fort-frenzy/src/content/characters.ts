// Characters (SPEC §8, §10.1 input table, §6 carry). Starting values for playtesting (§14).
// FF6: the Engineer; FF9: the Quartermaster and Commander; FF8: the Warden.
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
  // A wide circle around the Engineer: light area damage and knockback (§8). Radius 3 → 3.5 (C3).
  super: {
    shape: 'circle',
    damage: 25,
    range: 0,
    radius: 3.5,
    cooldownMs: 500,
    knockback: 2.5,
    hitsFlyers: true,
  },
  input: { main: 'aimed', super: 'tap' },
  /** Super charge per point of damage dealt (200 damage fills it). */
  superChargeRate: 0.005,
  passive: { module: 'steady_aim', params: { stillMs: 600, damagePct: 0.25, rangePct: 0.2 } },
  // Arc order left, up, right.
  build: ['arrow_tower', 'bomb_tower'],
  carryCap: 4,
  // Faster than linear (§6): one crate is barely noticeable, a full load is a real slowdown.
  carrySlowdown: [0, 0.04, 0.1, 0.2, 0.32],
} satisfies CharacterDef;

// Quartermaster (support, §6, §8): neon knights' Artificer.
export const quartermaster = {
  id: 'quartermaster',
  hp: 90,
  moveSpeed: 4.6,
  radius: 0.32,
  // 3–4 nanite bolts in a narrow cone, medium-long range; walls and towers block them (§8). Bolts fly
  // at render PROJECTILE_SPEEDS['nanite-bolt'] (20 t/s, FF3-fix-1).
  main: {
    shape: 'projectile',
    damage: 9,
    range: 6.5,
    cooldownMs: 700,
    count: 4,
    spreadDeg: 16,
    speed: 20,
    hitsFlyers: true,
    blockedBy: ['wall', 'tower'],
  },
  // A very wide, long cone through walls and towers: heals the players it hits and gives the towers
  // it hits a temporary defense bonus (`effects`: damage reduction); it hurts no one (§8).
  super: {
    shape: 'cone',
    damage: 0,
    range: 8,
    arcDeg: 110,
    cooldownMs: 500,
    hitsFlyers: true,
    heal: 40,
    effects: [{ effect: 'tower_defense', strength: 0.3, durationMs: 6000 }],
  },
  input: { main: 'aimed', super: 'aimed' },
  superChargeRate: 0.006,
  // Field Medic heals nearby players every second in combat; its healing charges the super at
  // `chargeRate` per HP healed, slower than damage does (§8).
  passive: {
    module: 'field_medic',
    params: { radius: 2.5, heal: 3, everyMs: 1000, chargeRate: 0.002 },
  },
  build: [],
  // Carries 8 with no slowdown (§6).
  carryCap: 8,
  carrySlowdown: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  supply: { crateDiscount: 0.5, throwRange: 8, throwSpeed: 12, kitRepair: 250 },
} satisfies CharacterDef;

// Commander (squad leader, §8).
export const commander = {
  id: 'commander',
  hp: 130,
  moveSpeed: 4.3,
  radius: 0.34,
  // Sword slash in a short arc in front of him.
  main: {
    shape: 'arc',
    damage: 28,
    range: 1.4,
    arcDeg: 110,
    cooldownMs: 550,
    hitsFlyers: false,
  },
  // Morale: his squad and he get attack speed and damage (`effects`); he also moves faster
  // (`selfEffects`). The aura fades as it runs out (§2.4).
  super: {
    shape: 'buff',
    damage: 0,
    range: 0,
    cooldownMs: 500,
    hitsFlyers: false,
    effects: [{ effect: 'morale', strength: 0.35, durationMs: 6000 }],
    selfEffects: [{ effect: 'haste', strength: 0.25, durationMs: 6000 }],
  },
  input: { main: 'tap', super: 'tap' },
  superChargeRate: 0.008,
  // Lead from the Front: his soldiers within `radius` deal +`damagePct` (a refreshed aura).
  passive: {
    module: 'lead_from_the_front',
    params: { radius: 3, damagePct: 0.25, auraMs: 200 },
  },
  // The rally flag is free and isn't a structure (§6, action button row 7).
  build: [],
  carryCap: 4,
  carrySlowdown: [0, 0.04, 0.1, 0.2, 0.32],
  // 3 soldiers, 4 after the wave 5 boss, 5 after the wave 10 boss (boss waves come from wave data).
  squad: {
    size: [3, 4, 5],
    soldier: {
      hp: 60,
      moveSpeed: 4.4,
      radius: 0.24,
      attack: { shape: 'arc', damage: 8, range: 0.5, cooldownMs: 900, hitsFlyers: false },
    },
    followRadius: 1.3,
  },
} satisfies CharacterDef;

/**
 * Warden (tank, §8): a ground slam in a short arc in front (tap: auto-aims), a longer aimed stomp
 * whose arc stuns, and Mason (walls near him repair, combat only). Both attacks wind up, so the
 * hammer and the foot land on the TV when the damage does (`windupMs` = the clips' impact times,
 * render/clips/warden.ts; src/host/__tests__/speeds.test.ts keeps them equal).
 */
export const warden = {
  id: 'warden',
  hp: 170,
  moveSpeed: 3.8,
  radius: 0.36,
  // C3: both arcs ~15% narrower and ~15% longer (slam 1.5 → 1.75 tiles, 120° → 102°; stomp 3.2 → 3.7,
  // 100° → 85°).
  main: {
    shape: 'arc',
    damage: 30,
    range: 1.75,
    arcDeg: 102,
    cooldownMs: 800,
    windupMs: 200,
    knockback: 0.5,
    hitsFlyers: false,
  },
  super: {
    shape: 'arc',
    damage: 45,
    range: 3.7,
    arcDeg: 85,
    cooldownMs: 600,
    windupMs: 320,
    hitsFlyers: false,
    effects: [{ effect: 'stun', strength: 1, durationMs: 1400 }],
  },
  input: { main: 'tap', super: 'aimed' },
  /** 160 damage fills it: the slam hits groups, so the stomp comes round often. */
  superChargeRate: 0.00625,
  passive: { module: 'mason', params: { radius: 2.5, hpPerSec: 10 } },
  // Arc order left, up, right.
  build: ['wall', 'snare', 'fortify'],
  carryCap: 4,
  carrySlowdown: [0, 0.03, 0.08, 0.16, 0.26],
} satisfies CharacterDef;

export const characters: CharacterDef[] = [engineer, quartermaster, commander, warden];
