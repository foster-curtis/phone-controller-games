// Host (TV) entry: creates the room, wires HostClient ↔ match ↔ sim (game.ts), and shows the scene
// for the current match phase. Phaser only renders; its Matter plugin is never enabled.
import * as Phaser from 'phaser';
import { theme } from '../shared/theme';
import '../styles/brand.css';
import { debugEnabled, installDebug } from './debug';
import { createGameRuntime } from './game';
import { hostUrl, isLoopbackHost, joinUrl } from './lan';
import { STORAGE_KEY } from './match/config';
import { BootScene } from './scenes/Boot';
import { LobbyScene } from './scenes/Lobby';
import { ResultsScene } from './scenes/Results';
import { RoundScene } from './scenes/Round';
import { WinnerScene } from './scenes/Winner';
import {
  HEIGHT,
  SCENE,
  SCENE_FOR_PHASE,
  WIDTH,
  setHostContext,
  type HostContext,
  type SceneKey,
} from './scenes/ui';
import { watchVisibility } from './visibility';
import { createHostWakeLock } from './wakeLock';

const debug = debugEnabled();

const runtime = createGameRuntime({
  debug,
  // The old room expired while we were away: start over cleanly in a fresh room.
  onNewRoom: () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    location.reload();
  },
});

let booted = false;
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: theme.color.background.hex,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [
    new BootScene(() => {
      booted = true;
      showPhase();
    }),
    LobbyScene,
    RoundScene,
    ResultsScene,
    WinnerScene,
  ],
});

const lanHost = (import.meta.env.VITE_LAN_HOST as string | undefined) || null;
const ctx: HostContext = {
  runtime,
  origin: location.origin,
  loopback: isLoopbackHost(location.hostname),
  lanUrl: lanHost
    ? hostUrl(lanHost, Number(location.port) || 80, location.protocol.slice(0, -1))
    : null,
  qr: null,
};
setHostContext(game, ctx);

const PHASE_SCENES: readonly SceneKey[] = [SCENE.lobby, SCENE.round, SCENE.results, SCENE.winner];

function showPhase(): void {
  if (!booted) return;
  const want = SCENE_FOR_PHASE[runtime.view().phase];
  for (const key of PHASE_SCENES) {
    if (key !== want && game.scene.isActive(key)) game.scene.stop(key);
  }
  if (!game.scene.isActive(want)) game.scene.start(want);
  if (game.scene.isActive(SCENE.boot)) game.scene.stop(SCENE.boot);
}

runtime.match.onEvent((e) => {
  if (e.type === 'phase') showPhase();
});

// Fixed-step loop: one call per Phaser frame, before the scenes' update/render.
let lastTime: number | null = null;
game.events.on(Phaser.Core.Events.STEP, (time: number) => {
  if (lastTime !== null) runtime.frame(time - lastTime);
  lastTime = time;
});

watchVisibility((visible) => {
  lastTime = null;
  runtime.setHostVisible(visible);
});
const wake = createHostWakeLock();
void wake.request();

runtime.start().catch((e: unknown) => {
  console.error('host: could not create a room', e);
});

if (debug) {
  installDebug({
    phase: () => runtime.view().phase,
    players: () => runtime.view().players,
    view: () => runtime.view(),
    code: () => runtime.code,
    joinUrl: () => (runtime.code ? joinUrl(ctx.origin, runtime.code) : null),
    qr: () => (ctx.qr ? { size: ctx.qr.size, modules: ctx.qr.modules } : null),
    texts: () =>
      game.scene
        .getScenes(true)
        .flatMap((s) => s.children.list)
        .filter((o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text)
        .map((t) => t.text)
        .filter((t) => t !== ''),
    debug: {
      eliminate: (id) => runtime.debugSim?.forceOut(id) ?? false,
      knockOut: (victim, attacker) => runtime.debugSim?.knockOut(victim, attacker) ?? false,
      holdSlam: (id, on) => runtime.debugSim?.holdSlam(id, on) ?? false,
      remove: (id) => runtime.removePlayer(id),
    },
  });
}
