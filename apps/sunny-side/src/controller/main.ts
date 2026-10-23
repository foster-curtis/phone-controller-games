// Controller (phone) entry. Must never import Phaser or src/host/**.
import { createControllerClient } from '@pcg/net-client';
import '../styles/brand.css';
import { GAME_ID } from '../shared/messages';
import { relayUrl } from '../shared/relayUrl';
import { createApp } from './app';
import './controller.css';
import { startDev } from './dev';
import { tryLockLandscape } from './orientation';
import { createWakeLock } from './wakeLock';

function boot(): void {
  const root = document.getElementById('app');
  if (!root) return;
  const params = new URLSearchParams(location.search);

  if (params.get('dev') === '1') {
    startDev(root);
    return;
  }

  const code = params.get('code')?.trim().toUpperCase() || null;
  const goTo = (c: string) => {
    location.search = `?code=${encodeURIComponent(c)}`;
  };

  const wake = createWakeLock();
  // Wake Lock and fullscreen need a user gesture; take them on the first touch.
  addEventListener(
    'pointerdown',
    () => {
      void wake.request();
      void tryLockLandscape();
    },
    { once: true },
  );

  if (!code) {
    // No code: the joining screen asks for one.
    const noClient = createNullClient();
    createApp({ root, client: noClient, code: null, onCode: goTo });
    return;
  }

  let client;
  try {
    client = createControllerClient({ url: relayUrl(), game: GAME_ID, code });
  } catch (e) {
    const stub = createNullClient(e instanceof Error ? e.message : 'Could not connect.');
    void createApp({ root, client: stub, code, onCode: goTo }).start();
    return;
  }
  void createApp({ root, client, code, onCode: goTo }).start();
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
