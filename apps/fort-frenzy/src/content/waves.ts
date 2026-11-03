// Wave data (SPEC §9.3, §9.4): budget, allowed types, open lanes, guaranteed spawns. Budgets are for
// 2 players at Normal; player-count scaling and difficulty multiply them at wave start. Each wave
// guarantees the type it introduces; every pool holds the Grunt (cost 1), so the generator spends to
// within 1 of the budget. Lanes: bottom from wave 1, left from 3, right from 8 (§9.4). Waves 5, 10
// and 15 carry the Colossus (`boss`); until FF11 the boss doesn't spawn and those waves end with
// their escorts (§9.2: a light Grunt stream; Grunts and Swarms; final-phase Runners).
// Starting values for playtesting (§14): about 16 minutes of combat over 15 waves.
import type { LaneId } from '../shared/ids';
import type { WaveDef } from './types';

const ONE: LaneId[] = ['bottom'];
const TWO: LaneId[] = ['bottom', 'left'];
const THREE: LaneId[] = ['bottom', 'left', 'right'];

export const waves: WaveDef[] = [
  {
    n: 1,
    budget: 8,
    allowed: ['grunt'],
    lanes: ONE,
    guaranteed: [{ enemy: 'grunt', count: 1 }],
    durationMs: 30_000,
  },
  {
    n: 2,
    budget: 12,
    allowed: ['grunt', 'runner'],
    lanes: ONE,
    guaranteed: [{ enemy: 'runner', count: 2 }],
    durationMs: 40_000,
  },
  {
    n: 3,
    budget: 16,
    allowed: ['grunt', 'runner', 'swarm'],
    lanes: TWO,
    guaranteed: [{ enemy: 'swarm', count: 1, lane: 'left' }],
    durationMs: 45_000,
  },
  {
    n: 4,
    budget: 22,
    allowed: ['grunt', 'runner', 'swarm', 'brute'],
    lanes: TWO,
    guaranteed: [{ enemy: 'brute', count: 1 }],
    durationMs: 50_000,
  },
  {
    n: 5,
    budget: 12,
    allowed: ['grunt'],
    lanes: TWO,
    guaranteed: [],
    durationMs: 60_000,
    boss: { id: 'colossus', mk: 1 },
  },
  {
    n: 6,
    budget: 26,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer'],
    lanes: TWO,
    guaranteed: [{ enemy: 'flyer', count: 2 }],
    durationMs: 55_000,
  },
  {
    n: 7,
    budget: 30,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege'],
    lanes: TWO,
    guaranteed: [{ enemy: 'siege', count: 1 }],
    durationMs: 60_000,
  },
  {
    n: 8,
    budget: 34,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [{ enemy: 'hunter', count: 2, lane: 'right' }],
    durationMs: 65_000,
  },
  {
    n: 9,
    budget: 40,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [],
    durationMs: 70_000,
  },
  {
    n: 10,
    budget: 28,
    allowed: ['grunt', 'swarm'],
    lanes: THREE,
    guaranteed: [],
    durationMs: 75_000,
    boss: { id: 'colossus', mk: 2 },
  },
  {
    n: 11,
    budget: 46,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [],
    durationMs: 75_000,
  },
  {
    n: 12,
    budget: 58,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [
      { enemy: 'brute', count: 2 },
      { enemy: 'siege', count: 1 },
    ],
    durationMs: 80_000,
  },
  {
    n: 13,
    budget: 54,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [],
    durationMs: 80_000,
  },
  {
    n: 14,
    budget: 68,
    allowed: ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'],
    lanes: THREE,
    guaranteed: [
      { enemy: 'brute', count: 2 },
      { enemy: 'hunter', count: 2 },
      { enemy: 'siege', count: 1 },
    ],
    durationMs: 85_000,
  },
  {
    n: 15,
    budget: 34,
    allowed: ['grunt', 'runner', 'swarm'],
    lanes: THREE,
    guaranteed: [{ enemy: 'runner', count: 4 }],
    durationMs: 90_000,
    boss: { id: 'colossus', mk: 3 },
  },
];
