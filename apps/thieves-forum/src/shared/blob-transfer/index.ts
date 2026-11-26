// Blob transfer (SPEC §12.6): bytes as base64 `chunk` messages through the unchanged relay, host → one
// phone, acked per blob, resent from chunk 0 after a reconnect, stale blobs dropped. Copied from Say
// Cheese `src/shared/blob-transfer/index.ts` (SC1) and generalized: keyed by `blobId` instead of round
// + photo, and turned around (the host sends, a phone receives). No game imports: extraction candidate
// for `@pcg/net-client` (BUILD_PLAN §8).
// API frozen at TF4 (BUILD_PLAN §3): `createBlobSender` / `createBlobReceiver`, additive changes only.
import { base64ToBlob, blobToBase64, bytesToBase64 } from './base64';
import { type Ack, CHUNK_B64_MAX, type Chunk } from './types';

export * from './base64';
export * from './types';

/** Splits base64 into pieces of at most `max` chars (always at least one, even for ""). */
export function chunkBase64(b64: string, max: number = CHUNK_B64_MAX): string[] {
  if (b64.length === 0) return [''];
  const out: string[] = [];
  for (let i = 0; i < b64.length; i += max) out.push(b64.slice(i, i + max));
  return out;
}

// ---- sender (host) ----

export interface BlobSendProgress {
  /** Relay player id of the receiving phone. */
  to: string;
  blobId: number;
  /** Chunks handed to `send` in the latest pass (resets to 0 on a resend). */
  sent: number;
  n: number;
  acked: boolean;
}

export interface BlobSenderOptions {
  /** Sends one chunk to one phone (e.g. `HostClient.send(chunk, to)`, which drops while closed). */
  send(to: string, chunk: Chunk): void;
  onProgress?(p: BlobSendProgress): void;
}

export interface BlobSender {
  /**
   * Sends blob `blobId` to phone `to`. A phone has at most one blob in flight: adding a new one drops
   * the older unacked blob for that phone (stale). The data is kept until `ack`, `drop` or `forget`.
   */
  add(to: string, blobId: number, data: Blob | Uint8Array): Promise<void>;
  /** Phone `from` has every chunk: forget the blob. Acks for anything else are ignored. */
  ack(from: string, ack: Ack): void;
  /** After phone `to` reconnects (`peer rejoined`): its unacked blob again, from chunk 0. */
  resend(to: string): void;
  /** Forgets blob `blobId` (expired or replaced). */
  drop(blobId: number): void;
  /** Forgets phone `to`'s blob (the player left for good). */
  forget(to: string): void;
  /** Unacked blobs, oldest first. */
  pending(): { to: string; blobId: number }[];
  clear(): void;
}

interface Outgoing {
  to: string;
  blobId: number;
  /** null while encoding. */
  chunks: string[] | null;
}

export function createBlobSender(opts: BlobSenderOptions): BlobSender {
  const byPhone = new Map<string, Outgoing>(); // insertion order = add order

  function sendAll(o: Outgoing): void {
    const chunks = o.chunks!;
    const n = chunks.length;
    opts.onProgress?.({ to: o.to, blobId: o.blobId, sent: 0, n, acked: false });
    for (let i = 0; i < n; i++) {
      // Acked, dropped or replaced mid-pass (a synchronous ack from a test or a re-entrant callback).
      if (byPhone.get(o.to) !== o) return;
      opts.send(o.to, { t: 'chunk', blobId: o.blobId, i, n, b64: chunks[i]! });
      opts.onProgress?.({ to: o.to, blobId: o.blobId, sent: i + 1, n, acked: false });
    }
  }

  return {
    async add(to, blobId, data) {
      const o: Outgoing = { to, blobId, chunks: null };
      byPhone.delete(to); // the older blob for this phone is stale; re-adding moves it to the end
      byPhone.set(to, o);
      let b64: string;
      try {
        b64 = data instanceof Uint8Array ? bytesToBase64(data) : await blobToBase64(data);
      } catch (e) {
        if (byPhone.get(to) === o) byPhone.delete(to);
        throw e;
      }
      if (byPhone.get(to) !== o) return; // replaced or dropped while encoding
      o.chunks = chunkBase64(b64);
      sendAll(o);
    },
    ack(from, { blobId }) {
      const o = byPhone.get(from);
      if (!o || o.blobId !== blobId) return;
      byPhone.delete(from);
      const n = o.chunks?.length ?? 0;
      opts.onProgress?.({ to: from, blobId, sent: n, n, acked: true });
    },
    resend(to) {
      const o = byPhone.get(to);
      // A still-encoding blob goes out when its encode finishes.
      if (o?.chunks) sendAll(o);
    },
    drop(blobId) {
      for (const [to, o] of byPhone) if (o.blobId === blobId) byPhone.delete(to);
    },
    forget(to) {
      byPhone.delete(to);
    },
    pending() {
      return [...byPhone.values()].map(({ to, blobId }) => ({ to, blobId }));
    },
    clear() {
      byPhone.clear();
    },
  };
}

