// Display copy and icon ids for the phone (neon knights, SPEC §2.1, §2.6, §6.1, §6.2, §8). Game code
// refers to internal ids; this table is the phone's slice of the presentation pack (src/presentation/shared.ts
// should absorb it). Icon ids are the sprite's `icon-<id>` names.
import type { CardId, ClassId, DifficultyId, ShopItemId } from '../shared/ids';

export interface AttackInfo {
  name: string;
  /** One line on what it does (SPEC §8), shown on the class card. */
  text: string;
  /** How the button is used (SPEC §10.1 input type per character). */
  mode: 'tap' | 'aim';
}

export interface BuildInfo {
  name: string;
  text: string;
  /** How the build button is used (§10.1, §7.3): at-feet builds are tap, thrown builds are aimed. */
  mode: 'tap' | 'aim';
  /** The button's icon while it can place (`act-*`, §2.6). */
  icon: string;
}

export interface ClassInfo {
  name: string;
  /** The class (§8.1): Tank, Marksman, Support, Control. */
  role: string;
  /** Its `role-*` badge. */
  roleIcon: string;
  /** Rig id: portraits and icon ids are named by it. */
  rig: 'ranger' | 'warden' | 'artificer' | 'commander';
  main: AttackInfo;
  super: AttackInfo;
  build: BuildInfo;
  /** The knight's rare, unique passive card (§6.1, §8.2): no knight has a built-in passive. */
  passiveCard: CardId;
}

// ==== Knights: Ranger =============================================================================
const RANGER: ClassInfo = {
  name: 'Ranger',
  role: 'Marksman',
  roleIcon: 'role-marksman',
  rig: 'ranger',
  main: {
    name: 'Longbow shot',
    mode: 'aim',
    text: 'The longest range in the game. Drag to aim.',
  },
  super: {
    name: 'Shockwave',
    mode: 'tap',
    text: 'A wide ring around you that knocks enemies back and hurts them a little.',
  },
  build: {
    name: 'Mines',
    mode: 'tap',
    icon: 'act-mine',
    text: 'Drops a mine at your feet. Up to 3 at once; a new one replaces the oldest.',
  },
  passiveCard: 'steady_aim',
};

// ==== Knights: Warden =============================================================================
const WARDEN: ClassInfo = {
  name: 'Warden',
  role: 'Tank',
  roleIcon: 'role-tank',
  rig: 'warden',
  main: {
    name: 'Hammer smash',
    mode: 'aim',
    text: 'Damage in an arc in front of you. Drag to aim.',
  },
  super: {
    name: 'Jump slam',
    mode: 'aim',
    text: 'Leap, then stun in a longer arc. Drag to aim.',
  },
  build: {
    name: 'Shield generator',
    mode: 'aim',
    icon: 'act-shield',
    text: 'Throw a field that shields allies inside it.',
  },
  passiveCard: 'challenger',
};

// ==== Knights: Artificer ==========================================================================
const ARTIFICER: ClassInfo = {
  name: 'Artificer',
  role: 'Support',
  roleIcon: 'role-support',
  rig: 'artificer',
  main: {
    name: 'Nanite blast',
    mode: 'aim',
    text: 'A burst of nanites in a narrow cone. Drag to aim.',
  },
  super: {
    name: 'Heal cone',
    mode: 'aim',
    text: 'A wide cone that heals you and the knights it reaches. Drag to aim.',
  },
  build: {
    name: 'Healing beacon',
    mode: 'aim',
    icon: 'act-beacon',
    text: 'Throw a beacon that heals knights near it.',
  },
  passiveCard: 'field_medic',
};

// ==== Knights: Commander ==========================================================================
const COMMANDER: ClassInfo = {
  name: 'Commander',
  role: 'Control',
  roleIcon: 'role-control',
  rig: 'commander',
  main: {
    name: 'Shield bash',
    mode: 'aim',
    text: 'A short arc in front of you that knocks enemies back. Drag to aim.',
  },
  super: {
    name: 'Reinforcements',
    mode: 'tap',
    text: 'Calls one more soldier to your squad.',
  },
  build: {
    name: 'Rally flag',
    mode: 'aim',
    icon: 'act-flag',
    text: 'Throw a flag your squad holds. Tap to recall it.',
  },
  passiveCard: 'morale',
};

export const CLASS_INFO: Record<ClassId, ClassInfo> = {
  ranger: RANGER,
  warden: WARDEN,
  artificer: ARTIFICER,
  commander: COMMANDER,
};

export const SHOP_INFO: Record<ShopItemId, { name: string; icon: string }> = {
  repair: { name: 'Base repair', icon: 'repair' },
  archer_damage: { name: 'Sentry damage', icon: 'sentry-damage' },
  archer_range: { name: 'Sentry range', icon: 'sentry-range' },
  archer_third: { name: 'Third sentry', icon: 'sentry-third' },
  base_hp: { name: 'Base max HP', icon: 'base-hp' },
  base_armor: { name: 'Base armor', icon: 'base-armor' },
};

export const DIFFICULTY_NAME: Record<DifficultyId, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

export interface CardInfo {
  name: string;
  /** Category mark icon id (SPEC §6.1). */
  mark: string;
  rare: boolean;
  text: string;
}

