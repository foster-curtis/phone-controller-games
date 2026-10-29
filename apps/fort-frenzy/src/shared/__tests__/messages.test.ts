// Protocol guards (SPEC §15.6, §15.9): a sample of every message passes, malformed ones don't.
import { describe, expect, it } from 'vitest';
import {
  GAME_ID,
  PROTOCOL_VERSION,
  isControllerMsg,
  isHostMsg,
  type ControllerMsg,
  type HostMsg,
  type Intent,
  type InputTuple,
  type MeView,
  type TeamView,
} from '../messages';

const tuple: InputTuple = [100, -100, 0, 0, 55, -20, 5, 3, 1, 12, 0, 3];

const intents: Intent[] = [
  { k: 'name', name: 'Foster' },
  { k: 'name', name: 'ÅngströmXY' },
  { k: 'class', classId: 'quartermaster' },
  { k: 'ready', ready: true },
  { k: 'leader', action: 'start' },
  { k: 'leader', action: 'resume' },
  { k: 'leader', action: 'newRun' },
  { k: 'leader', action: 'theme', theme: 'neon-knights' },
  { k: 'leader', action: 'difficulty', difficulty: 'hard' },
  { k: 'leader', action: 'remove', playerId: 'p2' },
  { k: 'leader', action: 'end', option: 'classes' },
  { k: 'build', action: 'select', structure: 'arrow_tower' },
  { k: 'build', action: 'place' },
  { k: 'build', action: 'cancel' },
  { k: 'buy', item: 'emergency_kit' },
  { k: 'request', item: 'tower_hp', on: false },
  { k: 'card', card: 'fire_arrows' },
  { k: 'give' },
  { k: 'claim', slot: 2 },
];

const controllerMsgs: ControllerMsg[] = [
  tuple,
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1],
  { t: 'hello', proto: PROTOCOL_VERSION, deviceId: 'd-1234' },
  ...intents.map((intent, seq): ControllerMsg => ({ t: 'intent', seq, intent })),
];

const team: TeamView = {
  phase: 'build',
  wave: 4,
  buildEndsInMs: 31_000,
  coins: 120,
  baseHp: 800,
  baseMaxHp: 1000,
  theme: 'neon-knights',
  difficulty: 'normal',
  leaderId: 'p1',
  roster: [
    {
      playerId: 'p1',
      name: 'Ann',
      color: 'cobalt',
      classId: 'warden',
      ready: true,
      connected: true,
    },
    { playerId: 'p2', name: 'Bo', color: 'jade', classId: null, ready: false, connected: false },
  ],
  shop: [
    {
      id: 'arrow_rate',
      tier: 1,
      maxTier: 3,
      price: 80,
      visible: true,
      qmOnly: false,
      holdToConfirm: true,
    },
    {
      id: 'spiked_walls',
      tier: 1,
      maxTier: 1,
      price: null,
      visible: true,
      qmOnly: false,
      holdToConfirm: false,
    },
  ],
  wishlist: [{ item: 'repair', by: 'p2' }],
  nextWave: {
    enemies: [
      { id: 'grunt', count: 12 },
      { id: 'brute', count: 1 },
    ],
    boss: false,
  },
  summary: null,
};

const summaryTeam: TeamView = {
  ...team,
  phase: 'summary',
  nextWave: null,
  buildEndsInMs: null,
  summary: {
    result: 'defeat',
    wavesSurvived: 7,
    durationMs: 640_000,
    players: [
      {
        playerId: 'p1',
        name: 'Ann',
        color: 'cobalt',
        classId: 'warden',
        stats: {
          damageDealt: 9000,
          bossDamage: 1200,
          kills: 140,
          damageTaken: 800,
          deaths: 2,
          healingDone: 0,
          cratesDelivered: 4,
          cratesGiven: 1,
          structuresBuilt: 9,
        },
        award: 'structuresBuilt',
      },
    ],
  },
};

