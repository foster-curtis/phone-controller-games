// Stress mode (`?stress=1&debug=1`, SPEC §12.2 performance target, §6.10; BUILD_PLAN TF7): the real sim
// and the real market scene with the 8-player crowd (8 bots on the player slots → 24 NPCs, 10 open
// stalls), no relay and no phones. Bots wander at walking stick speeds and change heading every few
// seconds. A corner readout shows FPS, sim step mean / p99 and counts; `window.__pcg.perf()` reports
// them for e2e. Numbers only mean something on the TV itself (headless Chromium has software GL).
import { watchVisibility } from '@pcg/game-kit';
import { MAX_PLAYERS } from '../shared/messages';
import { createRuntime, type Runtime } from './game';
import type { PlayerId, PlayerInput } from './sim/types';

/** One bot's stick: heading and magnitude, held until `until` (ms). */
interface BotStick {
  angle: number;
  mag: number;
  until: number;
}

export function botDriver(ids: readonly PlayerId[], rand: () => number = Math.random) {
  const sticks = new Map<PlayerId, BotStick>();
  return (now: number): Map<PlayerId, PlayerInput> => {
    const out = new Map<PlayerId, PlayerInput>();
    for (const id of ids) {
      let s = sticks.get(id);
      if (!s || now >= s.until) {
        // Mostly the walk band (0.4–0.85), sometimes a stop (SPEC §6.10 player movement).
        const stop = rand() < 0.2;
        s = {
          angle: rand() * Math.PI * 2,
          mag: stop ? 0 : 0.45 + rand() * 0.35,
          until: now + 1000 + rand() * 3000,
        };
        sticks.set(id, s);
      }
      out.set(id, {
        move: { x: Math.cos(s.angle) * s.mag, y: Math.sin(s.angle) * s.mag },
        hold: false,
        catch: false,
      });
    }
    return out;
  };
}

export interface PerfReadout {
  fps: number;
  stepMeanMs: number;
  stepP99Ms: number;
  characters: number;
  rigs: number;
}

export async function startStress(parent: HTMLElement, debug: boolean): Promise<Runtime | null> {
  if (!debug) {
    parent.textContent = 'Stress mode needs a dev build or ?debug=1.';
    return null;
  }
  const ids = Array.from({ length: MAX_PLAYERS }, (_, i) => `bot${i + 1}`);
  const rt = createRuntime({
    client: null,
    origin: location.origin,
    bots: { ids, inputs: botDriver(ids) },
  });
  rt.start();
  const [{ createMarketGame }, { installHostDebug }] = await Promise.all([
    import('./scene/market'),
    import('./debug'),
  ]);
  const stage = document.createElement('div');
  stage.className = 'tv-stage';
  parent.append(stage);
  let counts = { rigs: 0, characters: 0 };
  let countsOf: (() => { rigs: number; characters: number }) | null = null;
  const game = createMarketGame(stage, rt, { onReady: (s) => (countsOf = () => s.counts) });

  const readout = document.createElement('pre');
  readout.dataset.role = 'perf';
  readout.style.cssText =
    'position:fixed;top:8px;right:8px;z-index:5;margin:0;padding:6px 10px;' +
    'font:600 18px var(--font-mono, monospace);color:var(--gold);background:var(--background)';
  parent.append(readout);
  const perf = (): PerfReadout => {
    const s = rt.stepStats();
    return {
      fps: game.loop.actualFps,
      stepMeanMs: s.meanMs,
      stepP99Ms: s.p99Ms,
      ...counts,
    };
  };
  setInterval(() => {
    if (countsOf) counts = countsOf();
    const p = perf();
    readout.textContent =
      `${p.fps.toFixed(0)} fps  step ${p.stepMeanMs.toFixed(2)} / p99 ${p.stepP99Ms.toFixed(2)} ms\n` +
      `${p.characters} citizens  ${p.rigs} rigs`;
  }, 500);

  const api = installHostDebug(rt);
  api.registerDebug('perf', perf);

  // The sim runs on a timer, not on render frames, as in a round (main.ts).
  let last = performance.now();
  setInterval(() => {
    const t = performance.now();
    rt.tick(t - last);
    last = t;
  }, 1000 / 60);
  watchVisibility((v) => rt.setVisible(v));
  return rt;
}