const c = (name: string, mark: string, text: string, rare = false): CardInfo => ({
  name,
  mark,
  rare,
  text,
});

export const CARD_INFO: Record<CardId, CardInfo> = {
  vitality: c('Vitality', 'card-vitality', '+max HP.'),
  might: c('Might', 'card-might', '+damage.'),
  haste: c('Haste', 'card-haste', '+attack speed.'),
  reach: c('Reach', 'card-reach', '+range.'),
  swiftness: c('Swiftness', 'card-swiftness', '+move speed.'),
  focus: c('Focus', 'card-focus', '+super charge rate.'),
  toughness: c('Toughness', 'card-toughness', 'Take less damage.'),
  quick_recovery: c('Quick Recovery', 'card-recovery', 'Respawn 2 s faster.'),
  tinkerer: c('Tinkerer', 'card-tinkerer', 'Your build meter fills faster.'),
  quick_draw: c('Quick Draw', 'card-attack', 'Faster arrows.'),
  blast_radius: c('Blast Radius', 'card-super', 'Larger shockwave.'),
  shrapnel_charge: c('Shrapnel Charge', 'card-build', 'Mines trigger faster and hit wider.'),
  fire_arrows: c('Fire Arrows', 'card-effect', 'Arrows apply burn.', true),
  piercing_shot: c('Piercing Shot', 'card-attack', 'Pierces the first enemy.', true),
  skyhunter: c('Skyhunter', 'card-hunter', '+50% damage vs Flyers.', true),
  steady_aim: c('Steady Aim', 'card-passive', 'Stand still: more damage and range.', true),
  deadeye: c('Deadeye', 'card-passive', 'Steady Aim kicks in faster.', true),
  minefield: c('Minefield', 'card-build', '+1 active mine.', true),
  volley: c('Volley', 'card-attack', 'Every 4th shot fires 3 arrows.', true),
  wildfire: c('Wildfire', 'card-combo', 'Burning enemies burst into flames.', true),
  heavy_slam: c('Heavy Slam', 'card-attack', 'Wider slam arc.'),
  earthshaker: c('Earthshaker', 'card-super', 'Longer super stun.'),
  wide_field: c('Wide Field', 'card-build', 'Larger shield generator field.'),
  aftershock: c('Aftershock', 'card-effect', 'Jump slam slows enemies for 5 s.', true),
  giant_slayer: c('Giant Slayer', 'card-hunter', '+50% vs Brutes and the Colossus.', true),
  unshakable: c('Unshakable', 'card-toughness', 'Immune to slows and knockback.', true),
  challenger: c('Challenger', 'card-passive', 'Nearby enemies target you first.', true),
  reinforced_generator: c(
    'Reinforced Generator',
    'card-build',
    'Tougher generator, stronger shield.',
    true,
  ),
  fault_line: c('Fault Line', 'card-combo', 'Jump slam leaves a slowing fissure.', true),
  strong_arm: c('Strong Arm', 'card-build', 'Longer, faster build throws.'),
  booster_beacon: c('Booster Beacon', 'card-build', 'Beacon heals faster, has more HP.'),
  venom_bolts: c('Venom Bolts', 'card-effect', 'Bolts apply poison.', true),
  overflow: c('Overflow', 'card-ally', 'Extra healing becomes a shield.', true),
  wide_aura: c('Wide Aura', 'card-passive', 'Larger Field Medic radius.', true),
  triage: c('Triage', 'card-ally', 'Double healing under 30% HP.', true),
  field_medic: c('Field Medic', 'card-passive', 'Heal nearby knights in combat.', true),
  plague: c('Plague', 'card-combo', 'Poison spreads when enemies die.', true),
  heavy_bash: c('Heavy Bash', 'card-attack', 'Wider bash, stronger knockback.'),
  forced_march: c('Forced March', 'card-squad', 'Squad moves faster.'),
  drillmaster: c('Drillmaster', 'card-squad', 'Soldiers get more HP and damage.'),
  rally_cry: c('Rally Cry', 'card-super', 'Longer super duration.', true),
  siege_breakers: c('Siege Breakers', 'card-hunter', 'Squad deals +50% vs Bombards.', true),
  veterans: c('Veterans', 'card-squad', 'Soldiers who survive gain stats.', true),
  last_stand: c('Last Stand', 'card-squad', 'Squad hits harder as it thins.', true),
  vanguard: c('Vanguard', 'card-toughness', 'Take less damage near your squad.', true),
  morale: c('Morale', 'card-passive', 'Allies near you or your flag fight harder.', true),
  reinforced_ranks: c('Reinforced Ranks', 'card-squad', '+1 squad cap.', true),
  warcry: c('Warcry', 'card-combo', 'Super also buffs nearby players.', true),
};

/** Run-stat labels for the summary award cards (SPEC §4). */
export const STAT_LABEL: Record<string, string> = {
  damageDealt: 'Damage dealt',
  bossDamage: 'Boss damage',
  kills: 'Kills',
  damageTaken: 'Damage taken',
  deaths: 'Falls',
  healingDone: 'Healing',
  buildsPlaced: 'Built',
};

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;