const me: MeView = {
  screen: 'combat',
  slot: 0,
  name: 'Ann',
  color: 'cobalt',
  classId: 'warden',
  isLeader: true,
  ready: false,
  hp: 140,
  maxHp: 200,
  crates: 2,
  carryCap: 4,
  superCharge: 0.4,
  superReady: false,
  action: 'kit',
  kits: 1,
  give: 'give',
  arc: { slots: ['wall', 'snare', 'fortify', 'give'], enabled: [true, true, false, true] },
  buildKit: ['wall', 'snare', 'fortify'],
  respawnMs: null,
  cards: {
    offer: ['might', 'aftershock', 'unshakable'],
    picked: null,
    owned: [{ id: 'vitality', n: 2 }],
  },
  build: { selected: 'wall', valid: true },
  claim: null,
};

const hostMsgs: HostMsg[] = [
  { t: 'team', rev: 1, team },
  { t: 'team', rev: 9, team: summaryTeam },
  { t: 'me', rev: 3, me },
  {
    t: 'me',
    rev: 4,
    me: {
      ...me,
      screen: 'claim',
      slot: null,
      color: null,
      classId: null,
      action: 'none',
      kits: 0,
      give: null,
      arc: null,
      buildKit: [],
      respawnMs: 4000,
      cards: { offer: null, picked: 'might', owned: [] },
      build: null,
      claim: [{ slot: 1, name: 'Bo', classId: 'engineer' }],
    },
  },
  { t: 'ack', seq: 7, ok: true },
  { t: 'ack', seq: 8, ok: false, reason: 'coins' },
  { t: 'outdated', proto: 2 },
];

