// Sample `TvView`s for the dev page (`index.html?ui=<screen>`, BUILD_PLAN FF5) and tests. Names and
// numbers follow review/ui-reference/tv/.
import { qrMatrix } from '@pcg/game-kit';
import type { PlayerColorId } from '../../shared/ids';
import type { RunStats, TeamRosterEntry, TeamView } from '../../shared/messages';
import type { TvView } from './types';

export const UI_SCREENS = [
  'loading',
  'home',
  'lobby',
  'countdown',
  'combat',
  'low-hp',
  'boss',
  'build',
  'victory',
  'defeat',
  'summary',
  'restoring',
  'outdated',
] as const;
export type UiScreenName = (typeof UI_SCREENS)[number];

const roster: TeamRosterEntry[] = [
  {
    playerId: 'p1',
    name: 'Foster',
    color: 'cobalt',
    classId: 'engineer',
    ready: true,
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
    ready: false,
    connected: true,
  },
];

const stats = (over: Partial<RunStats>): RunStats => ({
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
});

const team = (over: Partial<TeamView> = {}): TeamView => ({
  phase: 'combat',
  wave: 10,
  buildEndsInMs: null,
  coins: 1240,
  baseHp: 640,
  baseMaxHp: 1000,
  theme: 'neon-knights',
  difficulty: 'normal',
  leaderId: 'p1',
  roster,
  shop: [],
  wishlist: [],
  nextWave: null,
  summary: null,
  ...over,
});

const who = (i: number) => {
  const p = roster[i]!;
  return { playerId: p.playerId, name: p.name, color: p.color as PlayerColorId };
};

const base = (over: Partial<TvView>): TvView => ({
  screen: 'combat',
  team: null,
  home: null,
  room: null,
  countdownMs: null,
  bossBar: null,
  announcements: [],
  laneWarnings: [],
  lowHpAlarm: false,
  wishlist: [],
  readyStatus: [],
  nextWaveNew: [],
  outdatedBanner: false,
  ...over,
});

const joinUrl = 'https://fort-frenzy.fostercurtis.dev/play?code=KQZT';
const room = () => ({ code: 'KQZT', joinUrl, qr: qrMatrix(joinUrl) });

const combat = (over: Partial<TvView> = {}): TvView =>
  base({
    screen: 'combat',
    team: team(),
    announcements: [
      { ...who(0), id: 1, item: 'arrow_rate', tier: 2 },
      { ...who(2), id: 2, item: 'repair', tier: 1 },
    ],
    laneWarnings: ['right', 'bottom'],
    ...over,
  });

const summary = (result: 'victory' | 'defeat'): TvView => {
  const w = result === 'victory';
  return base({
    screen: result,
    team: team({
      phase: 'summary',
      wave: w ? 15 : 9,
      baseHp: w ? 400 : 0,
      summary: {
        result,
        wavesSurvived: w ? 15 : 8,
        durationMs: w ? 24 * 60_000 + 12_000 : 13 * 60_000 + 40_000,
        players: [
          { ...who(0), classId: 'engineer', stats: stats({ kills: 212 }), award: 'kills' },
          {
            ...who(1),
            classId: 'warden',
            stats: stats({ damageDealt: 41230 }),
            award: 'damageDealt',
          },
          {
            ...who(2),
            classId: 'quartermaster',
            stats: stats({ cratesDelivered: 38 }),
            award: 'cratesDelivered',
          },
          {
            ...who(3),
            classId: 'commander',
            stats: stats({ structuresBuilt: 17 }),
            award: 'structuresBuilt',
          },
        ],
      },
    }),
  });
};

/** A fresh sample view; the dev page mutates the home one as intents arrive. */
export function sampleView(name: UiScreenName): TvView {
  switch (name) {
    case 'loading':
      return base({ screen: 'loading', home: { rows: [], focus: 0, loading: 0.4 } });
    case 'home':
      return base({
        screen: 'home',
        home: {
          focus: 0,
          loading: 0.7,
          rows: [
            { id: 'create' },
            { id: 'theme', theme: 'neon-knights' },
            { id: 'difficulty', difficulty: 'normal' },
            { id: 'resume', wave: 7, savedAgoMs: 3 * 60_000 },
            { id: 'newRun' },
          ],
        },
      });
    case 'lobby':
      return base({
        screen: 'lobby',
        team: team({
          phase: 'lobby',
          roster: roster.map((p, i) =>
            i === 3 ? { ...p, connected: false } : i === 2 ? { ...p, classId: null } : p,
          ),
        }),
        room: room(),
      });
    case 'countdown':
      return base({
        screen: 'countdown',
        team: team({ phase: 'countdown', roster: roster.map((p) => ({ ...p, ready: true })) }),
        room: room(),
        countdownMs: 2100,
      });
    case 'combat':
      return combat();
    case 'low-hp':
      return combat({
        team: team({ baseHp: 190 }),
        lowHpAlarm: true,
        laneWarnings: [],
      });
    case 'boss':
      return combat({
        team: team({ wave: 10 }),
        laneWarnings: ['bottom'],
        bossBar: { enemy: 'colossus', hp: 14200, maxHp: 24000, mk: 2, staggered: false },
      });
    case 'build':
      return base({
        screen: 'build',
        team: team({
          phase: 'build',
          wave: 8,
          buildEndsInMs: 37_400,
          nextWave: {
            boss: false,
            enemies: [
              { id: 'hunter', count: 4 },
              { id: 'grunt', count: 12 },
              { id: 'swarm', count: 6 },
              { id: 'flyer', count: 3 },
            ],
          },
        }),
        nextWaveNew: ['hunter'],
        readyStatus: roster.map((p, i) => ({
          playerId: p.playerId,
          name: p.name,
          color: p.color,
          ready: i === 1 || i === 2,
          connected: true,
        })),
        wishlist: [
          { item: 'repair', tier: 1, price: 150, by: [who(2)] },
          { item: 'spiked_walls', tier: 1, price: 400, by: [who(0), who(1)] },
          { item: 'archer_range', tier: 1, price: 300, by: [who(1)] },
        ],
        announcements: [{ ...who(0), id: 3, item: 'wall_hp', tier: 2 }],
        laneWarnings: [],
      });
    case 'victory':
      return summary('victory');
    case 'defeat':
    case 'summary':
      return name === 'summary' ? { ...summary('victory'), screen: 'summary' } : summary('defeat');
    case 'restoring':
      return base({ screen: 'restoring' });
    case 'outdated':
      return { ...combat(), outdatedBanner: true };
  }
}
