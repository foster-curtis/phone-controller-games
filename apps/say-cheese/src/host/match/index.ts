// Match public API for the host wiring (SPEC §8): the state machine plus the snapshot helpers.
export { createMatch, emptyState, type Match, type MatchOptions } from './match';
export { parsePersisted, restore, serialize } from './persist';
export * from './types';