/** Deep-copies `v` and applies `edit` to the copy (typed loosely: the point is to break it). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mutate<T>(v: T, edit: (copy: any) => void): unknown {
  const copy = structuredClone(v);
  edit(copy);
  return copy;
}

describe('protocol constants', () => {
  it('game id and version', () => {
    expect(GAME_ID).toBe('fort-frenzy');
    expect(PROTOCOL_VERSION).toBe(1);
  });
});

describe('isControllerMsg', () => {
  it.each(controllerMsgs.map((m) => [JSON.stringify(m).slice(0, 60), m]))('accepts %s', (_, m) => {
    // Survives the JSON round trip the relay applies.
    expect(isControllerMsg(JSON.parse(JSON.stringify(m)))).toBe(true);
    expect(isHostMsg(m)).toBe(false);
  });

  const bad: [string, unknown][] = [
    ['null', null],
    ['string', 'hello'],
    ['short tuple', tuple.slice(0, 11)],
    ['long tuple', [...tuple, 0]],
    ['stick out of range', mutate(tuple, (t) => (t[0] = 101))],
    ['fractional stick', mutate(tuple, (t) => (t[1] = 0.5))],
    ['flags out of range', mutate(tuple, (t) => (t[6] = 8))],
    ['negative counter', mutate(tuple, (t) => (t[8] = -1))],
    ['radial slot 4', mutate(tuple, (t) => (t[11] = 4))],
    ['string in tuple', mutate(tuple, (t) => (t[3] = '0'))],
    ['NaN in tuple', mutate(tuple, (t) => (t[2] = NaN))],
    ['unknown t', { t: 'nope' }],
    ['hello without deviceId', { t: 'hello', proto: 1 }],
    ['hello with empty deviceId', { t: 'hello', proto: 1, deviceId: '' }],
    ['hello with float proto', { t: 'hello', proto: 1.5, deviceId: 'x' }],
    ['intent without seq', { t: 'intent', intent: { k: 'give' } }],
    ['intent with negative seq', { t: 'intent', seq: -1, intent: { k: 'give' } }],
    ['unknown intent', { t: 'intent', seq: 1, intent: { k: 'fly' } }],
    ['name too long', { t: 'intent', seq: 1, intent: { k: 'name', name: 'ABCDEFGHIJK' } }],
    ['unknown class', { t: 'intent', seq: 1, intent: { k: 'class', classId: 'ranger' } }],
    ['ready not bool', { t: 'intent', seq: 1, intent: { k: 'ready', ready: 1 } }],
    ['unknown leader action', { t: 'intent', seq: 1, intent: { k: 'leader', action: 'kick' } }],
    ['bad theme', { t: 'intent', seq: 1, intent: { k: 'leader', action: 'theme', theme: 'x' } }],
    [
      'bad difficulty',
      { t: 'intent', seq: 1, intent: { k: 'leader', action: 'difficulty', difficulty: 'insane' } },
    ],
    ['remove without id', { t: 'intent', seq: 1, intent: { k: 'leader', action: 'remove' } }],
    [
      'bad end option',
      { t: 'intent', seq: 1, intent: { k: 'leader', action: 'end', option: 'x' } },
    ],
    [
      'select unknown structure',
      { t: 'intent', seq: 1, intent: { k: 'build', action: 'select', structure: 'moat' } },
    ],
    ['bad build action', { t: 'intent', seq: 1, intent: { k: 'build', action: 'rotate' } }],
    ['buy unknown item', { t: 'intent', seq: 1, intent: { k: 'buy', item: 'nuke' } }],
    ['request without on', { t: 'intent', seq: 1, intent: { k: 'request', item: 'repair' } }],
    ['unknown card', { t: 'intent', seq: 1, intent: { k: 'card', card: 'luck' } }],
    ['claim negative slot', { t: 'intent', seq: 1, intent: { k: 'claim', slot: -1 } }],
  ];
  it.each(bad)('rejects %s', (_, m) => {
    expect(isControllerMsg(m)).toBe(false);
  });
});

describe('isHostMsg', () => {
  it.each(hostMsgs.map((m) => [`${m.t} ${JSON.stringify(m).slice(0, 50)}`, m]))(
    'accepts %s',
    (_, m) => {
      expect(isHostMsg(JSON.parse(JSON.stringify(m)))).toBe(true);
      expect(isControllerMsg(m)).toBe(false);
    },
  );

  const teamMsg = hostMsgs[0]!;
  const summaryMsg = hostMsgs[1]!;
  const meMsg = hostMsgs[2]!;
  const bad: [string, unknown][] = [
    ['null', null],
    ['array', [1, 2]],
    ['unknown t', { t: 'state' }],
    ['team without rev', mutate(teamMsg, (m) => delete m.rev)],
    ['team bad phase', mutate(teamMsg, (m) => (m.team.phase = 'boss'))],
    ['team coins string', mutate(teamMsg, (m) => (m.team.coins = '5'))],
    ['team bad roster color', mutate(teamMsg, (m) => (m.team.roster[0].color = 'crimson'))],
    ['team roster missing connected', mutate(teamMsg, (m) => delete m.team.roster[1].connected)],
    ['team bad shop id', mutate(teamMsg, (m) => (m.team.shop[0].id = 'moat'))],
    ['team wishlist by number', mutate(teamMsg, (m) => (m.team.wishlist[0].by = 3))],
    ['team bad next-wave enemy', mutate(teamMsg, (m) => (m.team.nextWave.enemies[0].id = 'orc'))],
    ['team missing summary', mutate(teamMsg, (m) => delete m.team.summary)],
    ['summary bad result', mutate(summaryMsg, (m) => (m.team.summary.result = 'draw'))],
    ['summary bad award', mutate(summaryMsg, (m) => (m.team.summary.players[0].award = 'style'))],
    [
      'summary stats missing key',
      mutate(summaryMsg, (m) => delete m.team.summary.players[0].stats.kills),
    ],
    ['me bad screen', mutate(meMsg, (m) => (m.me.screen = 'shop'))],
    ['me bad action', mutate(meMsg, (m) => (m.me.action = 'jump'))],
    ['me missing kits', mutate(meMsg, (m) => delete m.me.kits)],
    ['me fractional crates', mutate(meMsg, (m) => (m.me.crates = 1.5))],
    ['me bad give', mutate(meMsg, (m) => (m.me.give = 'throw'))],
    ['me bad arc slot', mutate(meMsg, (m) => (m.me.arc.slots[0] = 'moat'))],
    ['me bad build kit', mutate(meMsg, (m) => (m.me.buildKit = ['moat']))],
    ['me bad offer card', mutate(meMsg, (m) => (m.me.cards.offer = ['luck']))],
    ['me owned without n', mutate(meMsg, (m) => delete m.me.cards.owned[0].n)],
    ['me bad claim', mutate(meMsg, (m) => (m.me.claim = [{ slot: 0, name: 'x' }]))],
    ['ack without ok', { t: 'ack', seq: 1 }],
    ['ack bad reason', { t: 'ack', seq: 1, ok: false, reason: 'nope' }],
    ['outdated without proto', { t: 'outdated' }],
  ];
  it.each(bad)('rejects %s', (_, m) => {
    expect(isHostMsg(m)).toBe(false);
  });
});
