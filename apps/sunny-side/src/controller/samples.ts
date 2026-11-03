// Sample host screens for dev mode (`?dev=1`) and the tests: every Screen variant with realistic data.
import {
  PLAYER_COLOR_IDS,
  type PlayerColorId,
  type RoundBreakdown,
  type RoundPointItem,
  type Screen,
  type ScreenKind,
  type Standing,
} from '../shared/messages';

const NAMES = ['Benedict', 'Yolko', 'Scramble', 'Poach', 'Omelette', 'Sunny', 'Shelly', 'Humpty'];

/** 10-char names for the long-list screens (spectating, results, matchEnd). */
const LONG_NAMES = [
  'Benedict_1',
  'Yolkodile2',
  'Scramble_3',
  'Poacher_04',
  'Omelette_5',
  'Sunnyside6',
  'Shellshock',
  'Humpty_Dmp',
];

/** Realistic 8-player round: KOs, a survivor, falls, a leaver (matches sampleStandings(8, true)). */
export function sampleBreakdown(): RoundBreakdown {
  const st = sampleStandings(8, true);
  const ko = (i: number, points = 1): RoundPointItem => ({
    kind: 'ko',
    victimId: st[i]!.playerId,
    victimName: st[i]!.name,
    points,
  });
  const by = (i: number) => ({ by: st[i]!.playerId, byName: st[i]!.name });
  const fell = { by: null, byName: null, ghost: false };
  const ghostKo = { by: null, byName: null, ghost: true };
  const items: RoundPointItem[][] = [
    [ko(5), ko(6), { kind: 'survivor', points: 3 }],
    [ko(2), ko(3), ko(7)],
    [],
    [],
    [],
    [],
    [],
    [],
  ];
  const outs = [null, fell, by(1), by(1), fell, by(0), ghostKo, by(1)];
  return {
    round: 2,
    players: st.map((s, i) => ({
      playerId: s.playerId,
      name: s.name,
      color: s.color,
      points: items[i]!.reduce((a, x) => a + x.points, 0),
      total: s.score,
      left: s.left,
      items: items[i]!,
      out: outs[i]!,
    })),
  };
}

export function sampleStandings(n = 5, long = false): Standing[] {
  return PLAYER_COLOR_IDS.slice(0, n).map((color, i) => ({
    playerId: `p${i}`,
    name: (long ? LONG_NAMES : NAMES)[i] ?? `Egg ${i + 1}`,
    color,
    score: Math.max(0, 9 - i * 2),
    connected: i !== 3,
    left: i === 4,
  }));
}

export function sampleScreen(kind: ScreenKind, color: PlayerColorId = 'crimson'): Screen {
  const longList = kind === 'spectating' || kind === 'results' || kind === 'matchEnd';
  const base = {
    isLeader: true,
    round: 2,
    targetScore: 11,
    name: longList ? 'Benedict_1' : 'Benedict',
    color,
    standings: longList ? sampleStandings(8, true) : sampleStandings(),
  };
  switch (kind) {
    case 'lobby':
      return { ...base, kind, takenColors: ['cobalt', 'jade'], canStart: true };
    case 'countdown':
      return { ...base, kind, ms: 3000 };
    case 'eliminated':
      return { ...base, kind, respawnMs: 4000 };
    case 'results':
      return { ...base, kind, survivorId: 'p0', breakdown: sampleBreakdown() };
    case 'matchEnd':
      return { ...base, kind, winnerId: 'p0', breakdown: sampleBreakdown() };
    case 'playing':
    case 'ghost':
    case 'spectating':
    case 'gamePaused':
    case 'left':
      return { ...base, kind };
  }
}
