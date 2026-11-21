// Display text and icon ids for the TV overlay (SPEC §2.1, §2.6, §6.2). Presentation (src/presentation/) will
// own these maps for the whole game; until then the overlay carries them.
import type { RunStats } from '../../shared/messages';
import type { ClassId, DifficultyId, EnemyId, PlayerColorId, ShopItemId } from '../../shared/ids';

export const CLASS_NAME: Record<ClassId, string> = {
  ranger: 'Ranger',
  warden: 'Warden',
  artificer: 'Artificer',
  commander: 'Commander',
};

/** Rig id for a class: the portrait files are named after it. */
export const CLASS_RIG: Record<ClassId, string> = {
  ranger: 'ranger',
  warden: 'warden',
  artificer: 'artificer',
  commander: 'commander',
};

export const CLASS_ICON: Record<ClassId, string> = {
  ranger: 'class-ranger',
  warden: 'class-warden',
  artificer: 'class-artificer',
  commander: 'class-commander',
};

export const ENEMY_NAME: Record<EnemyId, string> = {
  grunt: 'Drone',
  runner: 'Skitter',
  swarm: 'Scrap mites',
  brute: 'Brute',
  flyer: 'Wasp drone',
  siege: 'Bombard',
  hunter: 'Stalker',
  colossus: 'Colossus',
};

export const ENEMY_RIG: Record<EnemyId, string> = {
  grunt: 'drone',
  runner: 'skitter',
  swarm: 'mite',
  brute: 'brute',
  flyer: 'wasp',
  siege: 'bombard',
  hunter: 'stalker',
  colossus: 'colossus',
};

export const SHOP_NAME: Record<ShopItemId, string> = {
  crate: 'Power cell',
  repair: 'Base repair',
  archer_damage: 'Sentry damage',
  archer_range: 'Sentry range',
  archer_third: 'Third sentry',
  squad_stats: 'Squad stats',
  arrow_rate: 'Pulse turret fire rate',
  bomb_radius: 'Mortar blast radius',
  tower_hp: 'Tower HP',
  wall_hp: 'Wall HP',
  snare_charges: 'Shock net charges',
  spiked_walls: 'Charged walls',
  base_armor: 'Base armor',
  emergency_kit: 'Emergency kit',
};

export const SHOP_ICON: Record<ShopItemId, string> = {
  crate: 'cell',
  repair: 'repair',
  archer_damage: 'sentry-damage',
  archer_range: 'sentry-range',
  archer_third: 'sentry-third',
  squad_stats: 'squad',
  arrow_rate: 'turret-rate',
  bomb_radius: 'mortar-radius',
  tower_hp: 'tower-hp',
  wall_hp: 'wall-hp',
  snare_charges: 'net-charges',
  spiked_walls: 'charged-walls',
  base_armor: 'base-armor',
  emergency_kit: 'emergency-kit',
};

export const DIFFICULTY_NAME: Record<DifficultyId, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

/** Summary award cards: the stat's label and how its value reads (SPEC §4). */
export const AWARD: Record<keyof RunStats, { label: string; icon: string }> = {
  damageDealt: { label: 'Most damage', icon: 'main-ranger' },
  bossDamage: { label: 'Colossus slayer', icon: 'super-warden' },
  kills: { label: 'Most kills', icon: 'main-commander' },
  damageTaken: { label: 'Took the hits', icon: 'base-armor' },
  deaths: { label: 'Most falls', icon: 'reconnecting' },
  healingDone: { label: 'Best medic', icon: 'repair' },
  buildsPlaced: { label: 'Most builds', icon: 'act-shield' },
};

export const COLOR_VAR = (c: PlayerColorId): string => `var(--player-${c})`;
export const COLOR_ON_VAR = (c: PlayerColorId): string => `var(--player-${c}-on)`;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const roman = (n: number): string => ROMAN[n] ?? String(n);

export const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');

/** m:ss */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "Saved 3 min ago" tail of the resume row (SPEC §15.8). */
export function fmtSavedAgo(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'Saved just now';
  if (min < 60) return `Saved ${min} min ago`;
  const h = Math.floor(min / 60);
  return `Saved ${h} h ago`;
}

/** Display form of a join URL without the query: "fort-frenzy.fostercurtis.dev/play". */
export function shortUrl(joinUrl: string): string {
  try {
    const u = new URL(joinUrl);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')}`;
  } catch {
    return joinUrl;
  }
}
