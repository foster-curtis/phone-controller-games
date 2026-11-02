// Wave data (SPEC §9.3, §9.4): budget, allowed types, open lanes, guaranteed spawns. Budgets are for
// 2 players at Normal; player-count scaling and difficulty multiply them at wave start.
// FF6: waves 1–2 with Grunts only (Runners join wave 2 with FF10's roster).
import type { WaveDef } from './types';

export const waves: WaveDef[] = [
  {
    n: 1,
    budget: 8,
    allowed: ['grunt'],
    lanes: ['bottom'],
    guaranteed: [{ enemy: 'grunt', count: 1 }],
    durationMs: 30_000,
  },
  {
    n: 2,
    budget: 12,
    allowed: ['grunt'],
    lanes: ['bottom'],
    guaranteed: [{ enemy: 'grunt', count: 1 }],
    durationMs: 40_000,
  },
];
