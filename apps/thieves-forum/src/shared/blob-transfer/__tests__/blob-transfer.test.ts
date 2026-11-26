// Blob transfer (SPEC §12.6; BUILD_PLAN TF4 acceptance): chunk size, the 16 KB relay envelope with max
// field values, reassembly in any order, a missing chunk never completing, acks, resends and stale ids.
// Adapted from Say Cheese's `blob-transfer.test.ts` (SC1).
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  type Ack,
  base64ToBytes,
  blobToBase64,
  bytesToBase64,
  CHUNK_B64_MAX,
  type Chunk,
  chunkBase64,
  createBlobReceiver,
  createBlobSender,
  isChunk,
  type ReceivedBlob,
  RELAY_MAX_PAYLOAD,
} from '..';

function rand(bytes: number): Uint8Array {
  return new Uint8Array(randomBytes(bytes));
}

/** Sends `data` to phone `to` and returns the chunks it produced. */
async function chunksOf(data: Uint8Array, blobId = 1, to = 'p1'): Promise<Chunk[]> {
  const out: Chunk[] = [];
  const sender = createBlobSender({ send: (_to, c) => out.push(c) });
  await sender.add(to, blobId, data);
  return out;
}

function receiver() {
  const done: ReceivedBlob[] = [];
  const acks: Ack[] = [];
  let next = 0;
  const revoked: string[] = [];
  const rx = createBlobReceiver({
    onComplete: (b) => done.push(b),
    sendAck: (a) => acks.push(a),
    createUrl: () => `blob:${next++}`,
    revokeUrl: (u) => revoked.push(u),
  });
  return { rx, done, acks, revoked };
}

async function bytesOf(b: ReceivedBlob): Promise<Uint8Array> {
  return new Uint8Array(await b.blob.arrayBuffer());
}

function shuffle<T>(a: T[], seed = 7): T[] {
  const out = [...a];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const utf8 = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

describe('base64', () => {
  it('round-trips bytes of every length mod 3, and matches Node', async () => {
    for (const len of [0, 1, 2, 3, 24575, 24576, 24577, 100_000]) {
      const data = rand(len);
      const b64 = bytesToBase64(data);
      expect(b64).toBe(Buffer.from(data).toString('base64'));
      expect(base64ToBytes(b64)).toEqual(data);
      expect(await blobToBase64(new Blob([data as Uint8Array<ArrayBuffer>]))).toBe(b64);
    }
  });
});

describe('chunkBase64', () => {
  it('caps every piece at CHUNK_B64_MAX and loses nothing', () => {
    const b64 = bytesToBase64(rand(50_000));
    const parts = chunkBase64(b64);
    expect(parts.every((p) => p.length <= CHUNK_B64_MAX)).toBe(true);
    expect(parts.join('')).toBe(b64);
    expect(chunkBase64('')).toEqual(['']);
  });
});

describe('relay envelope', () => {
  it('every chunk of a 300 KB blob stays under 16 KB with the largest field values', async () => {
    const chunks = await chunksOf(rand(300 * 1024));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.b64.length).toBeLessThanOrEqual(CHUNK_B64_MAX);
      expect(isChunk(chunk)).toBe(true);
      const worst = { ...chunk, blobId: Number.MAX_SAFE_INTEGER, i: 9999, n: 10000 };
      // Host → relay, and relay → phone (relay SPEC §3).
      expect(utf8({ t: 'send', to: 'p9999', data: worst })).toBeLessThan(RELAY_MAX_PAYLOAD);
      expect(utf8({ t: 'msg', from: 'host', data: worst })).toBeLessThan(RELAY_MAX_PAYLOAD);
    }
  });
});

describe('reassembly', () => {
  const orders: [string, (c: Chunk[]) => Chunk[]][] = [
    ['in order', (c) => c],
    ['reversed', (c) => [...c].reverse()],
    ['shuffled', (c) => shuffle(c)],
    ['with duplicates', (c) => shuffle([...c, ...c.slice(0, 3), c[c.length - 1]!])],
  ];
  for (const [name, order] of orders) {
    it(`is byte-identical ${name}`, async () => {
      const data = rand(80_000);
      const chunks = await chunksOf(data, 42);
      const { rx, done, acks } = receiver();
      for (const c of order(chunks)) rx.receive(c);
      expect(done).toHaveLength(1);
      expect(done[0]).toMatchObject({ blobId: 42, bytes: data.length, chunks: chunks.length });
      expect(await bytesOf(done[0]!)).toEqual(data);
      // A duplicate last chunk after completion re-acks (the first ack may have been lost).
      expect(acks.length).toBeGreaterThanOrEqual(1);
      expect(acks.every((a) => a.t === 'blobAck' && a.blobId === 42)).toBe(true);
    });
  }

  it('never completes with a chunk missing', async () => {
    const chunks = await chunksOf(rand(60_000));
    for (const missing of [0, 2, chunks.length - 1]) {
      const { rx, done, acks } = receiver();
      const rest = chunks.filter((_, i) => i !== missing);
      for (const c of shuffle([...rest, ...rest])) expect(rx.receive(c)).not.toBe('complete');
      expect(done).toHaveLength(0);
      expect(acks).toHaveLength(0);
    }
  });

  it('re-acks a complete blob when a resend reaches its last chunk', async () => {
    const chunks = await chunksOf(rand(30_000), 5);
    const { rx, done, acks } = receiver();
    for (const c of chunks) rx.receive(c);
    for (const c of chunks) expect(rx.receive(c)).toBe('duplicate');
    expect(done).toHaveLength(1);
    expect(acks).toEqual([
      { t: 'blobAck', blobId: 5 },
      { t: 'blobAck', blobId: 5 },
    ]);
  });
});

