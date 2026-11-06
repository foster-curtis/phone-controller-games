// In-game stress mode (`?debug=1&stress=1`, SPEC §15.2 budget; FF15): the real sim and the real
// World scene at the §15.2 peak, with no relay and no phones. Six autopilot knights (every class,
// invincible) on wave 15 with the Colossus Mk III held in its final phase, Swarm packs topping the
// crowd up to 150, 60 towers, 30 footmen and 100 projectiles (sim/peak.ts), stepped at 60 Hz on the
// runtime's timer like a run. The overlay shows frame, CPU render, bloom and sim step times; the
// numbers only mean something on the target laptop (headless Chromium has software GL, BUILD_PLAN §8).
// `&peak=synthetic` swaps in the scattered whole-roster crowd; `&seed=N` reseeds it.
import { catchUpSteps, createFixedStep } from '@pcg/game-kit';
import { content } from '../content';
import type { StressSim } from './render/stressOverlay';
import type { RenderWorld } from './render/world';
import type { FrameInput, Pos } from './scene/worldView';
import { peakLoad, type PeakKind } from './sim/peak';
import { STEP_MS, type EntityId, type SimEvent } from './sim/types';

/** Recent sim steps kept for the overlay's mean and p99. */
const WINDOW = 600;
const MAX_FRAME_MS = 250;

export async function startStress(parent: HTMLElement, params: URLSearchParams): Promise<void> {
  const [{ createWorldGame }, { fitToWindow }, { StressOverlay }] = await Promise.all([
    import('./scene/worldScene'),
    import('./ui/layout'),
    import('./render/stressOverlay'),
  ]);
  const kind: PeakKind = params.get('peak') === 'synthetic' ? 'synthetic' : 'boss';
  const seed = Number(params.get('seed'));
  const load = peakLoad(kind, Number.isFinite(seed) && seed > 0 ? Math.floor(seed) : 15);
  const { sim } = load;
  const w = sim.world;

  const prev = new Map<EntityId, Pos>();
  let events: SimEvent[] = [];
  const times = new Float64Array(WINDOW);
  let n = 0;
  const step = () => {
    prev.clear();
    for (const u of w.players) prev.set(u.id, { x: u.x, y: u.y, z: 0 });
    for (const u of w.enemies) prev.set(u.id, { x: u.x, y: u.y, z: u.z ?? 0 });
    for (const u of w.soldiers) prev.set(u.id, { x: u.x, y: u.y, z: 0 });
    for (const u of w.projectiles) prev.set(u.id, { x: u.x, y: u.y, z: u.z ?? 0 });
    load.topUp();
    const t0 = performance.now();
    sim.step();
    times[n++ % WINDOW] = performance.now() - t0;
    if (events.length > 4000) events = events.slice(-2000);
    for (const e of w.events) events.push(e);
  };
  const simStats = (): StressSim => {
    const k = Math.min(n, WINDOW);
    const recent = Array.from(times.subarray(0, k)).sort((a, b) => a - b);
    const mean = recent.reduce((s, x) => s + x, 0) / Math.max(1, k);
    return {
      meanMs: mean,
      p99Ms: recent[Math.min(k - 1, Math.floor(k * 0.99))] ?? 0,
      counts:
        `${w.players.length} knights  ${w.soldiers.length} footmen  ${w.enemies.length} enemies  ` +
        `${w.projectiles.length} projectiles  ${w.structures.length} structures`,
    };
  };

  const loop = createFixedStep({ stepMs: STEP_MS, maxSteps: catchUpSteps(MAX_FRAME_MS, STEP_MS) });
  let overlay: InstanceType<typeof StressOverlay> | null = null;
  const game = createWorldGame(
    parent,
    {
      runId: 1,
      content,
      frame(renderMs): FrameInput {
        overlay?.tick(renderMs);
        const out: FrameInput = {
          world: w,
          prev,
          alpha: Math.min(0.999, loop.accumulator / STEP_MS),
          events,
          dtMs: Math.min(Math.max(0, renderMs), MAX_FRAME_MS),
          overlays: { hitbox: false, range: false, flow: false },
        };
        events = [];
        return out;
      },
      onLoading: () => {},
      onWorld(world: RenderWorld) {
        overlay = new StressOverlay(world, simStats);
      },
    },
    Number(params.get('fps')) || undefined,
  );
  game.events.once('ready', () => {
    const c = game.canvas;
    c.style.position = 'fixed';
    c.style.left = '0';
    c.style.top = '0';
    fitToWindow(c);
  });
  // The sim runs on a timer, not on render frames, as in a run (main.ts).
  let last = performance.now();
  setInterval(() => {
    const t = performance.now();
    loop.advance(Math.min(Math.max(0, t - last), MAX_FRAME_MS), step);
    last = t;
  }, 1000 / 60);
}
