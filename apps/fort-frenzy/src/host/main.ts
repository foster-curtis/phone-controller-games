// TV entry (index.html, SPEC §15.1, §15.2): the Phaser canvas (the World scene) and the DOM overlay
// (home, lobby, HUD, summary) over it, both fitted to the window by one shared transform; the host
// runtime (relay, party, sim); visibility pause and Wake Lock; and, in dev or with `?debug=1`, the
// debug panel and `window.__pcg`. `?ui=<screen>`, `?gallery=1` and `?stress=1` stay dev pages.
import {
  createHostFullscreenButton,
  createHostWakeLock,
  debugEnabled,
  watchVisibility,
} from '@pcg/game-kit';
import '../styles/brand.css';
import { mountVersionTag } from '../shared/version';

const params = new URLSearchParams(location.search);
const debug = debugEnabled(import.meta.env.DEV);
const tv = document.getElementById('tv') ?? document.body;

async function startTv() {
  mountVersionTag();
  const [{ createRuntime }, { createWorldGame }, { createTvOverlay }, { fitToWindow }] =
    await Promise.all([
      import('./game'),
      import('./scene/worldScene'),
      import('./ui/index'),
      import('./ui/layout'),
    ]);
  // The QR encodes this page's origin: open the TV on its LAN address for phones (C2 checkpoint).
  const origin = location.origin;
  const seed = params.get('seed');
  const runtime = createRuntime({
    origin,
    seed: seed !== null && Number.isFinite(Number(seed)) ? Math.floor(Number(seed)) : null,
    build: (import.meta.env.VITE_COMMIT as string | undefined) ?? 'dev',
  });

  // Sound effects (SPEC §12): preload behind the home loading bar, unlock on the first key.
  const [{ createSfx, unlockOnFirstKey }, { playCues }, { presentationHost }] = await Promise.all([
    import('./audio/index'),
    import('./audio/cues'),
    import('../presentation/host'),
  ]);
  const sfx = createSfx(presentationHost.sfx);
  unlockOnFirstKey(sfx);
  let atlasLoading: number | null = 0;
  let audioLoading = 0;
  const syncLoading = () => {
    runtime.loading =
      atlasLoading === null && audioLoading >= 1 ? null : Math.min(atlasLoading ?? 1, audioLoading);
  };
  void sfx.preload((p) => {
    audioLoading = p;
    syncLoading();
  });

  const overlay = createTvOverlay(tv, {
    onHome: (intent) => {
      runtime.onHome(intent);
      refresh(true);
    },
    onRemovePlayer: (id) => runtime.session.removeFromTv(id),
  });
  overlay.root.style.zIndex = '1';
  // Full screen is the player's choice, only from a click or key on this page (PLATFORM §3). The `F`
  // key comes with the button; home navigation uses W/A/S/D and the lobby 1-9, so nothing collides.
  const fullscreen = createHostFullscreenButton({ parent: tv });
  const MENU_SCREENS = new Set(['home', 'lobby', 'summary', 'restoring']);
  // The TV's own relay socket (not a phone's): a small pill while it reconnects.
  const conn = document.createElement('div');
  conn.className = 'tv-conn';
  conn.setAttribute('role', 'status');
  conn.textContent = 'Reconnecting…';
  conn.hidden = true;
  tv.append(conn);
  let lastScreen = '';
  let lastAt = 0;
  /** The overlay re-renders at 10 Hz, and at once when the screen changes. */
  function refresh(force = false) {
    const t = performance.now();
    if (!force && t - lastAt < 100) {
      const s = runtime.tvView().screen;
      if (s === lastScreen) return;
    }
    const view = runtime.tvView();
    lastScreen = view.screen;
    lastAt = t;
    overlay.update(view);
    fullscreen.setVisible(MENU_SCREENS.has(view.screen) || !!view.paused);
    conn.hidden = runtime.status !== 'reconnecting';
  }

  // `?fps=N` caps the TV's render rate (dev or debug only: e2e under software GL).
  const fps = debug ? Number(params.get('fps')) || undefined : undefined;
  const game = createWorldGame(
    tv,
    {
      get runId() {
        return runtime.runId;
      },
      content: runtime.session.content,
      frame: (dt) => {
        const f = runtime.frame(dt);
        if (f) {
          const w = f.world;
          playCues(
            f.events,
            (id) => sfx.play(id),
            (id) =>
              w.players.some((u) => u.id === id)
                ? 'player'
                : w.enemies.some((u) => u.id === id)
                  ? 'enemy'
                  : 'other',
          );
        }
        return f;
      },
      onLoading: (p) => {
        atlasLoading = p;
        syncLoading();
        refresh(true);
      },
      afterFrame: () => refresh(),
    },
    fps,
  );
  game.events.once('ready', () => {
    const c = game.canvas;
    c.style.position = 'fixed';
    c.style.left = '0';
    c.style.top = '0';
    c.style.zIndex = '0';
    fitToWindow(c);
  });
  refresh(true);

  // The sim and phone sync run on a timer, not on render frames: a starved GPU slows the picture,
  // never the run (the fixed-step accumulator catches up from wall time, §15.3).
  let last = performance.now();
  setInterval(() => {
    const t = performance.now();
    runtime.tick(t - last);
    last = t;
  }, 1000 / 60);
  watchVisibility((visible) => runtime.setVisible(visible));
  // A reload or a closed tab keeps the latest build-phase state (§15.8).
  window.addEventListener('pagehide', () => runtime.saveNow());
  void createHostWakeLock().request();

  if (debug) {
    const [{ installFfDebug, mountDebugPanel }] = await Promise.all([import('./debug')]);
    const scene = () => game.scene.getScene('world') as unknown as { fallbacks: number } | null;
    installFfDebug(runtime, () => scene()?.fallbacks ?? 0);
    const panel = mountDebugPanel(runtime);
    if (params.get('panel') === '0') document.getElementById('ff-debug')?.classList.add('min');
    window.addEventListener('error', (e) => panel.offerReplay(e.message));
    window.addEventListener('unhandledrejection', (e) => panel.offerReplay(String(e.reason)));
  }
}

const uiScreen = params.get('ui');
if (uiScreen && debug) {
  // TV UI samples (`?ui=<screen>`, BUILD_PLAN FF5): dev or `?debug=1` only.
  void import('./ui/dev').then(({ isUiScreen, mountUiDev }) => {
    if (isUiScreen(uiScreen)) mountUiDev(tv, uiScreen);
  });
} else if (params.get('gallery') === '1' && debug) {
  // The art gallery (`?gallery=1`, BUILD_PLAN FF3): dev or `?debug=1` only.
  void import('./render/gallery/index').then(({ startGallery }) => startGallery(tv));
} else if (params.get('stress') === '1' && debug) {
  // The in-game stress mode (`?stress=1`, BUILD_PLAN FF15): the real sim at the §15.2 peak.
  void import('./stress').then(({ startStress }) => startStress(tv, params));
} else {
  void startTv();
}
