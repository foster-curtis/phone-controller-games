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
    classId: 'artificer',
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
    holdToConfirm: false,
  },
  {
    id: 'base_hp',
    tier: 1,
    maxTier: 3,
    price: 320,
    visible: true,
    holdToConfirm: true,
  },
  {
    id: 'archer_damage',
    tier: 0,
    maxTier: 1,
    price: 420,
    visible: true,
    holdToConfirm: true,
  },
  {
    id: 'archer_range',
    tier: 0,
    maxTier: 3,
    price: 260,
    visible: true,
    holdToConfirm: false,
  },
  {
    id: 'archer_third',
    tier: 3,
    maxTier: 3,
    price: null,
    visible: true,
    holdToConfirm: false,
  },
  {
    id: 'base_armor',
    tier: 0,
    maxTier: 1,
    price: 500,
    visible: true,
    holdToConfirm: true,
  },
];

export function sampleTeam(
  over: Partial<TeamView> = {},
  me = {
    id: 'dev',
    name: 'Foster',
    color: 'cobalt' as PlayerColorId,
    classId: 'ranger' as ClassId | null,
  },
): TeamView {
  return {
    phase: 'lobby',
    wave: 3,
    buildEndsInMs: 38_000,
    coins: 1240,
    baseHp: 340,
    baseMaxHp: 500,
    difficulty: 'normal',
    leaderId: 'dev',
    roster: roster(me),
    shop: SHOP,
    wishlist: [{ item: 'archer_damage', by: 'p2' }],
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
    classId: 'ranger',
    isLeader: true,
    ready: false,
    hp: 80,
    maxHp: 100,
    superCharge: 0.7,
    superReady: false,
    superBlocked: false,
    respawnMs: null,
    cards: { offer: null, picked: null, owned: [], growth: null },
    build: BUILD_RANGER_OFF,
    claim: null,
    ...over,
  };
}

const buildBtn = (over: Partial<NonNullable<MeView['build']>>): MeView['build'] => ({
  id: 'shield_gen',
  input: 'aimed',
  icon: 'act-shield',
  meter: 0,
  full: false,
  mode: 'none',
  active: 0,
  ...over,
});
const BUILD_RANGER_OFF = buildBtn({});
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
      classId: 'ranger',
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
      classId: 'artificer',
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
    buildsPlaced: 0,
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
      roster: roster({ ...q, classId: 'ranger' }).map((p) => ({ ...p, ready: true })),
    }),
    me: sampleMe({ screen: 'lobby', ready: true }),
  }),
  // Jade, rose and sky are held by the others (the picker marks them unavailable).
  'lobby-colors': () => ({
    team: sampleTeam(),
    me: sampleMe({ screen: 'lobby', color: 'bone' }),
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
        { slot: 0, name: 'Foster', classId: 'ranger' },
        { slot: 2, name: 'Dev', classId: 'artificer' },
        { slot: 3, name: 'Sam', classId: 'commander' },
      ],
    }),
  }),
  combat: () => ({ team: sampleTeam({ phase: 'combat' }), me: sampleMe() }),
  'combat-super': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ superCharge: 1, superReady: true }),
  }),
  'combat-build-ready': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ build: buildBtn({ meter: 1, full: true, mode: 'place' }) }),
  }),
  'combat-warden': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({
      classId: 'warden',
      build: buildBtn({ id: 'mine', icon: 'act-mine', meter: 0.5, mode: 'none' }),
    }),
  }),
  'combat-artificer': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({
      classId: 'artificer',
      build: buildBtn({ id: 'beacon', input: 'tap', icon: 'act-beacon', mode: 'place' }),
    }),
  }),
  'combat-commander': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({
      classId: 'commander',
      build: buildBtn({
        id: 'rally_flag',
        input: 'tap',
        icon: 'act-recall',
        full: true,
        mode: 'recall',
        active: 1,
      }),
    }),
  }),
  // A finger down on the main button, dragged left: the joystick floats to the touch (aimed attacks).
  'combat-aiming': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ classId: 'artificer' }),
    after: (stage) => {
      const zone = stage.querySelector<HTMLElement>('.attack-zone');
      const main = stage.querySelector<HTMLElement>('.round-btn.main');
      if (!zone || !main) return;
      const r = main.getBoundingClientRect();
      const fire = (type: string, x: number, y: number) => {
        const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
        Object.defineProperty(e, 'pointerId', { value: 91 });
        zone.dispatchEvent(e);
      };
      const x = r.left + r.width / 2 + 28;
      const y = r.top + r.height / 2 - 18;
      fire('pointerdown', x, y);
      fire('pointermove', x - 44, y - 14);
    },
  }),
  shop: () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      cards: { offer: OFFER, picked: null, owned: [{ id: 'haste', n: 2 }], growth: null },
    }),
  }),
  'shop-picked': () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      classId: 'artificer',
      cards: { offer: null, picked: 'overflow', owned: [{ id: 'overflow', n: 1 }], growth: null },
    }),
  }),
  dead: () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ screen: 'dead', hp: 0, respawnMs: 12_000 }),
  }),
  // Team pause (FF14-fix-1): another player paused; this phone shows Resume.
  'combat-paused': () => ({
    team: sampleTeam({
      phase: 'combat',
      paused: { playerId: 'p2', name: 'Riley', color: 'jade' },
    }),
    me: sampleMe(),
  }),
  'build-paused': () => ({
    team: sampleTeam({ phase: 'build', paused: { playerId: 'dev', name: q.name, color: q.color } }),
    me: sampleMe({ screen: 'build' }),
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
