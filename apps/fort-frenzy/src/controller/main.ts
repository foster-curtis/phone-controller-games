// Phone entry (play.html, SPEC §15.7). Mounts the controller app: the real relay client, or `?dev=1`'s
// offline fake. Never imports Phaser or host code (lint, check:bundle).
import { isDevMode } from '@pcg/controller-kit';
import { relayUrl } from '@pcg/game-kit';
import { createControllerClient } from '@pcg/net-client';
import '../styles/brand.css';
import { GAME_ID } from '../shared/messages';
import { mountVersionTag } from '../shared/version';
import { createApp } from './app';
import { loadIconSprite } from './assets';
import './controller.css';

/** Inert client for the "no code" / "client unavailable" join screens. */
function createNullClient() {
  const none = () => () => {};
  return {
    status: 'idle' as const,
    send() {},
    close() {},
    connect: () => new Promise<never>(() => {}),
    onMessage: none,
    onStatus: none,
    onHostStatus: none,
    onKicked: none,
    onError: none,
  };
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  mountVersionTag();
  void loadIconSprite();

  if (isDevMode(location.search)) {
    const { startDev } = await import('./dev');
    startDev(root);
    return;
  }

  const code = new URLSearchParams(location.search).get('code')?.trim().toUpperCase() || null;
  const onCode = (c: string) => {
    location.search = `?code=${encodeURIComponent(c)}`;
  };
  if (!code) {
    createApp({ root, client: createNullClient(), code: null, onCode });
    return;
  }
  const client = createControllerClient({
    url: relayUrl(import.meta.env.VITE_RELAY_URL),
    game: GAME_ID,
    code,
  });
  const app = createApp({ root, client, code, onCode });
  client.onStatus((s) => {
    if (s === 'open' && client.playerId) root.dataset.playerId = client.playerId;
  });
  void app.start();
}

void boot();
