// Phone entry (play.html, SPEC §3, §4, §12.7). With `?code=` the app joins that room through the relay;
// without one it shows the join screen and reloads under the typed code. Mode routing (TF0): `?dev=1` →
// dev.ts (TF5, offline), `?spike=tipoff` → tipoff/spike.ts (TF4). In dev or with `?debug=1`,
// `window.__pcg` exposes the client (and `send`, for e2e).
// Never imports Phaser or host code (lint, check:bundle).
import { createLocalClient, isDevMode } from '@pcg/controller-kit';
import { debugEnabled, installDebug, relayUrl } from '@pcg/game-kit';
import { createControllerClient, getPlayerKey } from '@pcg/net-client';
import { GAME_ID } from '../shared/messages';
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
    // `send` lets e2e act as this phone (e.g. the leader's Start before TF12's lobby screen, BUILD_PLAN §8).
    installDebug({
      playerId: () => client.playerId,
      status: () => client.status,
      send: (msg: unknown) => client.send(msg),
    });
  }
  client.connect().then(
    ({ playerId }) => (root.dataset.playerId = playerId),
    (e: unknown) => console.warn("Thieves' Forum: could not join", e),
  );
}

const params = new URLSearchParams(location.search);
if (isDevMode()) void import('./dev').then((m) => m.mount(root));
else if (params.get('spike') === 'tipoff') void import('./tipoff/spike').then((m) => m.mount(root));
else boot();
