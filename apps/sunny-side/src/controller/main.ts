// Controller (phone) entry. Must never import Phaser or src/host/**.
import { isDevMode } from '@pcg/controller-kit';
import { relayUrl } from '@pcg/game-kit';
import { createControllerClient } from '@pcg/net-client';
import '../styles/brand.css';
import { GAME_ID } from '../shared/messages';
import { createApp } from './app';
import './controller.css';
import { startDev } from './devMode';

function boot(): void {
  const root = document.getElementById('app');
  if (!root) return;
  const params = new URLSearchParams(location.search);

  if (isDevMode(location.search)) {
    startDev(root);
    return;
  }

  const code = params.get('code')?.trim().toUpperCase() || null;
  const goTo = (c: string) => {
    location.search = `?code=${encodeURIComponent(c)}`;
  };

  if (!code) {
    // No code: the joining screen asks for one.
    const noClient = createNullClient();
    createApp({ root, client: noClient, code: null, onCode: goTo });
    return;
  }

  let client;
  try {
    client = createControllerClient({
      url: relayUrl(import.meta.env.VITE_RELAY_URL),
      game: GAME_ID,
      code,
    });
  } catch (e) {
    const stub = createNullClient(e instanceof Error ? e.message : 'Could not connect.');
    void createApp({ root, client: stub, code, onCode: goTo }).start();
    return;
  }
  const app = createApp({ root, client, code, onCode: goTo });
  // The relay-assigned id, for debugging and e2e (same id after a reload = token rejoin worked).
  const live = client;
  live.onStatus((s) => {
    if (s === 'open' && live.playerId) root.dataset.playerId = live.playerId;
  });
  void app.start().then(() => {
    if (live.playerId) root.dataset.playerId = live.playerId;
  });
}

/** Inert client for the "no code" / "client unavailable" joining screens. */
function createNullClient(failure?: string) {
  const none = () => () => {};
  return {
    status: 'idle' as const,
    send() {},
    close() {},
    connect: () => (failure ? Promise.reject(new Error(failure)) : new Promise<never>(() => {})),
    onMessage: none,
    onStatus: none,
    onHostStatus: none,
    onKicked: none,
    onError: none,
  };
}

boot();
