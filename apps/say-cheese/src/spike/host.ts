// Camera spike, TV side (BUILD_PLAN SC1; SPEC §7.4): creates a room under GAME_ID, shows the code
// and a QR to `/spike?code=`, and every received photo with its size, chunk count and the time
// from the phone's `shot` message to the last chunk.
import { qrMatrix } from '@pcg/game-kit';
import { createHostClient } from '@pcg/net-client';
import { createBlobReceiver, isChunk } from '../shared/blob-transfer';
import { GAME_ID, isPhoneMsg, MAX_PHONES } from '../shared/messages';
import { el } from './dom';

export function runHost(root: HTMLElement, url: string): void {
  const status = el('p', { className: 'spike-status' }, 'Connecting to the relay…');
  const code = el('p', { className: 'spike-code' });
  const qr = el('canvas', { className: 'spike-qr' });
  const link = el('p', { className: 'spike-link' });
  const photos = el('div', { className: 'spike-photos' });
  root.replaceChildren(
    el('h1', { className: 'h2' }, 'Camera spike (TV)'),
    status,
    code,
    qr,
    link,
    photos,
  );

  const shotAt = new Map<string, number>();
  const key = (from: string, r: number, photo: number) => `${from}|${r}:${photo}`;

  const client = createHostClient({ url, game: GAME_ID, maxPlayers: MAX_PHONES });
  const receiver = createBlobReceiver({
    sendAck: (to, ack) => client.send(ack, to),
    onComplete: (p) => {
      const start = shotAt.get(key(p.sender, p.r, p.photo));
      const ms = start === undefined ? null : Math.round(performance.now() - start);
      const img = el('img', { src: p.url, alt: `Photo ${p.photo + 1} from ${p.sender}` });
      const caption = el(
        'figcaption',
        {},
        `${p.sender} #${p.photo + 1}: ${(p.bytes / 1024).toFixed(1)} KB, ${p.chunks} chunks` +
          (ms === null ? '' : `, ${ms} ms`),
      );
      const fig = el('figure', { className: 'spike-photo' }, img, caption);
      fig.dataset.photo = String(p.photo);
      fig.dataset.sender = p.sender;
      img.addEventListener('load', () => {
        caption.textContent += ` (${img.naturalWidth}×${img.naturalHeight})`;
      });
      photos.prepend(fig);
    },
  });

  client.onMessage((from, data) => {
    if (isChunk(data)) receiver.receive(from, data);
    else if (isPhoneMsg(data) && data.t === 'shot') {
      shotAt.set(key(from, data.r, data.photo), performance.now());
    }
  });
  client.onPeer(({ event, playerId }) => {
    if (event === 'left') receiver.discardFrom(playerId);
  });
  client.onStatus((s) => (status.textContent = `Relay: ${s}`));
  client.onRoom((room) => {
    code.textContent = room.code;
    root.dataset.code = room.code;
    const join = `${location.origin}/spike?code=${room.code}`;
    link.textContent = join;
    drawQr(qr, join);
  });
  client.start().catch((e: unknown) => {
    status.textContent = `Relay error: ${String(e)}`;
  });
}

function drawQr(canvas: HTMLCanvasElement, text: string): void {
  const { size, modules } = qrMatrix(text);
  const quiet = 4;
  const scale = 6;
  const side = (size + quiet * 2) * scale;
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue('--brand-paper');
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = css.getPropertyValue('--brand-ink');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y * size + x])
        ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
  }
}
