// Photo transfer (SPEC §7.4, §10 #3): a JPEG as base64 `chunk` messages through the unchanged relay,
// acked per photo, resent from chunk 0 after a reconnect. No game imports: extraction-ready for
// `net-client` (`sendBlob`/`onBlob`, BUILD_PLAN §8). API frozen at SC1: additive changes only.
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

const keyOf = (r: number, photo: number) => `${r}:${photo}`;

// ---- sender (phone) ----

export interface SendProgress {
  r: number;
  photo: number;
  /** Chunks handed to `send` in the latest pass (resets to 0 on a resend). */
  sent: number;
  n: number;
  acked: boolean;
}

export interface BlobSenderOptions {
  /** Sends one chunk to the host (e.g. `ControllerClient.send`, which drops while not open). */
  send(chunk: Chunk): void;
  onProgress?(p: SendProgress): void;
}

export interface BlobSender {
  /**
   * Queues photo `photo` of round `r`. Photos go out in the order they were added, even though
   * encoding is async. The data is kept until `ack`, `dropRound` or `clear`.
   */
  add(r: number, photo: number, data: Blob | Uint8Array): Promise<void>;
  /** The host has every chunk: forget the photo. */
  ack(ack: Ack): void;
  /** After a reconnect: every unacked photo again, from chunk 0, in shot order. */
  resendUnacked(): void;
  /** Forgets round `r` (cancelled or replaced). */
  dropRound(r: number): void;
  /** Unacked photos, in shot order. */
  pending(): { r: number; photo: number }[];
  clear(): void;
}

interface Outgoing {
  r: number;
  photo: number;
  /** null while encoding. */
  chunks: string[] | null;
}

export function createBlobSender(opts: BlobSenderOptions): BlobSender {
  const queue = new Map<string, Outgoing>(); // insertion order = shot order
  let chain: Promise<void> = Promise.resolve();

  function sendAll(o: Outgoing): void {
    const chunks = o.chunks!;
    const n = chunks.length;
    opts.onProgress?.({ r: o.r, photo: o.photo, sent: 0, n, acked: false });
    for (let i = 0; i < n; i++) {
      // Acked or dropped mid-pass (a synchronous ack from a test or a re-entrant callback).
      if (queue.get(keyOf(o.r, o.photo)) !== o) return;
      opts.send({ t: 'chunk', r: o.r, photo: o.photo, i, n, b64: chunks[i]! });
      opts.onProgress?.({ r: o.r, photo: o.photo, sent: i + 1, n, acked: false });
    }
  }

  return {
    add(r, photo, data) {
      const o: Outgoing = { r, photo, chunks: null };
      const key = keyOf(r, photo);
      queue.delete(key); // a re-add moves it to the end
      queue.set(key, o);
      const encoded =
        data instanceof Uint8Array ? Promise.resolve(bytesToBase64(data)) : blobToBase64(data);
      // Encode in parallel, send in order.
      const step = chain.then(async () => {
        let b64: string;
        try {
          b64 = await encoded;
        } catch (e) {
          if (queue.get(key) === o) queue.delete(key);
          throw e;
        }
        if (queue.get(key) !== o) return;
        o.chunks = chunkBase64(b64);
        sendAll(o);
      });
      // One failed encode must not stall the photos behind it.
      chain = step.catch(() => undefined);
      return step;
    },
    ack({ r, photo }) {
      const key = keyOf(r, photo);
      const o = queue.get(key);
      if (!o) return;
      queue.delete(key);
      opts.onProgress?.({
        r,
        photo,
        sent: o.chunks?.length ?? 0,
        n: o.chunks?.length ?? 0,
        acked: true,
      });
    },
    resendUnacked() {
      // Still-encoding photos go out when their encode finishes.
      for (const o of [...queue.values()]) if (o.chunks) sendAll(o);
    },
    dropRound(r) {
      for (const [key, o] of queue) if (o.r === r) queue.delete(key);
    },
    pending() {
      return [...queue.values()].map(({ r, photo }) => ({ r, photo }));
    },
    clear() {
      queue.clear();
    },
  };
}

