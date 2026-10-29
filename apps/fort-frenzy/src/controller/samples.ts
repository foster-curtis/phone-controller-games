// Sample `team` / `me` snapshots for `?dev=1`: every screen and the states worth checking (offline, no
// relay). The dev switcher emits these through the kit's local client into the real app.
import type { CardId, ClassId, PlayerColorId, ShopItemId } from '../shared/ids';
import type { MeView, TeamView } from '../shared/messages';

export interface Sample {
  team: TeamView;
  me: MeView;
  /** Runs after the screen is up (e.g. opens the Shop tab). */
  after?: (stage: HTMLElement) => void;
}

const roster = (me: {
  id: string;
  name: string;
  color: PlayerColorId;
  classId: ClassId | null;
}): TeamView['roster'] => [
  {
    playerId: me.id,
    name: me.name,
    color: me.color,
    classId: me.classId,
    ready: false,
    connected: true,
  },
  { playerId: 'p2', name: 'Maya', color: 'jade', classId: 'warden', ready: true, connected: true },
  {
    playerId: 'p3',
    name: 'Dev',
    color: 'rose',
    classId: 'quartermaster',
    ready: false,
    connected: true,
  },
  {
    playerId: 'p4',
    name: 'Sam',
    color: 'sky',
    classId: 'commander',
    ready: true,
    connected: false,
  },
];

const SHOP: TeamView['shop'] = [
  {
    id: 'repair',
    tier: 0,
    maxTier: 1,
    price: 180,
    visible: true,
    qmOnly: false,
    holdToConfirm: false,
  },
  {
    id: 'arrow_rate',
    tier: 1,
    maxTier: 3,
    price: 320,
    visible: true,
    qmOnly: false,
    holdToConfirm: true,
  },
  {
    id: 'spiked_walls',
    tier: 0,
    maxTier: 1,
    price: 420,
    visible: true,
    qmOnly: false,
    holdToConfirm: true,
  },
  {
    id: 'archer_range',
    tier: 0,
    maxTier: 3,
    price: 260,
    visible: true,
    qmOnly: false,
    holdToConfirm: false,
  },
  {
    id: 'crate',
    tier: 0,
    maxTier: 1,
    price: 40,
    visible: true,
    qmOnly: false,
    holdToConfirm: false,
  },
  {
    id: 'wall_hp',
    tier: 3,
    maxTier: 3,
    price: null,
    visible: true,
    qmOnly: false,
    holdToConfirm: false,
  },
  {
    id: 'base_armor',
    tier: 0,
    maxTier: 1,
    price: 500,
    visible: true,
    qmOnly: true,
    holdToConfirm: true,
  },
  {
    id: 'emergency_kit',
    tier: 0,
    maxTier: 1,
    price: 150,
    visible: true,
    qmOnly: true,
    holdToConfirm: false,
  },
];

export function sampleTeam(
  over: Partial<TeamView> = {},
  me = {
    id: 'dev',
    name: 'Foster',
    color: 'cobalt' as PlayerColorId,
    classId: 'engineer' as ClassId | null,
  },
): TeamView {
  return {
    phase: 'lobby',
    wave: 3,
    buildEndsInMs: 38_000,
    coins: 1240,
    baseHp: 340,
    baseMaxHp: 500,
    theme: 'neon-knights',
    difficulty: 'normal',
    leaderId: 'dev',
    roster: roster(me),
    shop: SHOP,
    wishlist: [{ item: 'spiked_walls', by: 'p2' }],
    nextWave: null,
    summary: null,
    ...over,
  };
}

export function sampleMe(over: Partial<MeView> = {}): MeView {
  return {
    screen: 'combat',
    slot: 0,
    name: 'Foster',
    color: 'cobalt',
    classId: 'engineer',
    isLeader: true,
    ready: false,
    hp: 80,
    maxHp: 100,
    crates: 1,
    carryCap: 3,
    superCharge: 0.7,
    superReady: false,
    action: 'pickup',
    kits: 0,
    give: 'give',
    arc: null,
    buildKit: [],
    respawnMs: null,
    cards: { offer: null, picked: null, owned: [] },
    build: null,
    claim: null,
    ...over,
  };
}

const ENGINEER_ARC: MeView['arc'] = {
  slots: ['arrow_tower', 'bomb_tower', null, 'give'],
  enabled: [true, false, false, true],
};
const WARDEN_ARC: MeView['arc'] = {
  slots: ['wall', 'snare', 'fortify', 'give'],
  enabled: [true, true, true, true],
};
const GIVE_ONLY: MeView['arc'] = {
  slots: [null, null, null, 'give'],
  enabled: [false, false, false, true],
};
const OFFER: CardId[] = ['piercing_shot', 'haste', 'deadeye'];

const SUMMARY: TeamView['summary'] = {
  result: 'victory',
  wavesSurvived: 15,
  durationMs: 1_482_000,
  players: [
    {
      playerId: 'dev',
      name: 'Foster',
      color: 'cobalt',
      classId: 'engineer',
      award: 'damageDealt',
      stats: stats({ damageDealt: 48210, kills: 212 }),
    },
    {
      playerId: 'p2',
      name: 'Maya',
      color: 'jade',
      classId: 'warden',
      award: 'damageTaken',
      stats: stats({ damageTaken: 9120, kills: 143 }),
    },
    {
      playerId: 'p3',
      name: 'Dev',
      color: 'rose',
      classId: 'quartermaster',
      award: 'healingDone',
      stats: stats({ healingDone: 7420 }),
    },
    {
      playerId: 'p4',
      name: 'Sam',
      color: 'sky',
      classId: 'commander',
      award: 'bossDamage',
      stats: stats({ bossDamage: 5200 }),
    },
  ],
};

