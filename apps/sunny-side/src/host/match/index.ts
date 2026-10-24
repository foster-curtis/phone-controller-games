// Match flow public entry (M6 imports from here). `types.ts` holds the frozen contract.
export { createMatch } from './flow';
export { STEP_MS } from './config';
export type {
  HostAction,
  RemovePlayerAction,
  Match,
  MatchDeps,
  MatchEvent,
  MatchPhase,
  MatchView,
  PlayerView,
  RelayPeer,
  StorageLike,
} from './types';