// ---- receiver (host) ----

export interface ReceivedPhoto {
  sender: string;
  r: number;
  photo: number;
  blob: Blob;
  /** Object URL for an `<img>`; revoked by `revokeAll`. */
  url: string;
  /** JPEG size in bytes. */
  bytes: number;
  chunks: number;
}

export interface ReceiveProgress {
  sender: string;
  r: number;
  photo: number;
  received: number;
  n: number;
}

export interface BlobReceiverOptions {
  onComplete(photo: ReceivedPhoto): void;
  onProgress?(p: ReceiveProgress): void;
  /**
   * Acks to `sender`: once when a photo completes, and again when a resend of an already complete
   * photo reaches its last chunk (the first ack was lost).
   */
  sendAck?(sender: string, ack: Ack): void;
  /** Default `type: image/jpeg`. */
  type?: string;
  /** Default `URL.createObjectURL` / `URL.revokeObjectURL`. */
  createUrl?(blob: Blob): string;
  revokeUrl?(url: string): void;
}

export type ReceiveResult = 'partial' | 'complete' | 'duplicate';

export interface BlobReceiver {
  /** Takes one chunk from `sender` (relay player id). Any order; duplicates are ignored. */
  receive(sender: string, chunk: Chunk): ReceiveResult;
  /** Drops `sender`'s partial photos (on `peer left`: the phone resends from chunk 0). */
  discardFrom(sender: string): void;
  /** Revokes every object URL and forgets everything (match end, SPEC §10 #9). */
  revokeAll(): void;
}

interface Incoming {
  n: number;
  parts: (string | undefined)[];
  received: number;
}

export function createBlobReceiver(opts: BlobReceiverOptions): BlobReceiver {
  const partial = new Map<string, Incoming>();
  const done = new Set<string>();
  const urls: string[] = [];
  const createUrl = opts.createUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeUrl = opts.revokeUrl ?? ((u: string) => URL.revokeObjectURL(u));
  // Relay ids never contain "|", so the key can't collide.
  const keyFor = (sender: string, c: { r: number; photo: number }) =>
    `${sender}|${keyOf(c.r, c.photo)}`;

  return {
    receive(sender, chunk) {
      const key = keyFor(sender, chunk);
      const ack: Ack = { t: 'photoAck', r: chunk.r, photo: chunk.photo };
      if (done.has(key)) {
        if (chunk.i === chunk.n - 1) opts.sendAck?.(sender, ack);
        return 'duplicate';
      }
      let inc = partial.get(key);
      if (!inc || inc.n !== chunk.n) {
        inc = { n: chunk.n, parts: new Array<string | undefined>(chunk.n), received: 0 };
        partial.set(key, inc);
      }
      if (inc.parts[chunk.i] !== undefined) return 'duplicate';
      inc.parts[chunk.i] = chunk.b64;
      inc.received++;
      opts.onProgress?.({
        sender,
        r: chunk.r,
        photo: chunk.photo,
        received: inc.received,
        n: inc.n,
      });
      if (inc.received < inc.n) return 'partial';

      partial.delete(key);
      done.add(key);
      const blob = base64ToBlob(inc.parts.join(''), opts.type);
      const url = createUrl(blob);
      urls.push(url);
      opts.sendAck?.(sender, ack);
      opts.onComplete({
        sender,
        r: chunk.r,
        photo: chunk.photo,
        blob,
        url,
        bytes: blob.size,
        chunks: inc.n,
      });
      return 'complete';
    },
    discardFrom(sender) {
      for (const key of [...partial.keys()]) if (key.startsWith(`${sender}|`)) partial.delete(key);
    },
    revokeAll() {
      for (const u of urls) revokeUrl(u);
      urls.length = 0;
      partial.clear();
      done.clear();
    },
  };
}
