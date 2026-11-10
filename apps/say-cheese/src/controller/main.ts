// Phone entry (play.html, SPEC §4, §6.7, §7). `?dev=1` runs the offline harness (dev.ts). With
// `?code=` the app joins that room through the relay with the real camera (SC1) and uploads each
// shot as it is taken (net.ts); in dev or with `?debug=1`, `window.__pcg` exposes the client so e2e
// can send raw messages. Never imports host code (lint).
import { createLocalClient, isDevMode } from '@pcg/controller-kit';
import { debugEnabled, installDebug, relayUrl } from '@pcg/game-kit';
import { createControllerClient, getPlayerKey } from '@pcg/net-client';
import { GAME_ID, type PhoneMsg } from '../shared/messages';
import '../styles/brand.css';
import '../styles/base.css';
import '../styles/controller.css';
import { mountVersionTag } from '../shared/version';
import { createApp } from './app';
import { createCamera } from './camera';
import { createPhoneNet } from './net';
import { createPhotoStore } from './photos';
import { createPhoneSfx } from './sfx';

const root = document.getElementById('app') ?? document.body;
mountVersionTag();

function boot(): void {
  const code = new URLSearchParams(location.search).get('code')?.trim().toUpperCase() || null;
  const camera = createCamera();
  if (!code) {
    // No room code: the joining screen only (scan the TV's QR to get one).
    createApp({ root, client: createLocalClient(), camera });
    return;
  }

  const playerKey = getPlayerKey(code, undefined, GAME_ID);
  const client = createControllerClient({
    url: relayUrl(import.meta.env.VITE_RELAY_URL),
    game: GAME_ID,
    code,
    playerKey,
  });
  const photos = createPhotoStore();
  const net = createPhoneNet({ client, playerKey, photos });
  createApp({
    root,
    client,
    camera,
    sfx: createPhoneSfx(),
    photoUrl: (r, photo) => photos.url(r, photo),
    onCapture: net.onCapture,
    onHostMsg: net.onHostMsg,
  });

  if (debugEnabled(import.meta.env.DEV)) {
    installDebug({
      playerId: () => client.playerId,
      status: () => client.status,
      send: (msg: PhoneMsg) => client.send(msg),
    });
  }

  client.connect().then(
    ({ playerId }) => (root.dataset.playerId = playerId),
    // The app shows the closed overlay for no-room / room-closed; room-full lands here too.
    (e: unknown) => console.warn('Say Cheese: could not join', e),
  );
}

if (isDevMode()) void import('./dev').then((m) => m.startDev(root));
else boot();
