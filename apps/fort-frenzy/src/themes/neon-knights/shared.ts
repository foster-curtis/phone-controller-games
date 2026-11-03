// Neon knights theme, the part phones and the TV share (SPEC §2.1, §2.6, §15.4): display names for
// every internal id, the icon map (internal ids → icon ids), the inline icon sprite and the class
// portraits. Presentation only; the sim never sees it. Icon ids are typed against the generated
// names, so a missing icon fails the typecheck.
import type { IconName } from '../../../generated/keys';
import iconMarkup from '../../../generated/neon-knights/icons.svg?raw';
import type { CardId, ClassId, ShopItemId, StructureId } from '../../shared/ids';
import { ICON_SYMBOL_PREFIX, type ThemeShared } from '../types';

/** Typed icon id; the asset-keys test also checks each literal against the manifest. */
export const ik = <K extends IconName>(k: K): K => k;

/** Internal class id → the theme's rig id (also its icon suffix: `class-<rig>`). */
export const CLASS_RIG = {
  engineer: 'ranger',
  warden: 'warden',
  quartermaster: 'artificer',
  commander: 'commander',
} as const satisfies Record<ClassId, string>;

const portraitUrls = import.meta.glob<string>('../../../generated/neon-knights/portraits/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});
const portraitUrl = (rig: string, kind: 'body' | 'mask'): string =>
  portraitUrls[`../../../generated/neon-knights/portraits/${rig}-${kind}.svg`] ?? '';

const SYMBOL_ID = new RegExp(`<symbol id="${ICON_SYMBOL_PREFIX}([^"]+)"`, 'g');

const classIcons = {
  engineer: ik('class-ranger'),
  warden: ik('class-warden'),
  quartermaster: ik('class-artificer'),
  commander: ik('class-commander'),
} satisfies Record<ClassId, IconName>;

const mainIcons = {
  engineer: ik('main-ranger'),
  warden: ik('main-warden'),
  quartermaster: ik('main-artificer'),
  commander: ik('main-commander'),
} satisfies Record<ClassId, IconName>;

const superIcons = {
  engineer: ik('super-ranger'),
  warden: ik('super-warden'),
  quartermaster: ik('super-artificer'),
  commander: ik('super-commander'),
} satisfies Record<ClassId, IconName>;

const structureIcons = {
  arrow_tower: ik('turret'),
  bomb_tower: ik('mortar'),
  wall: ik('wall'),
  snare: ik('net'),
  fortify: ik('fortify'),
} satisfies Record<StructureId, IconName>;

const shopIcons = {
  crate: ik('cell'),
  repair: ik('repair'),
  archer_damage: ik('sentry-damage'),
  archer_range: ik('sentry-range'),
  archer_third: ik('sentry-third'),
  squad_stats: ik('squad'),
  arrow_rate: ik('turret-rate'),
  bomb_radius: ik('mortar-radius'),
  tower_hp: ik('tower-hp'),
  wall_hp: ik('wall-hp'),
  snare_charges: ik('net-charges'),
  spiked_walls: ik('charged-walls'),
  base_armor: ik('base-armor'),
  emergency_kit: ik('emergency-kit'),
} satisfies Record<ShopItemId, IconName>;

// Card marks (SPEC §6.1 table): the 8 commons have their own marks.
const cardIcons = {
  vitality: ik('card-vitality'),
  might: ik('card-might'),
  haste: ik('card-haste'),
  reach: ik('card-reach'),
  swiftness: ik('card-swiftness'),
  focus: ik('card-focus'),
  toughness: ik('card-toughness'),
  quick_recovery: ik('card-recovery'),
  quick_draw: ik('card-attack'),
  piercing_shot: ik('card-attack'),
  volley: ik('card-attack'),
  heavy_slam: ik('card-attack'),
  bladework: ik('card-attack'),
  blast_radius: ik('card-super'),
  earthshaker: ik('card-super'),
  rally_cry: ik('card-super'),
  deadeye: ik('card-passive'),
  master_mason: ik('card-passive'),
  wide_aura: ik('card-passive'),
  fire_arrows: ik('card-effect'),
  venom_bolts: ik('card-effect'),
  aftershock: ik('card-effect'),
  skyhunter: ik('card-hunter'),
  giant_slayer: ik('card-hunter'),
  siege_breakers: ik('card-hunter'),
  bodyguard: ik('card-ally'),
  overflow: ik('card-ally'),
  triage: ik('card-ally'),
  strong_arm: ik('card-supply'),
  bulk_buyer: ik('card-supply'),
  light_load: ik('card-supply'),
  forced_march: ik('card-squad'),
  veterans: ik('card-squad'),
  last_stand: ik('card-squad'),
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
  quick_draw: 'Quick Draw',
  blast_radius: 'Blast Radius',
  fire_arrows: 'Fire Arrows',
  piercing_shot: 'Piercing Shot',
  skyhunter: 'Skyhunter',
  deadeye: 'Deadeye',
  volley: 'Volley',
  wildfire: 'Wildfire',
  heavy_slam: 'Heavy Slam',
  earthshaker: 'Earthshaker',
  aftershock: 'Aftershock',
  giant_slayer: 'Giant Slayer',
  master_mason: 'Master Mason',
  bodyguard: 'Bodyguard',
  unshakable: 'Unshakable',
  fault_line: 'Fault Line',
  light_load: 'Light Load',
  strong_arm: 'Strong Arm',
  venom_bolts: 'Venom Bolts',
  overflow: 'Overflow',
  bulk_buyer: 'Bulk Buyer',
  wide_aura: 'Wide Aura',
  triage: 'Triage',
  plague: 'Plague',
  bladework: 'Bladework',
  forced_march: 'Forced March',
  rally_cry: 'Rally Cry',
  siege_breakers: 'Siege Breakers',
  veterans: 'Veterans',
  last_stand: 'Last Stand',
  vanguard: 'Vanguard',
  warcry: 'Warcry',
} satisfies Record<CardId, string>;

// Shop items in the theme's words (SPEC §2.1: arrow towers are pulse turrets, base archers are
// sentry guns, spiked walls are charged walls, crates are power cells).
const shopNames = {
  crate: 'Power cell',
  repair: 'Citadel repair',
  archer_damage: 'Sentry damage',
  archer_range: 'Sentry range',
  archer_third: 'Third sentry',
  squad_stats: 'Squad stats',
  arrow_rate: 'Pulse turret fire rate',
  bomb_radius: 'Mortar blast radius',
  tower_hp: 'Tower armor',
  wall_hp: 'Wall HP',
  snare_charges: 'Shock Net charges',
  spiked_walls: 'Charged walls',
  base_armor: 'Citadel armor',
  emergency_kit: 'Emergency repair kit',
} satisfies Record<ShopItemId, string>;

export const neonKnightsShared: ThemeShared = {
  id: 'neon-knights',
  defaultDifficulty: 'normal',
  // SPEC §2.1 display names.
  names: {
    engineer: 'Ranger',
    warden: 'Warden',
    quartermaster: 'Artificer',
    commander: 'Commander',
    arrow_tower: 'Pulse turret',
    bomb_tower: 'Mortar tower',
    wall: 'Wall',
    snare: 'Shock Net',
    fortify: 'Fortify',
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
    class: classIcons,
    main: mainIcons,
    super: superIcons,
    structure: structureIcons,
    shop: shopIcons,
    card: cardIcons,
  },
  portraits: {
    engineer: { body: portraitUrl('ranger', 'body'), color: portraitUrl('ranger', 'mask') },
    warden: { body: portraitUrl('warden', 'body'), color: portraitUrl('warden', 'mask') },
    quartermaster: {
      body: portraitUrl('artificer', 'body'),
      color: portraitUrl('artificer', 'mask'),
    },
    commander: { body: portraitUrl('commander', 'body'), color: portraitUrl('commander', 'mask') },
  },
};
