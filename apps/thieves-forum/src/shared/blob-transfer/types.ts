// Blob transfer wire format (SPEC §12.6): bytes as base64 chunks through the unchanged relay, acked
// per blob. Copied from Say Cheese `src/shared/blob-transfer/types.ts` (SC0) and generalized: keyed by
// a `blobId` instead of round + photo, and used host → phone (the tip-off snapshot). No game imports:
// extraction candidate for `@pcg/net-client` (BUILD_PLAN §8).
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.

/** Max base64 chars per chunk: keeps every relay envelope safely under `RELAY_MAX_PAYLOAD`. */
export const CHUNK_B64_MAX = 12000;

/** The relay's `maxPayload` in bytes (relay SPEC §2); an oversize frame closes the socket (1009). */
export const RELAY_MAX_PAYLOAD = 16384;

/**
 * One piece of blob `blobId`: chunk `i` of `n` (0-based). `b64` is at most `CHUNK_B64_MAX` chars. A
 * blob is complete when all `n` chunks have arrived, in any order.
 */
export interface Chunk {
  t: 'chunk';
  blobId: number;
  i: number;
  n: number;
  b64: string;
}

/** Receiver → sender: every chunk of `blobId` arrived; the sender may drop its copy. */
export interface Ack {
  t: 'blobAck';
  blobId: number;
}

const isIndex = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

export function isChunk(v: unknown): v is Chunk {
  if (typeof v !== 'object' || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    m.t === 'chunk' &&
    isIndex(m.blobId) &&
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
  return m.t === 'blobAck' && isIndex(m.blobId);
}
