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
const BUILD_RANGER_OFF = buildBtn({
  id: 'mine',
  input: 'tap',
  icon: 'act-mine',
});
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
  // A solo leader: Start is there (one Ready player is enough to force-start, #100).
  'lobby-solo': () => ({
    team: sampleTeam({ roster: roster({ ...q, classId: 'ranger' }).slice(0, 1) }),
    me: sampleMe({ screen: 'lobby' }),
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
  // The build button's states (SPEC §10.1): empty (dimmed), filling (dimmed, ring partly lit), full
  // (lit, steady amber ring), recall (lit), and the aimed throw with the joystick floating.
  'combat-build-empty': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ build: BUILD_RANGER_OFF }),
  }),
  'combat-build-charging': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ build: buildBtn({ ...BUILD_RANGER_OFF, meter: 0.45 }) }),
  }),
  'combat-build-ready': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({ build: buildBtn({ ...BUILD_RANGER_OFF, meter: 1, full: true, mode: 'place' }) }),
  }),
  'combat-warden': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({
      classId: 'warden',
      build: buildBtn({ id: 'shield_gen', icon: 'act-shield', meter: 0.5, mode: 'none' }),
    }),
  }),
  'combat-warden-ready': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({
      classId: 'warden',
      build: buildBtn({
        id: 'shield_gen',
        icon: 'act-shield',
        meter: 1,
        full: true,
        mode: 'place',
      }),
    }),
  }),
  'combat-artificer': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({
      classId: 'artificer',
      build: buildBtn({ id: 'beacon', icon: 'act-beacon', meter: 1, full: true, mode: 'place' }),
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
        meter: 0.3,
        mode: 'recall',
        active: 1,
      }),
    }),
  }),
  'combat-commander-throw': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({
      classId: 'commander',
      build: buildBtn({ id: 'rally_flag', icon: 'act-flag', meter: 1, full: true, mode: 'place' }),
    }),
  }),
  // A finger down on the build button, dragged out: the aimed throw's joystick floats to the touch.
  'combat-build-aiming': () => ({
    team: sampleTeam({ phase: 'combat' }),
    me: sampleMe({
      classId: 'warden',
      build: buildBtn({
        id: 'shield_gen',
        icon: 'act-shield',
        meter: 1,
        full: true,
        mode: 'place',
      }),
    }),
    after: (stage) => {
      const zone = stage.querySelector<HTMLElement>('.attack-zone');
      const btn = stage.querySelector<HTMLElement>('.round-btn.action');
      if (!zone || !btn) return;
      const r = btn.getBoundingClientRect();
      const fire = (type: string, x: number, y: number) => {
        const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
        Object.defineProperty(e, 'pointerId', { value: 92 });
        zone.dispatchEvent(e);
      };
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      fire('pointerdown', x, y);
      fire('pointermove', x - 40, y - 12);
    },
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
  // Card pop-up (SPEC §10.2): the growth header, three cards, Confirm; wave 0 has no header.
  cards: () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      cards: {
        offer: OFFER,
        picked: null,
        owned: [{ id: 'haste', n: 2 }],
        growth: { wave: 4, boss: false, stats: ['maxHp', 'damage'], pct: { maxHp: 2, damage: 2 } },
      },
    }),
  }),
  'cards-first': () => ({
    team: sampleTeam({ phase: 'build', wave: 0 }),
    me: sampleMe({
      screen: 'build',
      cards: { offer: OFFER, picked: null, owned: [], growth: null },
    }),
  }),
  'cards-boss': () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      classId: 'artificer',
      cards: {
        offer: ['overflow', 'wide_aura', 'vitality'],
        picked: null,
        owned: [],
        growth: {
          wave: 5,
          boss: true,
          stats: ['maxHp', 'damage', 'healing'],
          pct: { maxHp: 4, damage: 4, healing: 6 },
        },
      },
    }),
  }),
  'cards-selected': () => ({
    team: sampleTeam({ phase: 'build' }),
    me: sampleMe({
      screen: 'build',
      cards: {
        offer: OFFER,
        picked: null,
        owned: [],
        growth: { wave: 4, boss: false, stats: ['maxHp', 'damage'], pct: { maxHp: 2, damage: 2 } },
      },
    }),
    after: (stage) => stage.querySelector<HTMLElement>('.upgrade-card:nth-child(2)')?.click(),
  }),
  // Shop (SPEC §10.3): after the pick; the stick on the left third, rows on the right 2/3.
  shop: () => ({
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
  // Pause menu (RD6-fix-1): a non-leader sees Leave game only; each option opens its confirm step.
  'paused-member': () => ({
    team: sampleTeam({
      phase: 'combat',
      paused: { playerId: 'p2', name: 'Riley', color: 'jade' },
    }),
    me: sampleMe({ isLeader: false }),
  }),
  'paused-leave': () => ({
    team: sampleTeam({
      phase: 'combat',
      paused: { playerId: 'p2', name: 'Riley', color: 'jade' },
    }),
    me: sampleMe(),
    after: (stage) => stage.querySelector<HTMLElement>('[data-leave]')?.click(),
  }),
  'paused-end': () => ({
    team: sampleTeam({ phase: 'build', paused: { playerId: 'dev', name: q.name, color: q.color } }),
    me: sampleMe({ screen: 'build' }),
    after: (stage) => stage.querySelector<HTMLElement>('[data-end-game]')?.click(),
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
