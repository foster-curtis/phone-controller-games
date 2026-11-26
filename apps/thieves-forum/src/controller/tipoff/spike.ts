// `/play?spike=tipoff&code=…` phone spike (SPEC §6.13, §12.6; BUILD_PLAN TF4, risk 3): joins the TV's
// spike room, taps "Snapshot" to send `tipOpen`, receives the `tipSnapshot` header and the JPEG by blob
// transfer, opens the tip viewer with its hit areas, and shows KB, chunks and ms from the tap to the
// last chunk. `window.__pcg` (dev or `?debug=1`) exposes the results and socket stats for e2e.
// Frozen at TF0 (BUILD_PLAN §3): the `mount(root)` signature. Never imports Phaser or host code.
import { debugEnabled, installDebug, relayUrl } from '@pcg/game-kit';
import { createControllerClient, getPlayerKey } from '@pcg/net-client';
import { createBlobReceiver } from '../../shared/blob-transfer';
import { GAME_ID, isHostMsg, type HostMsg, type PhoneMsg } from '../../shared/messages';
import type { HitArea, TipSnapshot } from '../../shared/viewer/types';
import './spike.css';
import { createTipViewer, type TipViewer } from './viewer';

/** One snapshot's numbers, as the page shows them. */
export interface SpikeResult {
  blobId: number;
  /** JPEG bytes as received. */
  bytes: number;
  chunks: number;
  /** From the Snapshot tap to the last chunk. */
  ms: number;
  w: number;
  h: number;
  hits: number;
  /** Set once the `<img>` decoded it. */
  naturalWidth: number;
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

const kb = (bytes: number) => (bytes / 1024).toFixed(1);

export function mount(root: HTMLElement): void {
  root.dataset.mode = 'spike-tipoff';
  const page = h('section', 'spike');
  page.dataset.screen = 'spike';
  const heading = h('h1', 'h2', 'Tip-off spike');
  const status = h('p', 'caption spike-status', 'Connecting…');
  status.dataset.role = 'status';
  const shoot = h('button', 'button spike-shoot coin-edge', 'Snapshot');
  shoot.type = 'button';
  shoot.dataset.action = 'snapshot';
  shoot.disabled = true;
  const stats = h('p', 'money spike-stats', '—');
  stats.dataset.role = 'stats';
  const log = h('ol', 'caption spike-log');
  log.dataset.role = 'log';
  page.append(heading, status, shoot, stats, log);
  root.append(page);

  const code = new URLSearchParams(location.search).get('code')?.trim().toUpperCase() || null;
  if (!code) {
    status.textContent = 'Open this page from the QR on the TV (?spike=tipoff).';
    return;
  }

  const client = createControllerClient({
    url: relayUrl(import.meta.env.VITE_RELAY_URL),
    game: GAME_ID,
    code,
    playerKey: getPlayerKey(code, undefined, GAME_ID),
  });
  const send = (m: PhoneMsg) => client.send(m);
  const results: SpikeResult[] = [];
  let requestedAt = 0;
  let header: { snapshot: TipSnapshot; hits: HitArea[]; fee: number } | null = null;
  let viewer: TipViewer | null = null;
  let picked: number | null = null;

  const close = () => {
    viewer?.destroy();
    viewer = null;
  };

  const receiver = createBlobReceiver({
    sendAck: (ack) => send(ack),
    onComplete: (blob) => {
      if (!header || header.snapshot.id !== blob.blobId) return;
      const result: SpikeResult = {
        blobId: blob.blobId,
        bytes: blob.bytes,
        chunks: blob.chunks,
        ms: Math.round(performance.now() - requestedAt),
        w: header.snapshot.w,
        h: header.snapshot.h,
        hits: header.hits.length,
        naturalWidth: 0,
      };
      results.push(result);
      stats.textContent = `${kb(result.bytes)} KB · ${result.chunks} chunks · ${result.ms} ms`;
      log.append(h('li', '', stats.textContent));
      shoot.disabled = false;
      if (!viewer) return;
      const img = viewer.root.querySelector('img')!;
      img.addEventListener('load', () => (result.naturalWidth = img.naturalWidth), { once: true });
      viewer.setImage(blob.url);
    },
  });

  client.onMessage((data) => {
    if (!isHostMsg(data)) return;
    const m: HostMsg = data;
    if (m.t === 'chunk') receiver.receive(m);
    else if (m.t === 'tipSnapshot') {
      close();
      header = { snapshot: m.snapshot, hits: m.hits, fee: m.fee };
      viewer = createTipViewer({
        parent: root,
        snapshot: m.snapshot,
        hits: m.hits,
        fee: m.fee,
        onSend: (target) => {
          picked = target;
          send({ t: 'tipSend', target });
          close();
        },
        onCancel: () => {
          send({ t: 'tipCancel' });
          close();
        },
      });
    }
  });
  client.onStatus((s) => {
    status.textContent = `Room ${code} · ${s}`;
    shoot.disabled = s !== 'open';
  });
  shoot.addEventListener('click', () => {
    shoot.disabled = true;
    requestedAt = performance.now();
    send({ t: 'tipOpen' });
  });

  if (debugEnabled(import.meta.env.DEV)) {
    installDebug({
      status: () => client.status,
      stats: () => client.getStats(),
      results: () => results.map((r) => ({ ...r })),
      header: () => header,
      picked: () => picked,
    });
  }
  client.connect().then(
    ({ playerId }) => (root.dataset.playerId = playerId),
    (e: unknown) => (status.textContent = `Could not join ${code}: ${String(e)}`),
  );
}
