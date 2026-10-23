// Host-refresh restore (Build decisions): roster / scores / leader / round in sessionStorage.
import { isPlayerColorId, type PlayerColorId } from '../../shared/messages';
import { STORAGE_KEY } from './config';
import type { StorageLike } from './types';

export interface PersistedPlayer {
  playerId: string;
  playerKey: string;
  name: string;
  color: PlayerColorId | null;
  score: number;
  left: boolean;
  joinIndex: number;
}

export interface PersistedMatch {
  v: 1;
  round: number;
  targetScore: number;
  /** By player key: ids can change across a late rejoin. */
  leaderKey: string | null;
  winnerKey: string | null;
  nextJoinIndex: number;
  players: PersistedPlayer[];
}

/** Writes if changed since the last write; returns the serialized form. Storage errors are swallowed. */
export function savePersisted(storage: StorageLike, data: PersistedMatch, prev = ''): string {
  const json = JSON.stringify(data);
  if (json === prev) return prev;
  try {
    storage.setItem(STORAGE_KEY, json);
  } catch {
    // Quota / private mode: restore just won't be available.
  }
  return json;
}

export function clearPersisted(storage: StorageLike): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || isStr(v);

function isPlayer(v: unknown): v is PersistedPlayer {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    isStr(p.playerId) &&
    isStr(p.playerKey) &&
    isStr(p.name) &&
    (p.color === null || isPlayerColorId(p.color)) &&
    isNum(p.score) &&
    typeof p.left === 'boolean' &&
    isNum(p.joinIndex)
  );
}

/** The saved match, or null if missing / unreadable / malformed. */
export function loadPersisted(storage: StorageLike): PersistedMatch | null {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const m = v as Record<string, unknown>;
  if (
    m.v !== 1 ||
    !isNum(m.round) ||
    !isNum(m.targetScore) ||
    !isStrOrNull(m.leaderKey) ||
    !isStrOrNull(m.winnerKey) ||
    !isNum(m.nextJoinIndex) ||
    !Array.isArray(m.players) ||
    !m.players.every(isPlayer)
  ) {
    return null;
  }
  return m as unknown as PersistedMatch;
}
