// The stress overlay (SPEC §15.2 budget; FF3, moved here for FF15): frame time, CPU render submit and
// bloom time, plus the sim step in the in-game stress mode (`?debug=1&stress=1`). Bloom time comes
// from a GPU timer query around the bloom pass where the browser exposes one, else from frame delta
// with bloom on vs off (alternating 90-frame windows). Used by the gallery's `&stress=1` page too.
import * as Phaser from 'phaser';
import type { RenderWorld } from './world';

/** Sim step timings for the overlay (the in-game stress mode). */
export interface StressSim {
  /** Mean and p99 step time over the recent window, ms. */
  meanMs: number;
  p99Ms: number;
  /** One line of entity counts. */
  counts: string;
}

/** Text updates this often (frames): rewriting the DOM every frame costs frame time itself. */
const TEXT_EVERY = 15;

/** Frame, render and bloom timings in a DOM overlay (window.__pcgStress for scripts). */
export class StressOverlay {
  private el = document.createElement('pre');
  private frames: number[] = [];
  private renders: number[] = [];
  private renderStart = 0;
  private bloomGpu: number[] = [];
  private ab = { on: [] as number[], off: [] as number[], frame: 0 };
  private readonly timer: GpuTimer | null;
  private n = 0;

  constructor(
    private readonly world: RenderWorld,
    private readonly sim?: () => StressSim,
  ) {
    this.el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:10;margin:0;padding:8px 10px;font:13px var(--font-mono, monospace);' +
      'color:#fff;background:rgba(20,22,26,.85);border:1px solid #2e333c;pointer-events:none';
    document.body.append(this.el);
    const game = world.scene.game;
    game.events.on(Phaser.Core.Events.PRE_RENDER, () => (this.renderStart = performance.now()));
    game.events.on(Phaser.Core.Events.POST_RENDER, () =>
      this.renders.push(performance.now() - this.renderStart),
    );
    this.timer = GpuTimer.attach(world, (ms) => this.bloomGpu.push(ms));
    world.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.el.remove());
  }

  tick(dt: number) {
    this.frames.push(dt);
    for (const a of [this.frames, this.renders, this.bloomGpu])
      if (a.length > 120) a.splice(0, a.length - 120);
    let bloomLine: string;
    if (this.timer) {
      this.timer.poll();
      bloomLine = `bloom ${mean(this.bloomGpu).toFixed(2)} ms (GPU timer query)`;
    } else {
      // A/B: bloom on and off in alternating 90-frame windows.
      const on = this.world.bloom?.enabled ?? false;
      (on ? this.ab.on : this.ab.off).push(dt);
      for (const a of [this.ab.on, this.ab.off]) if (a.length > 270) a.splice(0, a.length - 270);
      if (++this.ab.frame % 90 === 0) this.world.bloom?.setEnabled(!on);
      bloomLine =
        this.ab.on.length > 0 && this.ab.off.length > 0
          ? `bloom ≈ ${(mean(this.ab.on) - mean(this.ab.off)).toFixed(2)} ms (frame delta on − off; no GPU timer)`
          : 'bloom: collecting (frame delta on vs off; no GPU timer)';
    }
    if (++this.n % TEXT_EVERY !== 1) return;
    const p95 = [...this.frames].sort((a, b) => a - b)[Math.floor(this.frames.length * 0.95)] ?? 0;
    const sim = this.sim?.();
    const text =
      `frame ${mean(this.frames).toFixed(2)} ms (p95 ${p95.toFixed(1)}, budget 16.7)\n` +
      `render ${mean(this.renders).toFixed(2)} ms (CPU submit)\n${bloomLine} (budget 2)\n` +
      (sim
        ? `sim step ${sim.meanMs.toFixed(2)} ms (p99 ${sim.p99Ms.toFixed(2)}, budget 2)\n${sim.counts}\n`
        : '') +
      `rigs ${this.world.rigCount}  parts ${this.world.partCount}  fx ${this.world.fx.active}`;
    this.el.textContent = text;
    (window as unknown as { __pcgStress?: unknown }).__pcgStress = {
      frameMs: mean(this.frames),
      renderMs: mean(this.renders),
      bloomMs: this.timer ? mean(this.bloomGpu) : mean(this.ab.on) - mean(this.ab.off),
      gpuTimer: this.timer !== null,
      simMs: sim?.meanMs ?? null,
      simP99Ms: sim?.p99Ms ?? null,
      fallbacks: this.world.lib.fallbacks,
    };
  }
}

const mean = (a: readonly number[]) =>
  a.length === 0 ? 0 : a.reduce((s, x) => s + x, 0) / a.length;

/** EXT_disjoint_timer_query_webgl2 around the bloom's ParallelFilters pass. */
class GpuTimer {
  private pending: WebGLQuery[] = [];

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number },
    private readonly out: (ms: number) => void,
  ) {}

  static attach(world: RenderWorld, out: (ms: number) => void): GpuTimer | null {
    const renderer = world.scene.sys.renderer;
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return null;
    const gl = renderer.gl as WebGLRenderingContext | WebGL2RenderingContext;
    if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext))
      return null;
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuTimer['ext'] | null;
    if (!ext) return null;
    const timer = new GpuTimer(gl, ext, out);
    const node = renderer.renderNodes.getNode('FilterParallelFilters') as unknown as {
      run: (...args: unknown[]) => unknown;
    } | null;
    if (!node) return null;
    const run = node.run.bind(node);
    node.run = (...args: unknown[]) => {
      const q = timer.pending.length < 4 ? gl.createQuery() : null;
      if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      const r = run(...args);
      if (q) {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        timer.pending.push(q);
      }
      return r;
    };
    return timer;
  }

  poll() {
    const gl = this.gl;
    while (this.pending.length > 0) {
      const q = this.pending[0]!;
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT))
        this.out(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
    }
  }
}