describe('stale ids', () => {
  it('a newer blob makes an unfinished older one stale', async () => {
    const old = await chunksOf(rand(40_000), 1);
    const next = await chunksOf(rand(40_000), 2);
    const { rx, done } = receiver();
    rx.receive(old[0]!);
    for (const c of next) rx.receive(c);
    for (const c of old) expect(rx.receive(c)).toBe('stale');
    expect(done.map((d) => d.blobId)).toEqual([2]);
  });

  it('drop forgets a partial blob and ignores its later chunks', async () => {
    const chunks = await chunksOf(rand(40_000), 9);
    const { rx, done } = receiver();
    rx.receive(chunks[0]!);
    rx.drop(9);
    for (const c of chunks) expect(rx.receive(c)).toBe('stale');
    expect(done).toHaveLength(0);
  });

  it('revokeAll revokes every object URL', async () => {
    const { rx, revoked } = receiver();
    for (const id of [1, 2]) for (const c of await chunksOf(rand(100), id)) rx.receive(c);
    rx.revokeAll();
    expect(revoked).toEqual(['blob:0', 'blob:1']);
  });
});

describe('sender', () => {
  it('sends only to its phone, keeps the blob until acked, resends from chunk 0', async () => {
    const sent: [string, Chunk][] = [];
    const tx = createBlobSender({ send: (to, c) => sent.push([to, c]) });
    await tx.add('p2', 7, rand(30_000));
    const n = sent.length;
    expect(n).toBe(Math.ceil((Math.ceil(30_000 / 3) * 4) / CHUNK_B64_MAX));
    expect(sent.every(([to]) => to === 'p2')).toBe(true);
    expect(tx.pending()).toEqual([{ to: 'p2', blobId: 7 }]);

    tx.resend('p2');
    expect(sent.slice(n).map(([, c]) => c.i)).toEqual([...Array(n).keys()]);

    tx.ack('p1', { t: 'blobAck', blobId: 7 }); // wrong phone
    tx.ack('p2', { t: 'blobAck', blobId: 6 }); // wrong blob
    expect(tx.pending()).toHaveLength(1);
    tx.ack('p2', { t: 'blobAck', blobId: 7 });
    expect(tx.pending()).toEqual([]);
    tx.resend('p2');
    expect(sent).toHaveLength(2 * n);
  });

  it('a new blob for the same phone replaces the old one, even mid-encode', async () => {
    const sent: Chunk[] = [];
    const tx = createBlobSender({ send: (_to, c) => sent.push(c) });
    const first = tx.add('p1', 1, new Blob([rand(20_000) as Uint8Array<ArrayBuffer>]));
    const second = tx.add('p1', 2, rand(20_000));
    await Promise.all([first, second]);
    expect(new Set(sent.map((c) => c.blobId))).toEqual(new Set([2]));
    expect(tx.pending()).toEqual([{ to: 'p1', blobId: 2 }]);
  });

  it('keeps one blob per phone; drop and forget remove them', async () => {
    const tx = createBlobSender({ send: () => undefined });
    await tx.add('p1', 1, rand(10));
    await tx.add('p2', 2, rand(10));
    expect(tx.pending()).toEqual([
      { to: 'p1', blobId: 1 },
      { to: 'p2', blobId: 2 },
    ]);
    tx.drop(1);
    tx.forget('p2');
    expect(tx.pending()).toEqual([]);
  });

  it('end to end: a lost chunk heals with a resend after reconnect', async () => {
    const data = rand(70_000);
    const { rx, done, acks } = receiver();
    let online = true;
    let dropped = false;
    const tx = createBlobSender({
      send: (_to, c) => {
        if (!online) return;
        if (c.i === 1 && !dropped) {
          dropped = true;
          return; // lost in the socket drop
        }
        rx.receive(c);
      },
    });
    await tx.add('p1', 3, data);
    expect(done).toHaveLength(0);
    online = true;
    tx.resend('p1');
    expect(done).toHaveLength(1);
    expect(await bytesOf(done[0]!)).toEqual(data);
    for (const a of acks) tx.ack('p1', a);
    expect(tx.pending()).toEqual([]);
  });
});
