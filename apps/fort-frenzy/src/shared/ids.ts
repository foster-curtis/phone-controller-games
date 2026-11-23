// Internal ids (SPEC §2.1, §15.4). Game code and data refer only to these; presentation maps them to
// display names, rigs and icons. Shared by the phones and the TV.
// Frozen after RD2 (REDESIGN_BUILD_PLAN §3): append-only. Append new ids at the end of an array, never
// reorder or remove (lists are iterated in order, e.g. player colors in brand order).

/** The knights (SPEC §8.2). `ClassId` is the knights' historic wire name and stays an alias (#94). */
export const KNIGHT_IDS = ['ranger', 'warden', 'artificer', 'commander'] as const;
export type KnightId = (typeof KNIGHT_IDS)[number];
export const CLASS_IDS = KNIGHT_IDS;
export type ClassId = KnightId;

/** The classes (SPEC §8.1): a knight's playstyle. */
export const ROLE_IDS = ['tank', 'marksman', 'support', 'control'] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** One build per knight (SPEC §7.4). */
export const BUILD_IDS = ['shield_gen', 'mine', 'beacon', 'rally_flag'] as const;
export type BuildId = (typeof BUILD_IDS)[number];

/** The six portals (SPEC §3.1) and the three sides. */
export const PORTAL_IDS = [
  'bottom-w',
  'bottom-e',
  'left-n',
  'left-s',
  'right-n',
  'right-s',
] as const;
export type PortalId = (typeof PORTAL_IDS)[number];
export const SIDE_IDS = ['left', 'bottom', 'right'] as const;
export type SideId = (typeof SIDE_IDS)[number];

/** Build-button icons (SPEC §2.6, §10.1). */
export const ACT_ICON_IDS = [
  'act-shield',
  'act-mine',
  'act-beacon',
  'act-flag',
  'act-recall',
] as const;
export type ActIconId = (typeof ACT_ICON_IDS)[number];

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

/** Team shop (SPEC §6.2). The sentry upgrades keep their `archer_*` code ids (#95). */
export const SHOP_ITEM_IDS = [
  'repair',
  'archer_damage',
  'archer_range',
  'archer_third',
  'base_hp',
  'base_armor',
] as const;
export type ShopItemId = (typeof SHOP_ITEM_IDS)[number];

/** Upgrade cards (SPEC §6.1): the 9 commons, then each knight's, in the spec's table order. */
export const CARD_IDS = [
  'vitality',
  'might',
  'haste',
  'reach',
  'swiftness',
  'focus',
  'toughness',
  'quick_recovery',
  'tinkerer',
  // ranger
  'quick_draw',
  'blast_radius',
  'shrapnel_charge',
  'fire_arrows',
  'piercing_shot',
  'skyhunter',
  'volley',
  'steady_aim',
  'deadeye',
  'minefield',
  'wildfire',
  // warden
  'heavy_slam',
  'earthshaker',
  'wide_field',
  'aftershock',
  'giant_slayer',
  'unshakable',
  'challenger',
  'reinforced_generator',
  'fault_line',
  // artificer
  'strong_arm',
  'booster_beacon',
  'venom_bolts',
  'overflow',
  'triage',
  'field_medic',
  'wide_aura',
  'plague',
  // commander
  'heavy_bash',
  'forced_march',
  'drillmaster',
  'siege_breakers',
  'veterans',
  'last_stand',
  'vanguard',
  'rally_cry',
  'morale',
  'reinforced_ranks',
  'warcry',
] as const;
export type CardId = (typeof CARD_IDS)[number];

/**
 * Timed status effects (SPEC §15.3), auras included (re-applied each step with `refresh`).
 */
export const EFFECT_IDS = [
  'burn',
  'poison',
  'stun',
  'slow',
  'morale',
  'shield',
  'aura_field_medic',
  'aura_vanguard',
  'guard',
  'taunt',
] as const;
export type EffectId = (typeof EFFECT_IDS)[number];

/** SPEC §2.2. */
export const DIFFICULTY_IDS = ['easy', 'normal', 'hard'] as const;
export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

/** Player colors in brand order (SPEC §2.3; `--player-*` in brand.css). Assigned on join. */
export const PLAYER_COLOR_IDS = ['cobalt', 'jade', 'sky', 'bone', 'rose', 'forest'] as const;
export type PlayerColorId = (typeof PLAYER_COLOR_IDS)[number];

/** Sound cues (SPEC §12); RD13 may append. Presentation maps each to a file (`PresentationHost.sfx`). */
export const SFX_IDS = [
  'base_alarm',
  'base_hit',
  'player_hit',
  'enemy_hit',
  'enemy_death',
  'build_placed',
  'build_destroyed',
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
