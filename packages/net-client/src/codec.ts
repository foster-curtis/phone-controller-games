// Wire encoding (relay SPEC §3: JSON for all messages in v1). Kept in one place so inputs can
// move to a binary encoding later as a contained change.
import type { ClientToRelay, RelayToClient } from './protocol';

export type DecodeResult = { ok: true; msg: RelayToClient } | { ok: false; error: string };

export function encode(msg: ClientToRelay): string {
  return JSON.stringify(msg);
}

/** Required string fields per relay → client message type. */
const REQUIRED_STRINGS: Record<RelayToClient['t'], readonly string[]> = {
  created: ['code', 'hostToken'],
  reclaimed: ['code'],
  joined: ['playerId', 'token'],
  peer: ['event', 'playerId', 'playerKey'],
  msg: ['from'],
  host: ['status'],
  kicked: [],
  error: ['code'],
};

/** Never throws: malformed input yields `{ ok: false }`. */
export function decode(raw: unknown): DecodeResult {
  if (typeof raw !== 'string') return { ok: false, error: 'non-text frame' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid JSON' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, error: 'not an object' };
  }
  const obj = value as Record<string, unknown>;
  const t = obj.t;
  if (typeof t !== 'string' || !Object.hasOwn(REQUIRED_STRINGS, t)) {
    return { ok: false, error: `unknown message type: ${String(t)}` };
  }
  for (const field of REQUIRED_STRINGS[t as RelayToClient['t']]) {
    if (typeof obj[field] !== 'string') return { ok: false, error: `${t}: missing ${field}` };
  }
  if (t === 'reclaimed' && !Array.isArray(obj.roster)) {
    return { ok: false, error: 'reclaimed: missing roster' };
  }
  return { ok: true, msg: obj as RelayToClient };
}
