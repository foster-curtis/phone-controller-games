// Photo transfer (SPEC §7.4; BUILD_PLAN SC1 acceptance): chunk size, the 16 KB relay envelope,
// reassembly in any order, acks, resends and round drops.
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
  type ReceivedPhoto,
  RELAY_MAX_PAYLOAD,
} from '..';

function rand(bytes: number): Uint8Array {
  return new Uint8Array(randomBytes(bytes));
}

/** Sends `data` through a sender and returns the chunks it produced. */
async function chunksOf(data: Uint8Array, r = 1, photo = 0): Promise<Chunk[]> {
  const out: Chunk[] = [];
  const sender = createBlobSender({ send: (c) => out.push(c) });
  await sender.add(r, photo, data);
  return out;
}

function receiver() {
  const done: ReceivedPhoto[] = [];
  const acks: [string, Ack][] = [];
  let next = 0;
  const revoked: string[] = [];
  const rx = createBlobReceiver({
    onComplete: (p) => done.push(p),
    sendAck: (s, a) => acks.push([s, a]),
    createUrl: () => `blob:${next++}`,
    revokeUrl: (u) => revoked.push(u),
  });
  return { rx, done, acks, revoked };
}

async function bytesOf(p: ReceivedPhoto): Promise<Uint8Array> {
  return new Uint8Array(await p.blob.arrayBuffer());
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
  it('every chunk of a 300 KB photo stays under 16 KB with the largest field values', async () => {
    const chunks = await chunksOf(rand(300 * 1024));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.b64.length).toBeLessThanOrEqual(CHUNK_B64_MAX);
      expect(isChunk(chunk)).toBe(true);
      const worst = { ...chunk, r: 9999, photo: 14, i: 99, n: 100 };
      const bytes = new TextEncoder().encode(JSON.stringify({ t: 'send', data: worst })).length;
      expect(bytes).toBeLessThan(RELAY_MAX_PAYLOAD);
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
      const chunks = await chunksOf(data, 3, 2);
      const { rx, done, acks } = receiver();
      for (const c of order(chunks)) rx.receive('p1', c);
      expect(done).toHaveLength(1);
      expect(done[0]).toMatchObject({ sender: 'p1', r: 3, photo: 2, bytes: data.length });
      expect(await bytesOf(done[0]!)).toEqual(data);
      expect(acks[0]).toEqual(['p1', { t: 'photoAck', r: 3, photo: 2 }]);
    });
  }

  it('never completes with a chunk missing', async () => {
    const chunks = await chunksOf(rand(60_000));
    const { rx, done, acks } = receiver();
    for (const c of chunks.slice(1)) expect(rx.receive('p1', c)).toBe('partial');
    expect(done).toEqual([]);
    expect(acks).toEqual([]);
  });

  it('keeps senders and photos apart', async () => {
    const a = rand(30_000);
    const b = rand(30_000);
    const ca = await chunksOf(a, 1, 0);
    const cb = await chunksOf(b, 1, 0);
    const { rx, done } = receiver();
    for (let i = 0; i < ca.length; i++) {
      rx.receive('p1', ca[i]!);
      rx.receive('p2', cb[i]!);
    }
    expect(done.map((p) => p.sender)).toEqual(['p1', 'p2']);
    expect(await bytesOf(done[0]!)).toEqual(a);
    expect(await bytesOf(done[1]!)).toEqual(b);
  });

  it('discardFrom drops partials; a resend from chunk 0 completes', async () => {
    const data = rand(60_000);
    const chunks = await chunksOf(data);
    const { rx, done } = receiver();
    rx.receive('p1', chunks[0]!);
    rx.receive('p1', chunks[1]!);
    rx.discardFrom('p1');
    // Without the dropped chunks, the rest no longer completes...
    for (const c of chunks.slice(2)) rx.receive('p1', c);
    expect(done).toEqual([]);
    // ...but a full resend does.
    for (const c of chunks) rx.receive('p1', c);
    expect(done).toHaveLength(1);
    expect(await bytesOf(done[0]!)).toEqual(data);
  });

  it('re-acks a resent complete photo once, on its last chunk', async () => {
    const chunks = await chunksOf(rand(30_000));
    const { rx, done, acks } = receiver();
    for (const c of chunks) rx.receive('p1', c);
    for (const c of chunks) expect(rx.receive('p1', c)).toBe('duplicate');
    expect(done).toHaveLength(1);
    expect(acks).toHaveLength(2);
  });

  it('revokeAll revokes every object URL', async () => {
    const { rx, done, revoked } = receiver();
    for (const c of await chunksOf(rand(1000), 1, 0)) rx.receive('p1', c);
    for (const c of await chunksOf(rand(1000), 1, 1)) rx.receive('p1', c);
    rx.revokeAll();
    expect(revoked).toEqual(done.map((p) => p.url));
  });
});