// ---- receiver (phone) ----

export interface ReceivedBlob {
  blobId: number;
  blob: Blob;
  /** Object URL for an `<img>`; revoked by `revokeAll`. */
  url: string;
  /** Decoded size in bytes. */
  bytes: number;
  chunks: number;
}

export interface BlobReceiveProgress {
  blobId: number;
  received: number;
  n: number;
}

export interface BlobReceiverOptions {
  onComplete(blob: ReceivedBlob): void;
  onProgress?(p: BlobReceiveProgress): void;
  /**
   * Acks to the host: once when a blob completes, and again when a resend of an already complete blob
   * reaches its last chunk (the first ack was lost).
   */
  sendAck?(ack: Ack): void;
  /** Default `type: image/jpeg`. */
  type?: string;
  /** Default `URL.createObjectURL` / `URL.revokeObjectURL`. */
  createUrl?(blob: Blob): string;
  revokeUrl?(url: string): void;
}

/** `stale`: a chunk of a blob that a newer one replaced, or that was dropped. */
export type ReceiveResult = 'partial' | 'complete' | 'duplicate' | 'stale';

export interface BlobReceiver {
  /**
   * Takes one chunk from the host. Any order; duplicates are ignored. The host sends one blob at a
   * time, so the first chunk of a new `blobId` makes any unfinished older blob stale.
   */
  receive(chunk: Chunk): ReceiveResult;
  /** Forgets blob `blobId` (cancelled or expired); its later chunks read as stale. */
  drop(blobId: number): void;
  /** Revokes every object URL and forgets everything. */
  revokeAll(): void;
}

interface Incoming {
  blobId: number;
  n: number;
  parts: (string | undefined)[];
  received: number;
}

/** Ids remembered as done or stale; older ones are forgotten (ids are never reused in practice). */
const REMEMBER = 64;

function remember(list: number[], id: number): void {
  if (list.includes(id)) return;
  list.push(id);
  if (list.length > REMEMBER) list.shift();
}

export function createBlobReceiver(opts: BlobReceiverOptions): BlobReceiver {
  let current: Incoming | null = null;
  const done: number[] = [];
  const dead: number[] = [];
  const urls: string[] = [];
  const createUrl = opts.createUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeUrl = opts.revokeUrl ?? ((u: string) => URL.revokeObjectURL(u));

  return {
    receive(chunk) {
      const { blobId } = chunk;
      if (done.includes(blobId)) {
        if (chunk.i === chunk.n - 1) opts.sendAck?.({ t: 'blobAck', blobId });
        return 'duplicate';
      }
      if (dead.includes(blobId)) return 'stale';
      if (!current || current.blobId !== blobId || current.n !== chunk.n) {
        if (current && current.blobId !== blobId) remember(dead, current.blobId);
        current = {
          blobId,
          n: chunk.n,
          parts: new Array<string | undefined>(chunk.n),
          received: 0,
        };
      }
      const inc = current;
      if (inc.parts[chunk.i] !== undefined) return 'duplicate';
      inc.parts[chunk.i] = chunk.b64;
      inc.received++;
      opts.onProgress?.({ blobId, received: inc.received, n: inc.n });
      if (inc.received < inc.n) return 'partial';

      current = null;
      remember(done, blobId);
      const blob = base64ToBlob(inc.parts.join(''), opts.type);
      const url = createUrl(blob);
      urls.push(url);
      opts.sendAck?.({ t: 'blobAck', blobId });
      opts.onComplete({ blobId, blob, url, bytes: blob.size, chunks: inc.n });
      return 'complete';
    },
    drop(blobId) {
      if (current?.blobId === blobId) current = null;
      if (!done.includes(blobId)) remember(dead, blobId);
    },
    revokeAll() {
      for (const u of urls) revokeUrl(u);
      urls.length = 0;
      current = null;
      done.length = 0;
      dead.length = 0;
    },
  };
}
