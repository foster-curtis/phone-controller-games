// Photo transfer wire format (SPEC §7.4): a JPEG as base64 chunks through the unchanged relay, acked
// per photo. No game imports: extraction-ready for `net-client` (BUILD_PLAN §8).
// Frozen at SC0 (BUILD_PLAN §3): additive changes only.

/** Max base64 chars per chunk: keeps every relay envelope safely under `RELAY_MAX_PAYLOAD`. */
export const CHUNK_B64_MAX = 12000;

/** The relay's `maxPayload` in bytes (relay SPEC §2); an oversize frame closes the socket (1009). */
export const RELAY_MAX_PAYLOAD = 16384;

/**
 * One piece of photo `photo` in round `r`: chunk `i` of `n` (0-based). `b64` is at most
 * `CHUNK_B64_MAX` chars. A photo is complete when all `n` chunks have arrived, in any order.
 */
export interface Chunk {
  t: 'chunk';
  r: number;
  photo: number;
  i: number;
  n: number;
  b64: string;
}

/** Host → phone: every chunk of photo `photo` in round `r` arrived; the phone may drop its copy. */
export interface Ack {
  t: 'photoAck';
  r: number;
  photo: number;
}

const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

export function isChunk(v: unknown): v is Chunk {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    m.t === 'chunk' &&
    isIndex(m.r) &&
    isIndex(m.photo) &&
    isIndex(m.i) &&
    Number.isInteger(m.n) &&
    (m.n as number) >= 1 &&
    (m.i as number) < (m.n as number) &&
    typeof m.b64 === 'string' &&
    m.b64.length <= CHUNK_B64_MAX
  );
}

export function isAck(v: unknown): v is Ack {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return m.t === 'photoAck' && isIndex(m.r) && isIndex(m.photo);
}
