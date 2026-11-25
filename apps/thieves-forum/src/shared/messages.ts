// Game messages between phones and the host (SPEC §2, §6.18), carried in relay `send.data`.
// Setup shell: only the lobby join. The build plan freezes this file (additive changes only from
// then on) and adds the input-state and discrete-event messages.
import { maxPlayers, minPlayers } from '../../game.meta';

/** Relay namespace, game ID "thieves-forum" (SPEC §4). */
export const GAME_ID = 'thieves-forum';

/** Player cap and Start minimum (SPEC §6.1); the values live in game.meta.ts. */
export const MAX_PLAYERS = maxPlayers;
export const MIN_PLAYERS = minPlayers;
/** Name length cap. */
export const NAME_MAX = 12;

// ---- phone → host ----

/** The name step (SPEC §6.18): sent on Join and again after every reconnect. */
export type PhoneMsg = { t: 'join'; name: string };

// ---- host → phone ----

/** The host took the name (trimmed and capped). */
export type HostMsg = { t: 'joined'; name: string };

/** Trims, collapses whitespace and caps at NAME_MAX; '' when nothing is left. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function isPhoneMsg(v: unknown): v is PhoneMsg {
  return isObj(v) && v.t === 'join' && typeof v.name === 'string';
}

export function isHostMsg(v: unknown): v is HostMsg {
  return isObj(v) && v.t === 'joined' && typeof v.name === 'string';
}
