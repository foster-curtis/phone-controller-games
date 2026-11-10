// Display copy and icon ids for the phone (neon knights, SPEC §2.1, §2.6, §6.1, §6.2, §8). Game code
// refers to internal ids; this table is the phone's slice of the theme pack (the full pack arrives with
// FF3's `themes/<id>/shared.ts`, which should absorb it). Icon ids are the sprite's `icon-<id>` names.
import type { CardId, ClassId, DifficultyId, ShopItemId, StructureId } from '../shared/ids';
import type { MeAction } from '../shared/messages';

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
  engineer: {
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
  quartermaster: {
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

export const STRUCTURE_INFO: Record<StructureId, { name: string; icon: string; cost: number }> = {
  arrow_tower: { name: 'Pulse turret', icon: 'turret', cost: 2 },
  bomb_tower: { name: 'Mortar tower', icon: 'mortar', cost: 3 },
  wall: { name: 'Wall', icon: 'wall', cost: 1 },
  snare: { name: 'Shock net', icon: 'net', cost: 1 },
  fortify: { name: 'Fortify', icon: 'fortify', cost: 2 },
};

export const SHOP_INFO: Record<ShopItemId, { name: string; icon: string }> = {
  crate: { name: 'Power cell', icon: 'cell' },
  repair: { name: 'Base repair', icon: 'repair' },
  archer_damage: { name: 'Sentry damage', icon: 'sentry-damage' },
  archer_range: { name: 'Sentry range', icon: 'sentry-range' },
  archer_third: { name: 'Third sentry', icon: 'sentry-third' },
  squad_stats: { name: 'Squad stats', icon: 'squad' },
  arrow_rate: { name: 'Pulse turret fire rate', icon: 'turret-rate' },
  bomb_radius: { name: 'Mortar blast radius', icon: 'mortar-radius' },
  tower_hp: { name: 'Tower armor', icon: 'tower-hp' },
  wall_hp: { name: 'Wall armor', icon: 'wall-hp' },
  snare_charges: { name: 'Shock net charges', icon: 'net-charges' },
  spiked_walls: { name: 'Charged walls', icon: 'charged-walls' },
  base_armor: { name: 'Base armor', icon: 'base-armor' },
  emergency_kit: { name: 'Emergency kit', icon: 'emergency-kit' },
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
  quick_draw: c('Quick Draw', 'card-attack', 'Faster arrows.'),
  blast_radius: c('Blast Radius', 'card-super', 'Larger super radius.'),
  fire_arrows: c('Fire Arrows', 'card-effect', 'Arrows apply burn.', true),
  piercing_shot: c('Piercing Shot', 'card-attack', 'Pierces the first enemy.', true),
  skyhunter: c('Skyhunter', 'card-hunter', '+50% damage vs Flyers.', true),
  deadeye: c('Deadeye', 'card-passive', 'Steady Aim kicks in faster.', true),
  volley: c('Volley', 'card-attack', 'Every 4th shot fires 3 arrows.', true),
  wildfire: c('Wildfire', 'card-combo', 'Burning enemies burst into flames.', true),
  heavy_slam: c('Heavy Slam', 'card-attack', 'Wider slam arc.'),
  earthshaker: c('Earthshaker', 'card-super', 'Longer super stun.'),
  aftershock: c('Aftershock', 'card-effect', 'Slam leaves a slowing zone.', true),
  giant_slayer: c('Giant Slayer', 'card-hunter', '+50% vs Brutes and the Colossus.', true),
  master_mason: c('Master Mason', 'card-passive', 'Mason repairs faster, wider.', true),
  bodyguard: c('Bodyguard', 'card-ally', 'Nearby allies take 20% less damage.', true),
  unshakable: c('Unshakable', 'card-toughness', 'Immune to slows and knockback.', true),
  fault_line: c('Fault Line', 'card-combo', 'Stomp shocks every wall.', true),
  light_load: c('Light Load', 'card-supply', 'Allies in your aura feel cells half as heavy.'),
  strong_arm: c('Strong Arm', 'card-supply', 'Longer, faster cell throws.'),
  venom_bolts: c('Venom Bolts', 'card-effect', 'Bolts apply poison.', true),
  overflow: c('Overflow', 'card-ally', 'Extra healing becomes a shield.', true),
  bulk_buyer: c('Bulk Buyer', 'card-supply', 'Bigger cell discount.', true),
  wide_aura: c('Wide Aura', 'card-passive', 'Larger Field Medic radius.', true),
  triage: c('Triage', 'card-ally', 'Double healing under 30% HP.', true),
  plague: c('Plague', 'card-combo', 'Poison spreads when enemies die.', true),
  bladework: c('Bladework', 'card-attack', 'Wider sword arc.'),
  forced_march: c('Forced March', 'card-squad', 'Squad moves faster.'),
  rally_cry: c('Rally Cry', 'card-super', 'Longer super duration.', true),
  siege_breakers: c('Siege Breakers', 'card-hunter', 'Squad deals +50% vs Bombards.', true),
  veterans: c('Veterans', 'card-squad', 'Soldiers who survive gain stats.', true),
  last_stand: c('Last Stand', 'card-squad', 'Squad hits harder as it thins.', true),
  vanguard: c('Vanguard', 'card-toughness', 'Take less damage near your squad.', true),
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
  cratesDelivered: 'Cells delivered',
  cratesGiven: 'Cells shared',
  structuresBuilt: 'Built',
};

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'] as const;

/**
 * The action button's icon (SPEC §10.1): the `act-*` glyph per action, `emergency-kit` for the kit,
 * and a dimmed plain glyph when nothing applies.
 */
export function actionIcon(action: MeAction): { id: string; dimmed: boolean } {
  switch (action) {
    case 'kit':
      return { id: 'emergency-kit', dimmed: false };
    case 'none':
      return { id: 'act-pickup', dimmed: true };
    default:
      return { id: `act-${action}`, dimmed: false };
  }
}

/** The Give icon: `act-give` hands over, `act-drop` drops (SPEC §10.1). */
export function giveIcon(give: 'give' | 'drop' | null): { id: string; dimmed: boolean } {
  return { id: give === 'drop' ? 'act-drop' : 'act-give', dimmed: give === null };
}

/** Outside combat only rows 1-4 apply to the action button (pick up, deliver, kit, buy; §10.2). */
export const BUILD_PHASE_ACTIONS: readonly MeAction[] = ['pickup', 'deliver', 'kit', 'buy'];
