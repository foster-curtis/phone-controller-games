// Neon knights presentation, the part phones and the TV share (SPEC §2.1, §2.6, §15.4): display names
// for every internal id, the icon map (internal ids → icon ids), the inline icon sprite and the knight
// portraits. Presentation only; the sim never sees it. Icon ids are typed against the generated
// names, so a missing icon fails the typecheck.
import type { IconName } from '../../generated/keys';
import iconMarkup from '../../generated/neon-knights/icons.svg?raw';
import type { ActIconId, BuildId, CardId, ClassId, RoleId, ShopItemId } from '../shared/ids';
import { ICON_SYMBOL_PREFIX, type PresentationShared } from './types';

/** Typed icon id; the asset-keys test also checks each literal against the manifest. */
export const ik = <K extends IconName>(k: K): K => k;

const portraitUrls = import.meta.glob<string>('../../generated/neon-knights/portraits/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});
const portraitUrl = (rig: string, kind: 'body' | 'mask'): string =>
  portraitUrls[`../../generated/neon-knights/portraits/${rig}-${kind}.svg`] ?? '';

const SYMBOL_ID = new RegExp(`<symbol id="${ICON_SYMBOL_PREFIX}([^"]+)"`, 'g');

const classIcons = {
  ranger: ik('class-ranger'),
  warden: ik('class-warden'),
  artificer: ik('class-artificer'),
  commander: ik('class-commander'),
} satisfies Record<ClassId, IconName>;

const mainIcons = {
  ranger: ik('main-ranger'),
  warden: ik('main-warden'),
  artificer: ik('main-artificer'),
  commander: ik('main-commander'),
} satisfies Record<ClassId, IconName>;

const superIcons = {
  ranger: ik('super-ranger'),
  warden: ik('super-warden'),
  artificer: ik('super-artificer'),
  commander: ik('super-commander'),
} satisfies Record<ClassId, IconName>;

const roleIcons = {
  tank: ik('role-tank'),
  marksman: ik('role-marksman'),
  support: ik('role-support'),
  control: ik('role-control'),
} satisfies Record<RoleId, IconName>;

/** The build button's icon per build (§10.1); the Commander's recall is `act-recall`. */
const buildIcons = {
  shield_gen: 'act-shield',
  mine: 'act-mine',
  beacon: 'act-beacon',
  rally_flag: 'act-flag',
} satisfies Record<BuildId, ActIconId & IconName>;

const shopIcons = {
  repair: ik('repair'),
  archer_damage: ik('sentry-damage'),
  archer_range: ik('sentry-range'),
  archer_third: ik('sentry-third'),
  base_hp: ik('base-hp'),
  base_armor: ik('base-armor'),
} satisfies Record<ShopItemId, IconName>;

// Card marks (SPEC §6.1 table, §15.11 #88): the commons have their own marks.
const cardIcons = {
  vitality: ik('card-vitality'),
  might: ik('card-might'),
  haste: ik('card-haste'),
  reach: ik('card-reach'),
  swiftness: ik('card-swiftness'),
  focus: ik('card-focus'),
  toughness: ik('card-toughness'),
  quick_recovery: ik('card-recovery'),
  tinkerer: ik('card-tinkerer'),
  quick_draw: ik('card-attack'),
  piercing_shot: ik('card-attack'),
  volley: ik('card-attack'),
  heavy_slam: ik('card-attack'),
  heavy_bash: ik('card-attack'),
  blast_radius: ik('card-super'),
  earthshaker: ik('card-super'),
  rally_cry: ik('card-super'),
  shrapnel_charge: ik('card-build'),
  minefield: ik('card-build'),
  wide_field: ik('card-build'),
  reinforced_generator: ik('card-build'),
  booster_beacon: ik('card-build'),
  strong_arm: ik('card-build'),
  steady_aim: ik('card-passive'),
  challenger: ik('card-passive'),
  field_medic: ik('card-passive'),
  morale: ik('card-passive'),
  deadeye: ik('card-passive'),
  wide_aura: ik('card-passive'),
  fire_arrows: ik('card-effect'),
  venom_bolts: ik('card-effect'),
  aftershock: ik('card-effect'),
  skyhunter: ik('card-hunter'),
  giant_slayer: ik('card-hunter'),
  siege_breakers: ik('card-hunter'),
  overflow: ik('card-ally'),
  triage: ik('card-ally'),
  forced_march: ik('card-squad'),
  veterans: ik('card-squad'),
  last_stand: ik('card-squad'),
  drillmaster: ik('card-squad'),
  reinforced_ranks: ik('card-squad'),
  unshakable: ik('card-toughness'),
  vanguard: ik('card-toughness'),
  wildfire: ik('card-combo'),
  fault_line: ik('card-combo'),
  plague: ik('card-combo'),
  warcry: ik('card-combo'),
} satisfies Record<CardId, IconName>;

const cardNames = {
  vitality: 'Vitality',
  might: 'Might',
  haste: 'Haste',
  reach: 'Reach',
  swiftness: 'Swiftness',
  focus: 'Focus',
  toughness: 'Toughness',
  quick_recovery: 'Quick Recovery',
  tinkerer: 'Tinkerer',
  quick_draw: 'Quick Draw',
  blast_radius: 'Blast Radius',
  shrapnel_charge: 'Shrapnel Charge',
  fire_arrows: 'Fire Arrows',
  piercing_shot: 'Piercing Shot',
  skyhunter: 'Skyhunter',
  volley: 'Volley',
  steady_aim: 'Steady Aim',
  deadeye: 'Deadeye',
  minefield: 'Minefield',
  wildfire: 'Wildfire',
  heavy_slam: 'Heavy Slam',
  earthshaker: 'Earthshaker',
  wide_field: 'Wide Field',
  aftershock: 'Aftershock',
  giant_slayer: 'Giant Slayer',
  unshakable: 'Unshakable',
  challenger: 'Challenger',
  reinforced_generator: 'Reinforced Generator',
  fault_line: 'Fault Line',
  strong_arm: 'Strong Arm',
  booster_beacon: 'Booster Beacon',
  venom_bolts: 'Venom Bolts',
  overflow: 'Overflow',
  triage: 'Triage',
  field_medic: 'Field Medic',
  wide_aura: 'Wide Aura',
  plague: 'Plague',
  heavy_bash: 'Heavy Bash',
  forced_march: 'Forced March',
  drillmaster: 'Drillmaster',
  siege_breakers: 'Siege Breakers',
  veterans: 'Veterans',
  last_stand: 'Last Stand',
  vanguard: 'Vanguard',
  rally_cry: 'Rally Cry',
  morale: 'Morale',
  reinforced_ranks: 'Reinforced Ranks',
  warcry: 'Warcry',
} satisfies Record<CardId, string>;

// Shop items in the set's words (SPEC §2.1: base archers are sentry guns).
const shopNames = {
  repair: 'Citadel repair',
  archer_damage: 'Sentry damage',
  archer_range: 'Sentry range',
  archer_third: 'Third sentry',
  base_hp: 'Citadel max HP',
  base_armor: 'Citadel armor',
} satisfies Record<ShopItemId, string>;

export const presentationShared: PresentationShared = {
  // SPEC §2.1 display names.
  names: {
    ranger: 'Ranger',
    warden: 'Warden',
    artificer: 'Artificer',
    commander: 'Commander',
    tank: 'Tank',
    marksman: 'Marksman',
    support: 'Support',
    control: 'Control',
    shield_gen: 'Shield generator',
    mine: 'Mines',
    beacon: 'Healing beacon',
    rally_flag: 'Rally flag',
    grunt: 'Drone',
    runner: 'Skitter',
    brute: 'Brute',
    siege: 'Bombard',
    flyer: 'Wasp drone',
    swarm: 'Scrap mites',
    hunter: 'Stalker',
    colossus: 'Colossus',
    base: 'Citadel',
    faction: 'The Iron Tide',
    ...shopNames,
    ...cardNames,
  },
  icons: {
    markup: iconMarkup,
    ids: [...iconMarkup.matchAll(SYMBOL_ID)].map((m) => m[1]!),
  },
  iconFor: {
    knight: classIcons,
    role: roleIcons,
    main: mainIcons,
    super: superIcons,
    build: buildIcons,
    shop: shopIcons,
    card: cardIcons,
  },
  portraits: {
    ranger: { body: portraitUrl('ranger', 'body'), color: portraitUrl('ranger', 'mask') },
    warden: { body: portraitUrl('warden', 'body'), color: portraitUrl('warden', 'mask') },
    artificer: {
      body: portraitUrl('artificer', 'body'),
      color: portraitUrl('artificer', 'mask'),
    },
    commander: { body: portraitUrl('commander', 'body'), color: portraitUrl('commander', 'mask') },
  },
};
