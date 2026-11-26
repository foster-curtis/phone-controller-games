// TV entry (index.html, SPEC §4, §5, §6.16, §12.2, §12.3): opens a room under game ID `thieves-forum`,
// boots the market scene (Phaser renders only) and the TV DOM UI (`createTvUi`, TF6) over it, and runs
// the crowd spike (game.ts, TF7): lobby → Start (leader phone or the TV's key) → a round of the sim.
// The sim steps on a 60 Hz timer, not on render frames, and not while the tab is hidden. Wake Lock,
// the full-screen button and, in dev or with `?debug=1`, `window.__pcg` (debug.ts, hook groups in
// debugHooks/), `?timeScale=<n>` and the dev overlay (`D` / `?overlay=1`).
// Mode routing (SPEC §12.7, TF0): `?gallery=1` → gallery/ (TF1), `?spike=tipoff` → spike/ (TF4),
// `?ui=<screen>` → ui/preview.ts (TF6), `?stress=1` → stress.ts (TF7), else the game.
import {
  createHostFullscreenButton,
  createHostWakeLock,
  debugEnabled,
  watchVisibility,
} from '@pcg/game-kit';
import { mountVersionTag } from '../shared/version';
import '../styles/brand.css';
import '../styles/tv.css';
import type * as Phaser from 'phaser';
import { createRuntime } from './game';
import { createRelayClient } from './net';
import { createMarketGame } from './scene/market';
import type { SceneOverlay } from './scene/types';
import { createTvUi } from './ui/tvUi';

const tv = document.getElementById('tv') ?? document.body;
const params = new URLSearchParams(location.search);
const debug = debugEnabled(import.meta.env.DEV);
mountVersionTag();

async function bootGame(): Promise<void> {
  const client = createRelayClient();
  const rt = createRuntime({ client, origin: location.origin });
  const timeScale = Number(params.get('timeScale'));
  if (debug && timeScale > 0) rt.setTimeScale(timeScale);

  // Debug-only modules load only behind the debug switch (scene/__tests__/disguise.test.ts).
  let overlay: ((scene: Phaser.Scene) => SceneOverlay) | undefined;
  if (debug) {
    const [{ createDevOverlay }, { installHostDebug }] = await Promise.all([
      import('./scene/overlay'),
      import('./debug'),
    ]);
    overlay = (scene) =>
      createDevOverlay(scene, () => {
        const d = rt.debugView();
        return d ? { debug: d, names: rt.playerNames() } : null;
      });
    installHostDebug(rt);
  }

  const stage = document.createElement('div');
  stage.className = 'tv-stage';
  tv.append(stage);
  createMarketGame(stage, rt, overlay ? { overlay } : {});

  const ui = createTvUi(tv);
  ui.onControl((c) => {
    if (c === 'start') rt.start();
  });
  let lastPhase = '';
  let lastAt = 0;
  /** The DOM UI re-renders at 10 Hz, and at once when the phase changes. */
  const render = (force = false) => {
    const t = performance.now();
    const view = rt.tvView();
    if (!force && view.phase === lastPhase && t - lastAt < 100) return;
    lastPhase = view.phase;
    lastAt = t;
    ui.render(view);
  };
  rt.onChange(() => render(true));

  let last = performance.now();
  setInterval(() => {
    const t = performance.now();
    rt.tick(t - last);
    last = t;
    render();
  }, 1000 / 60);
  watchVisibility((v) => rt.setVisible(v));

  createHostFullscreenButton({ parent: tv });
  void createHostWakeLock().request();
  render(true);
  try {
    await client.start();
  } catch (e) {
    console.error("Thieves' Forum: could not open a room", e);
  }
  render(true);
}

const ui = params.get('ui');
if (params.get('gallery') === '1') void import('./gallery/index').then((m) => m.mount(tv));
else if (params.get('spike') === 'tipoff') void import('./spike/index').then((m) => m.mount(tv));
else if (ui) void import('./ui/preview').then((m) => m.mount(tv, ui));
else if (params.get('stress') === '1')
  void import('./stress').then((m) => m.startStress(tv, debug));
else void bootGame();
