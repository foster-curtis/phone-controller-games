// Internal ids (SPEC §2.1, §15.4). Game code and data refer only to these; theme packs map them to
// display names, rigs and icons. Shared by the phones and the TV.
// Frozen at FF1 (BUILD_PLAN §3): additive changes only. Append new ids at the end of an array, never
// reorder or remove (lists are iterated in order, e.g. player colors in brand order).

/** The four classes (SPEC §8). Display names come from the theme (neon knights: Ranger, Warden, …). */
export const CLASS_IDS = ['engineer', 'warden', 'quartermaster', 'commander'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** The Iron Tide (SPEC §9) plus the boss (§9.2). */
export const ENEMY_IDS = [
  'grunt',
  'runner',
  'swarm',
  'brute',
  'flyer',
  'siege',
  'hunter',
  'colossus',
] as const;
export type EnemyId = (typeof ENEMY_IDS)[number];

/** Buildable structures (SPEC §7, §8 build kits). The rally flag is free and isn't a structure. */
export const STRUCTURE_IDS = ['arrow_tower', 'bomb_tower', 'wall', 'snare', 'fortify'] as const;
export type StructureId = (typeof STRUCTURE_IDS)[number];

/** Team shop items (SPEC §6.2), Quartermaster-only items included. */
export const SHOP_ITEM_IDS = [
  'crate',
  'repair',
  'archer_damage',
  'archer_range',
  'archer_third',
  'squad_stats',
  'arrow_rate',
  'bomb_radius',
  'tower_hp',
  'wall_hp',
  'snare_charges',
  'spiked_walls',
  'base_armor',
  'emergency_kit',
] as const;
export type ShopItemId = (typeof SHOP_ITEM_IDS)[number];

/** Upgrade cards (SPEC §6.1): the 8 shared commons, then each class's 8, in the spec's table order. */
export const CARD_IDS = [
  // shared commons (numbers tuned per class, CardDef.perClass)
  'vitality',
  'might',
  'haste',
  'reach',
  'swiftness',
  'focus',
  'toughness',
  'quick_recovery',
  // engineer
  'quick_draw',
  'blast_radius',
  'fire_arrows',
  'piercing_shot',
  'skyhunter',
  'deadeye',
  'volley',
  'wildfire',
  // warden
  'heavy_slam',
  'earthshaker',
  'aftershock',
  'giant_slayer',
  'master_mason',
  'bodyguard',
  'unshakable',
  'fault_line',
  // quartermaster
  'light_load',
  'strong_arm',
  'venom_bolts',
  'overflow',
  'bulk_buyer',
  'wide_aura',
  'triage',
  'plague',
  // commander
  'bladework',
  'forced_march',
  'rally_cry',
  'siege_breakers',
  'veterans',
  'last_stand',
  'vanguard',
  'warcry',
] as const;
export type CardId = (typeof CARD_IDS)[number];

/** Timed status effects (SPEC §6.1, §15.3), auras included (re-applied each step with `refresh`). */
export const EFFECT_IDS = [
  'burn',
  'poison',
  'stun',
  'slow',
  'morale',
  'tower_defense',
  'shield',
  'aura_field_medic',
  'aura_mason',
  'aura_bodyguard',
  'aura_lead_from_the_front',
  'aura_vanguard',
] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

/** Lane entries (SPEC §15.2 Map v1): bottom opens at wave 1, left at 3, right at 8. */
export const LANE_IDS = ['bottom', 'left', 'right'] as const;
export type LaneId = (typeof LANE_IDS)[number];

/** Theme packs (SPEC §2.1). v1 ships neon knights (tech-medieval); Pillow Fort is v2. */
export const THEME_IDS = ['neon-knights'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** SPEC §2.2. */
export const DIFFICULTY_IDS = ['easy', 'normal', 'hard'] as const;
export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

/** Player colors in brand order (SPEC §2.3; `--player-*` in brand.css). Assigned on join. */
export const PLAYER_COLOR_IDS = ['cobalt', 'jade', 'sky', 'bone', 'rose', 'forest'] as const;
export type PlayerColorId = (typeof PLAYER_COLOR_IDS)[number];

/** Sound cues (SPEC §12; BUILD_PLAN FF13). Theme packs map each to a file (`ThemeHost.sfx`). */
export const SFX_IDS = [
  'base_alarm',
  'base_hit',
  'player_hit',
  'enemy_hit',
  'enemy_death',
  'structure_placed',
  'structure_destroyed',
  'boss_windup',
  'purchase',
  'card_pick',
  'wave_start',
  'victory',
  'defeat',
] as const;
export type SfxId = (typeof SFX_IDS)[number];

/** Narrows an unknown value to one of a const id list. */
export function isOneOf<T extends string>(ids: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (ids as readonly string[]).includes(v);
}
