// Host-refresh snapshot (SPEC §6.3): roster, scores, turn queue and round number go to
// `sessionStorage`; photos never do. A round in progress is replayed with the same photographer.
import { isPlayerColorId, isSeatIdString } from '../../shared/messages';
import type { MatchState, PersistedMatch, Phase, Player } from './types';

const PHASES: readonly Phase[] = [
  'lobby',
  'rules',
  'pass',
  'announce',
  'scatter',
  'shoot',
  'upload',
  'review',
  'results',
  'matchEnd',
];
/** Phases with a round that hasn't scored yet: replayed after a refresh. */
const REPLAYED: readonly Phase[] = ['pass', 'announce', 'scatter', 'shoot', 'upload', 'review'];

export function serialize(s: MatchState): PersistedMatch {
  const replay = s.round && REPLAYED.includes(s.phase) ? s.round.photographer : null;
  return {
    v: 1,
    phase: s.phase,
    players: s.players.map((p) => ({ ...p })),
    leader: s.leader,
    queue: [...s.queue],
    turn: s.turn,
    turns: s.turns,
    replay,
    rulesSeen: s.rulesSeen,
    nextR: s.nextR,
    nextJoin: s.nextJoin,
    matchNo: s.matchNo,
  };
}

/**
 * Back to a `MatchState`. A replayed round goes back to the front of the queue (its turn not taken)
 * with the phase at `results`; `createMatch` then starts it again. Rules go back to the lobby.
 * Codes and photos don't survive.
 */
export function restore(d: PersistedMatch): MatchState {
  const queue = d.replay ? [d.replay, ...d.queue.filter((id) => id !== d.replay)] : [...d.queue];
  const phase: Phase = d.replay ? 'results' : d.phase === 'rules' ? 'lobby' : d.phase;
  return {
    phase,
    code: null,
    players: d.players.map((p) => ({ ...p })),
    leader: d.leader,
    queue,
    turn: d.replay ? Math.max(0, d.turn - 1) : d.turn,
    turns: d.turns,
    round: null,
    lastResult: null,
    rulesCard: 0,
    rulesSeen: d.rulesSeen,
    nextR: d.nextR,
    nextJoin: d.nextJoin,
    matchNo: d.matchNo,
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function isPlayer(v: unknown): v is Player {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return (
    isSeatIdString(p.id) &&
    isStr(p.phoneId) &&
    isNum(p.seat) &&
    isStr(p.playerKey) &&
    isStr(p.name) &&
    isPlayerColorId(p.color) &&
    isNum(p.score) &&
    isBool(p.connected) &&
    (p.camera === 'unknown' || p.camera === 'ok' || p.camera === 'denied') &&
    isBool(p.ready) &&
    isNum(p.joinIndex) &&
    isBool(p.spectator) &&
    isBool(p.left)
  );
}

/** The snapshot in `json`, or null if missing or malformed. */
export function parsePersisted(json: string | null): PersistedMatch | null {
  if (!json) return null;
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const m = v as Record<string, unknown>;
  const ok =
    m.v === 1 &&
    PHASES.includes(m.phase as Phase) &&
    Array.isArray(m.players) &&
    m.players.every(isPlayer) &&
    (m.leader === null || isStr(m.leader)) &&
    Array.isArray(m.queue) &&
    m.queue.every(isSeatIdString) &&
    isNum(m.turn) &&
    isNum(m.turns) &&
    (m.replay === null || isSeatIdString(m.replay)) &&
    isBool(m.rulesSeen) &&
    isNum(m.nextR) &&
    isNum(m.nextJoin) &&
    isNum(m.matchNo);
  return ok ? (m as unknown as PersistedMatch) : null;
}
