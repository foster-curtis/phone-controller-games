// Controller (phone) entry. Must never import Phaser or src/host/**.
import { createControllerClient } from '@pcg/net-client';
import '../styles/brand.css';
import { GAME_ID, type HostMsg, type Screen } from '../shared/messages';
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
  const app = createApp({ root, client, code, onCode: goTo });
  // Registered after the app's own listener, so the screen is already rendered here.
  client.onMessage((data) => {
    const m = data as Partial<HostMsg> | null;
    if (m && m.t === 'screen' && m.screen) showWaiting(root, m.screen);
  });
  // The relay-assigned id, for debugging and e2e (same id after a reload = token rejoin worked).
  const live = client;
  live.onStatus((s) => {
    if (s === 'open' && live.playerId) root.dataset.playerId = live.playerId;
  });
  void app.start().then(() => {
    if (live.playerId) root.dataset.playerId = live.playerId;
  });
}

const WAITING_KINDS: ReadonlySet<Screen['kind']> = new Set(['lobby', 'results', 'matchEnd']);

/**
 * "Waiting for {leader}…" under the (empty) leader actions on non-leader phones (SPEC §6.5). The
 * host stamps `leaderName` on each screen; the screens re-render their actions on every update, so
 * this re-adds the line after each one.
 */
function showWaiting(root: HTMLElement, screen: Screen): void {
  for (const old of root.querySelectorAll('[data-waiting]')) old.remove();
  if (screen.isLeader || !screen.leaderName || !WAITING_KINDS.has(screen.kind)) return;
  const actions = root.querySelector(`[data-screen="${screen.kind}"] .actions`);
  if (!actions) return;
  const line = document.createElement('p');
  line.className = 'body';
  line.dataset.waiting = '';
  line.textContent = `Waiting for ${screen.leaderName}…`;
  actions.append(line);
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
