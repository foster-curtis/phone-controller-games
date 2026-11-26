// Match flow (SPEC §6.2, §12.3): the state machine, open-stall rule and results. Plain TS (lint).
export {
  createMatch,
  type Effect,
  type Match,
  type MatchEvent,
  type MatchOptions,
} from './match';
export { OPEN_STALLS_STREAM, openStallCount, pickOpenStalls } from './openStalls';
export { matchTotals, revealOrder, topEarners } from './results';
export { MATCH_TUNING, type MatchTuning } from './tuning';
export * from './types';
