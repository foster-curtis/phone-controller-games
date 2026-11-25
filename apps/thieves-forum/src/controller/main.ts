// Phone entry (play.html, SPEC §3, §4). With `?code=` the app joins that room through the relay;
// without one it shows the join screen and reloads under the typed code. `?dev=1` runs offline with a
// fake client that answers the join. In dev or with `?debug=1`, `window.__pcg` exposes the client.
// Never imports Phaser or host code (lint, check:bundle).
import { createLocalClient, isDevMode } from '@pcg/controller-kit';
import { debugEnabled, installDebug, relayUrl } from '@pcg/game-kit';
import { createControllerClient, getPlayerKey } from '@pcg/net-client';
import { GAME_ID, isPhoneMsg } from '../shared/messages';
import { mountVersionTag } from '../shared/version';
import '../styles/brand.css';
import '../styles/controller.css';
import { createApp } from './app';

const root = document.getElementById('app') ?? document.body;
mountVersionTag();

const goToRoom = (code: string) => location.assign(`/play?code=${encodeURIComponent(code)}`);

function boot(): void {
  const code = new URLSearchParams(location.search).get('code')?.trim().toUpperCase() || null;
  if (!code) {
    createApp({ root, client: createLocalClient(), code: null, goToRoom });
    return;
  }
  const client = createControllerClient({
    url: relayUrl(import.meta.env.VITE_RELAY_URL),
    game: GAME_ID,
    code,
    playerKey: getPlayerKey(code, undefined, GAME_ID),
  });
  createApp({ root, client, code, goToRoom });
  if (debugEnabled(import.meta.env.DEV)) {
    installDebug({ playerId: () => client.playerId, status: () => client.status });
  }
  client.connect().then(
    ({ playerId }) => (root.dataset.playerId = playerId),
    (e: unknown) => console.warn("Thieves' Forum: could not join", e),
  );
}

function bootDev(): void {
  // Offline (AGENTS.md): a fake client that echoes the host's `joined`.
  const client = createLocalClient();
  const send = client.send.bind(client);
  client.send = (d: unknown) => {
    send(d);
    if (isPhoneMsg(d)) queueMicrotask(() => client.emit({ t: 'joined', name: d.name }));
  };
  createApp({ root, client, code: 'DEVV' });
}

if (isDevMode()) bootDev();
else boot();
