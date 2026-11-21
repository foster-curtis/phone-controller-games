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

export interface ClassInfo {
  name: string;
  role: string;
  /** Rig id: portraits and icon ids are named by it. */
  rig: 'ranger' | 'warden' | 'artificer' | 'commander';
  main: AttackInfo;
  super: AttackInfo;
  passive: string;
  passiveText: string;
  builds: string;
  /** The build kit, one entry per structure (or the Artificer's supply role). */
  kit: { name: string; text: string }[];
}

export const CLASS_INFO: Record<ClassId, ClassInfo> = {
  ranger: {
    name: 'Ranger',
    role: 'Marksman',
    rig: 'ranger',
    main: {
      name: 'Rail-bow shot',
      mode: 'aim',
      text: 'The longest range in the game. Drag to aim.',
    },
    super: {
      name: 'Pulse shot',
      mode: 'tap',
      text: 'A wide ring around you that hurts and knocks enemies back.',
    },
    passive: 'Steady Aim',
    passiveText: 'Stand still, stick released, and your shots hit harder and reach farther.',
    builds: 'Pulse turret, mortar',
    kit: [
      { name: 'Pulse turret', text: 'Long range, one target, can hit Flyers.' },
      { name: 'Mortar', text: 'Short range, area damage.' },
    ],
  },
  warden: {
    name: 'Warden',
    role: 'Tank',
    rig: 'warden',
    main: {
      name: 'Ground slam',
      mode: 'aim',
      text: 'A short arc that hits several enemies. Drag to aim.',
    },
    super: {
      name: 'Stomp',
      mode: 'aim',
      text: 'A longer arc that damages and briefly stuns. Drag to aim.',
    },
    passive: 'Mason',
    passiveText: 'Walls near you slowly repair themselves. Off during the build phase.',
    builds: 'Wall, shock net, fortify',
    kit: [
      { name: 'Wall', text: 'Reroutes enemies.' },
      { name: 'Shock net', text: 'A cheap trap that slows enemies, then wears out.' },
      { name: 'Fortify', text: 'Gives a tower a defense bonus.' },
    ],
  },
  artificer: {
    name: 'Artificer',
    role: 'Support',
    rig: 'artificer',
    main: {
      name: 'Nanite bolts',
      mode: 'aim',
      text: '3-4 bolts in a narrow cone, medium-long range. Walls and towers block them.',
    },
    super: {
      name: 'Nanite cone',
      mode: 'aim',
      text: 'A very wide, long cone that heals players and shields towers. Passes through walls.',
    },
    passive: 'Field Medic',
    passiveText: 'A small healing aura for nearby players. Off during the build phase.',
    builds: 'Nothing, supplies the team',
    kit: [
      { name: 'Supplies', text: 'Builds nothing. Carries and throws power cells to the team.' },
    ],
  },
  commander: {
    name: 'Commander',
    role: 'Squad leader',
    rig: 'commander',
    main: { name: 'Sword slash', mode: 'aim', text: 'A short arc in front of you. Drag to aim.' },
    super: {
      name: 'Rally',
      mode: 'tap',
      text: 'Your squad and you attack faster and harder, and you run faster.',
    },
    passive: 'Lead from the Front',
    passiveText: 'Your squad deals more damage while near you.',
    builds: 'Rally flag',
    kit: [{ name: 'Rally flag', text: 'Your squad holds the flag when it is not following you.' }],
  },
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
  blast_radius: c('Blast Radius', 'card-super', 'Larger super radius.'),
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
  aftershock: c('Aftershock', 'card-effect', 'Slam leaves a slowing zone.', true),
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
