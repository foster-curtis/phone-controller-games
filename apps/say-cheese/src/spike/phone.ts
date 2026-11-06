// Camera spike, phone side (BUILD_PLAN SC1; SPEC §3, §7.4, §10 #5): Enable camera, a live preview,
// Shoot (0.4 s cooldown), and each photo's upload/ack status. Unacked photos resend from chunk 0
// whenever the socket reopens.
import { createControllerClient } from '@pcg/net-client';
import { createCamera } from '../controller/camera';
import { createBlobSender, isAck } from '../shared/blob-transfer';
import { GAME_ID, type PhoneMsg } from '../shared/messages';
import { el } from './dom';

/** SPEC §10 #5. */
const COOLDOWN_MS = 400;
/** The spike has a single "round". */
const R = 1;

export function runPhone(root: HTMLElement, url: string, code: string): void {
  const status = el('p', { className: 'spike-status' }, `Joining ${code}…`);
  const enable = el('button', { type: 'button', className: 'spike-btn' }, 'Enable camera');
  const camStatus = el('p', { className: 'spike-status' });
  const preview = el('video', { className: 'spike-preview' });
  const shoot = el('button', { type: 'button', className: 'spike-btn', disabled: true }, 'Shoot');
  const error = el('p', { className: 'spike-error', role: 'alert' });
  const list = el('ol', { className: 'spike-list' });
  root.replaceChildren(
    el('h1', { className: 'h2' }, `Camera spike (${code})`),
    status,
    enable,
    camStatus,
    preview,
    shoot,
    error,
    list,
  );

  const client = createControllerClient({ url, game: GAME_ID, code });
  const send = (m: PhoneMsg) => client.send(m);
  const rows = new Map<number, HTMLLIElement>();
  const sender = createBlobSender({
    send,
    onProgress: ({ photo, sent, n, acked }) => {
      const row = rows.get(photo);
      if (!row) return;
      row.dataset.acked = String(acked);
      const meta = row.dataset.meta ?? '';
      row.textContent = `Photo ${photo + 1}: ${meta} ${acked ? 'acked ✓' : `sent ${sent}/${n}`}`;
    },
  });

  client.onMessage((data) => {
    if (isAck(data)) sender.ack(data);
  });
  let opened = false;
  client.onStatus((s) => {
    status.textContent = `Relay: ${s}`;
    if (s === 'open') {
      if (opened) sender.resendUnacked();
      opened = true;
    }
  });
  client.connect().catch((e: unknown) => {
    status.textContent = `Relay error: ${String(e)}`;
  });

  const camera = createCamera();
  camera.attach(preview);
  enable.addEventListener('click', async () => {
    const result = await camera.enable();
    camStatus.textContent = `Camera: ${result}`;
    shoot.disabled = result !== 'ok';
  });

  let photo = 0;
  shoot.addEventListener('click', async () => {
    if (shoot.disabled) return;
    shoot.disabled = true;
    setTimeout(() => (shoot.disabled = camera.state !== 'live'), COOLDOWN_MS);
    error.textContent = '';
    // The track ended (backgrounded tab, locked phone): re-acquire (BUILD_PLAN §8).
    if (camera.state === 'ended' && (await camera.enable()) !== 'ok') {
      error.textContent = 'Camera lost. Tap Enable camera.';
      return;
    }
    const at = performance.now();
    try {
      const shot = await camera.capture();
      const index = photo++;
      const row = el('li');
      row.dataset.photo = String(index);
      row.dataset.acked = 'false';
      row.dataset.meta = `${shot.width}×${shot.height}, ${(shot.blob.size / 1024).toFixed(1)} KB,`;
      row.textContent = `Photo ${index + 1}: ${row.dataset.meta} queued`;
      rows.set(index, row);
      list.prepend(row);
      send({ t: 'shot', r: R, photo: index, at, aspect: shot.width / shot.height });
      await sender.add(R, index, shot.blob);
    } catch (e) {
      error.textContent = e instanceof Error ? e.message : String(e);
    }
  });
}