describe('sender', () => {
  function sender() {
    const sent: Chunk[] = [];
    const s = createBlobSender({ send: (c) => sent.push(c) });
    const photos = () => sent.map((c) => `${c.r}:${c.photo}:${c.i}`);
    return { s, sent, photos };
  }

  it('sends in shot order even when a later photo encodes first', async () => {
    const { s, sent } = sender();
    let release!: () => void;
    const slow = new Blob([rand(20_000) as Uint8Array<ArrayBuffer>]);
    const gate = new Promise<void>((r) => (release = r));
    const slowBlob = { arrayBuffer: () => gate.then(() => slow.arrayBuffer()) } as Blob;
    const p0 = s.add(1, 0, slowBlob);
    const p1 = s.add(1, 1, rand(100));
    await Promise.resolve();
    expect(sent).toEqual([]);
    release();
    await Promise.all([p0, p1]);
    const order = sent.map((c) => c.photo);
    expect(order).toEqual([...order].sort());
    expect(order.at(-1)).toBe(1);
  });

  it('resendUnacked resends only unacked photos, from chunk 0', async () => {
    const { s, sent, photos } = sender();
    await s.add(1, 0, rand(24_000)); // 32,000 base64 chars = 3 chunks
    await s.add(1, 1, rand(24_000));
    await s.add(1, 2, rand(100));
    s.ack({ t: 'photoAck', r: 1, photo: 1 });
    sent.length = 0;
    s.resendUnacked();
    expect(photos()).toEqual(['1:0:0', '1:0:1', '1:0:2', '1:2:0']);
    expect(s.pending()).toEqual([
      { r: 1, photo: 0 },
      { r: 1, photo: 2 },
    ]);
  });

  it('an ack stops resends', async () => {
    const { s, sent } = sender();
    await s.add(1, 0, rand(100));
    s.ack({ t: 'photoAck', r: 1, photo: 0 });
    sent.length = 0;
    s.resendUnacked();
    expect(sent).toEqual([]);
    expect(s.pending()).toEqual([]);
  });

  it('dropRound forgets a round, including photos still encoding', async () => {
    const { s, sent } = sender();
    await s.add(1, 0, rand(100));
    const late = s.add(1, 1, new Blob([rand(100) as Uint8Array<ArrayBuffer>]));
    s.dropRound(1);
    await late;
    expect(sent.map((c) => c.photo)).toEqual([0]);
    await s.add(2, 0, rand(100));
    sent.length = 0;
    s.resendUnacked();
    expect(sent.map((c) => c.r)).toEqual([2]);
  });

  it('a failed encode rejects that photo only', async () => {
    const { s, sent } = sender();
    const bad = { arrayBuffer: () => Promise.reject(new Error('boom')) } as Blob;
    await expect(s.add(1, 0, bad)).rejects.toThrow('boom');
    await s.add(1, 1, rand(100));
    expect(sent.map((c) => c.photo)).toEqual([1]);
    expect(s.pending()).toEqual([{ r: 1, photo: 1 }]);
  });

  it('end to end: sender → receiver → ack', async () => {
    const data = rand(150_000);
    let rx!: ReturnType<typeof createBlobReceiver>;
    const done: ReceivedPhoto[] = [];
    const s = createBlobSender({ send: (c) => rx.receive('p4', c) });
    rx = createBlobReceiver({
      onComplete: (p) => done.push(p),
      sendAck: (_to, a) => s.ack(a),
      createUrl: () => 'blob:x',
    });
    await s.add(7, 0, data);
    expect(s.pending()).toEqual([]);
    expect(await bytesOf(done[0]!)).toEqual(data);
  });
});
