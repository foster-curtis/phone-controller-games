// `?spike=tipoff` host spike (SPEC §6.13, §12.6; BUILD_PLAN TF4, risk 3): a 2D canvas test scene with 30
// moving characters, the room code and a QR to `/play?spike=tipoff&code=…`. A phone's `tipOpen` snapshots
// the canvas (960 long edge, or `?edge=800` for a slow relay), sends `tipSnapshot` (header + hit areas,
// the phone's own character left out) and the JPEG by blob transfer; the TV logs each send. The real
// modules TF14 uses, measured against whatever relay `VITE_RELAY_URL` points at.
// Frozen at TF0 (BUILD_PLAN §3): the `mount(root)` signature.
import { debugEnabled, installDebug, relayUrl } from '@pcg/game-kit';
import { createHostClient } from '@pcg/net-client';
import { balance } from '../../content/balance';
import { createBlobSender } from '../../shared/blob-transfer';
import { GAME_ID, isPhoneMsg, MAX_PLAYERS, type HostMsg } from '../../shared/messages';
import { encodeSnapshot, SNAPSHOT_LONG_EDGE } from '../../shared/viewer/encode';
import { qrSvg } from '../ui/dom';
import { createSpikeScene } from './scene';
import './spike.css';

/** One snapshot the TV sent, for the log and e2e. */
export interface SpikeSend {
  to: string;
  blobId: number;
  bytes: number;
  w: number;
  h: number;
  quality: number;
  hits: number;
  /** The phone's own character (left out of `hits`). */
  own: number;
  encodeMs: number;
  /** Chunks sent / acked. */
  chunks: number;
  acked: boolean;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mount(root: HTMLElement): void {
  root.dataset.mode = 'spike-tipoff';
  const params = new URLSearchParams(location.search);
  const edge = Number(params.get('edge')) || SNAPSHOT_LONG_EDGE;

  const stage = h('div', 'spike-stage');
  root.append(stage);
  const scene = createSpikeScene(stage);

  const panel = h('aside', 'spike-panel');
  const qr = h('div', 'spike-qr');
  const code = h('div', 'code');
  code.dataset.role = 'room-code';
  code.textContent = '····';
  const log = h('ol', 'caption spike-log');
  log.dataset.role = 'log';
  panel.append(h('p', 'label', 'Tip-off spike · scan to join'), qr, code, log);
  root.append(panel);

  const client = createHostClient({
    url: relayUrl(import.meta.env.VITE_RELAY_URL),
    game: GAME_ID,
    maxPlayers: MAX_PLAYERS,
  });
  const sends: SpikeSend[] = [];
  const phones: string[] = []; // join order → own character id (index + 1)
  // Ids from the clock so a TV reload never reuses one a phone already holds.
  let nextBlobId = Date.now();

  const line = (s: SpikeSend) =>
    `${s.to} #${s.blobId % 1000} · ${(s.bytes / 1024).toFixed(1)} KB · q${s.quality} · ` +
    `${s.chunks} chunks · enc ${s.encodeMs} ms${s.acked ? ' · acked' : ''}`;
  const renderLog = () => log.replaceChildren(...sends.slice(-8).map((s) => h('li', '', line(s))));

  const sender = createBlobSender({
    send: (to, chunk) => client.send(chunk satisfies HostMsg, to),
    onProgress: (p) => {
      const s = sends.find((x) => x.to === p.to && x.blobId === p.blobId);
      if (!s) return;
      s.chunks = p.n;
      if (p.acked) s.acked = true;
      renderLog();
    },
  });

  async function snapshotFor(to: string): Promise<void> {
    if (!phones.includes(to)) phones.push(to);
    const own = phones.indexOf(to) + 1;
    const t0 = performance.now();
    const shot = await encodeSnapshot(scene.canvas, edge, {
      boxes: scene.boxes(),
      exclude: own,
      quality: balance.tip.jpegQuality,
    });
    const blobId = nextBlobId++;
    const s: SpikeSend = {
      to,
      blobId,
      bytes: shot.blob.size,
      w: shot.w,
      h: shot.h,
      quality: shot.quality,
      hits: shot.hits.length,
      own,
      encodeMs: Math.round(performance.now() - t0),
      chunks: 0,
      acked: false,
    };
    sends.push(s);
    const header: HostMsg = {
      t: 'tipSnapshot',
      snapshot: { id: blobId, w: shot.w, h: shot.h, mime: shot.mime, bytes: shot.blob.size },
      hits: shot.hits,
      fee: balance.tip.fee,
      endsInMs: balance.tip.snapshotTtlMs,
    };
    client.send(header, to);
    await sender.add(to, blobId, shot.blob);
    renderLog();
  }

  client.onMessage((from, data) => {
    if (!isPhoneMsg(data)) return;
    if (data.t === 'tipOpen') void snapshotFor(from);
    else if (data.t === 'blobAck') sender.ack(from, data);
    else if (data.t === 'tipSend' || data.t === 'tipCancel') {
      console.info('tip-off spike:', from, data); // judging is TF14
    }
  });
  client.onPeer(({ event, playerId }) => {
    if (event === 'rejoined') sender.resend(playerId);
  });
  client.onRoom((room) => {
    code.textContent = room.code;
    const url = `${location.origin}/play?spike=tipoff&code=${encodeURIComponent(room.code)}`;
    qr.replaceChildren(qrSvg(url, 'Join QR code'));
  });

  let last = performance.now();
  const frame = (now: number) => {
    scene.step(Math.min(100, now - last));
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (debugEnabled(import.meta.env.DEV)) {
    installDebug({
      code: () => client.code,
      sends: () => sends.map((s) => ({ ...s })),
      pending: () => sender.pending(),
    });
  }
  void client.start().catch((e: unknown) => {
    console.error('tip-off spike: could not open a room', e);
  });
}