function stats(over: Partial<NonNullable<TeamView['summary']>['players'][number]['stats']>) {
  return {
    damageDealt: 0,
    bossDamage: 0,
    kills: 0,
    damageTaken: 0,
    deaths: 0,
    healingDone: 0,
    cratesDelivered: 0,
    cratesGiven: 0,
    structuresBuilt: 0,
    ...over,
  };
}

const q = { id: 'dev', name: 'Foster', color: 'cobalt' as PlayerColorId };

/** Every sample, in switcher order. */
export const SAMPLES: Record<string, () => Sample> = {
  name: () => ({
    team: sampleTeam(),
    me: sampleMe({ screen: 'name', name: '', color: null, classId: null, slot: null }),
  }),
  classSelect: () => ({ team: sampleTeam(), me: sampleMe({ screen: 'lobby', classId: null }) }),
  lobby: () => ({ team: sampleTeam(), me: sampleMe({ screen: 'lobby' }) }),
  'lobby-ready': () => ({
    team: sampleTeam({
      roster: roster({ ...q, classId: 'engineer' }).map((p) => ({ ...p, ready: true })),
    }),
    me: sampleMe({ screen: 'lobby', ready: true }),
  }),
  'lobby-member': () => ({
    team: sampleTeam({ leaderId: 'p2' }),
    me: sampleMe({ screen: 'lobby', isLeader: false }),
  }),
  waiting: () => ({ team: sampleTeam({ phase: 'combat' }), me: sampleMe({ screen: 'waiting' }) }),
  full: () => ({
    team: sampleTeam(),
    me: sampleMe({ screen: 'full', slot: null, name: '', classId: null }),
  }),
  restoring: () => ({
    team: sampleTeam({ phase: 'restoring' }),
    me: sampleMe({ screen: 'restoring' }),
  }),
  claim: () => ({
    team: sampleTeam({ phase: 'restoring' }),
    me: sampleMe({
      screen: 'claim',
      claim: [
        { slot: 0, name: 'Foster', classId: 'engineer' },
        { slot: 2, name: 'Dev', classId: 'quartermaster' },
        { slot: 3, name: 'Sam', classId: 'commander' },
      ],
    }),
  }),
  combat: () => ({ team: sampleTeam({ phase: 'combat' }), me: sampleMe() }),
  'combat-super': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ superCharge: 1, superReady: true }),
  }),
  'combat-carrying': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ crates: 2, action: 'place', arc: ENGINEER_ARC }),
  }),
  'combat-deliver': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ crates: 2, action: 'deliver', give: 'give' }),
  }),
  'combat-kit': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ classId: 'quartermaster', action: 'kit', kits: 1, arc: GIVE_ONLY, crates: 1 }),
  }),
  'combat-none': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ action: 'none', crates: 0, give: null }),
  }),
  'combat-warden': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ classId: 'warden', action: 'place', crates: 2, arc: WARDEN_ARC }),
  }),
  'combat-artificer': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ classId: 'quartermaster', action: 'throw', crates: 2, arc: GIVE_ONLY }),
  }),
  'combat-commander': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ classId: 'commander', action: 'recall', crates: 0 }),
  }),
  build: () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      crates: 2,
      buildKit: ['arrow_tower', 'bomb_tower'],
      build: { selected: 'arrow_tower', valid: true },
    }),
  }),
  'build-blocked': () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      crates: 3,
      classId: 'warden',
      buildKit: ['wall', 'snare', 'fortify'],
      build: { selected: 'wall', valid: false },
    }),
  }),
  'build-none': () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      classId: 'quartermaster',
      crates: 1,
      action: 'buy',
      kits: 1,
      buildKit: [],
    }),
  }),
  shop: () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      crates: 2,
      buildKit: ['arrow_tower', 'bomb_tower'],
      cards: { offer: OFFER, picked: null, owned: [{ id: 'haste', n: 2 }] },
    }),
    after: (stage) => stage.querySelector<HTMLElement>('[data-tab="shop"]')?.click(),
  }),
  'shop-picked': () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      classId: 'quartermaster',
      buildKit: [],
      cards: { offer: null, picked: 'overflow', owned: [{ id: 'overflow', n: 1 }] },
    }),
    after: (stage) => stage.querySelector<HTMLElement>('[data-tab="shop"]')?.click(),
  }),
  dead: () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ screen: 'dead', hp: 0, respawnMs: 12_000 }),
  }),
  'summary-victory': () => ({
    team: sampleTeam({ phase: 'summary', summary: SUMMARY }),
    me: sampleMe({ screen: 'summary' }),
  }),
  'summary-defeat': () => ({
    team: sampleTeam({
      phase: 'summary',
      summary: { ...SUMMARY!, result: 'defeat', wavesSurvived: 7 },
    }),
    me: sampleMe({ screen: 'summary', isLeader: false }),
  }),
};

export const SAMPLE_IDS = Object.keys(SAMPLES);

/** A shop item id used by the tests. */
export const SAMPLE_SHOP_ITEM: ShopItemId = 'repair';
