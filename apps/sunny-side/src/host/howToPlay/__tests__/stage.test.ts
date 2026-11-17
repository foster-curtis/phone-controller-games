import type * as Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import type { IllustrationRig, IllustrationScript } from '../types';
import { createStage, slotViewport } from '../stage';
import { createFakeScene } from './fakeScene';

interface SceneConfig {
  create(this: Phaser.Scene): void;
  update?: (time: number, delta: number) => void;
}

function fakeGame() {
  const scenes = new Map<string, SceneConfig>();
  const handlers = new Map<string, Set<unknown>>();
  const cams: { viewport: number[]; zoom: number; center: number[] }[] = [];
  const game = {
    canvas: { getBoundingClientRect: () => ({ left: 100, top: 50, width: 960, height: 540 }) },
    scene: {
      add: (key: string, config: SceneConfig) => void scenes.set(key, config),
      remove: (key: string) => void scenes.delete(key),
      bringToTop: () => {},
    },
    scale: {
      on: (e: string, fn: unknown) => {
        if (!handlers.has(e)) handlers.set(e, new Set());
        handlers.get(e)!.add(fn);
      },
      off: (e: string, fn: unknown) => void handlers.get(e)?.delete(fn),
    },
  } as unknown as Phaser.Game;
  /** Runs a scene's create the way Phaser does, with a camera that records what it is given. */
  const boot = (key: string) => {
    const fake = createFakeScene();
    const cam = { viewport: [] as number[], zoom: 0, center: [] as number[] };
    cams.push(cam);
    const scene = fake.scene as unknown as Record<string, unknown>;
    scene.cameras = {
      main: {
        setViewport: (...a: number[]) => void (cam.viewport = a),
        setZoom: (z: number) => void (cam.zoom = z),
        centerOn: (...a: number[]) => void (cam.center = a),
      },
    };
    scenes.get(key)!.create.call(fake.scene);
    return { cam, scene: fake.scene };
  };
  const resizeHandlers = () => handlers.get('resize')?.size ?? 0;
  return { game, scenes, boot, resizeHandlers, cams };
}

const slot = {
  getBoundingClientRect: () => ({ left: 200, top: 100, width: 480, height: 270 }),
} as unknown as HTMLElement;

function script() {
  const draws: number[] = [];
  let destroyed = 0;
  const s: IllustrationScript = {
    id: 't',
    loopMs: 1000,
    stillMs: 300,
    create: (): IllustrationRig => ({
      draw: (t) => void draws.push(t),
      destroy: () => void destroyed++,
    }),
  };
  return { s, draws, destroyed: () => destroyed };
}

describe('slotViewport', () => {
  it('converts the slot rect to game pixels and fits the box', () => {
    // Canvas shown at half size: 1 CSS px = 2 game px (width 1920 vs 960 CSS).
    const v = slotViewport(
      { left: 100, top: 50, width: 960 },
      { left: 200, top: 100, width: 480, height: 270 },
      1920,
    );
    expect(v).toMatchObject({ x: 200, y: 100, width: 960, height: 540, zoom: 1 });
  });

  it('letterboxes by the smaller axis and survives an empty slot', () => {
    const wide = slotViewport(
      { left: 0, top: 0, width: 1920 },
      { left: 0, top: 0, width: 1920, height: 540 },
      1920,
    );
    expect(wide.zoom).toBe(1);
    const empty = slotViewport(
      { left: 0, top: 0, width: 1920 },
      { left: 0, top: 0, width: 0, height: 0 },
      1920,
    );
    expect(empty.zoom).toBeGreaterThan(0);
  });
});

describe('stage', () => {
  it('animated mount draws loop time each frame, then destroy leaves nothing', () => {
    const f = fakeGame();
    const { s, draws, destroyed } = script();
    const stage = createStage(f.game);
    const h = stage.mount(s, slot, { reducedMotion: false });
    expect(f.scenes.size).toBe(1);
    const [key, config] = [...f.scenes][0]!;
    const { cam } = f.boot(key);
    expect(cam.viewport).toEqual([200, 100, 960, 540]);
    expect(cam.zoom).toBe(1);
    expect(cam.center).toEqual([480, 270]);
    config.update!(5000, 16);
    config.update!(5250, 16);
    config.update!(6300, 16);
    expect(draws).toEqual([0, 250, 300]);
    expect(f.resizeHandlers()).toBe(1);
    h.destroy();
    h.destroy();
    expect(destroyed()).toBe(1);
    expect(f.scenes.size).toBe(0);
    expect(f.resizeHandlers()).toBe(0);
    config.update!(7000, 16);
    expect(draws).toHaveLength(3);
  });

  it('reduced motion draws the still once and has no per-frame work', () => {
    const f = fakeGame();
    const { s, draws } = script();
    const stage = createStage(f.game);
    const h = stage.mount(s, slot, { reducedMotion: true });
    const [key, config] = [...f.scenes][0]!;
    expect(config.update).toBeUndefined();
    f.boot(key);
    expect(draws).toEqual([300]);
    expect(f.resizeHandlers()).toBe(1);
    h.destroy();
    expect(draws).toEqual([300]);
    expect(f.resizeHandlers()).toBe(0);
    expect(f.scenes.size).toBe(0);
  });

  it('destroy before the scene created is safe', () => {
    const f = fakeGame();
    const { s, draws, destroyed } = script();
    const h = createStage(f.game).mount(s, slot, { reducedMotion: false });
    const [key, config] = [...f.scenes][0]!;
    h.destroy();
    expect(f.scenes.size).toBe(0);
    // Phaser may still run a queued create: it must build nothing.
    config.create.call(createFakeScene().scene);
    expect(destroyed()).toBe(0);
    expect(draws).toEqual([]);
    expect(f.resizeHandlers()).toBe(0);
    expect(key).toContain('htp');
  });

  it('stage.destroy cleans live handles and is idempotent', () => {
    const f = fakeGame();
    const a = script();
    const b = script();
    const stage = createStage(f.game);
    stage.mount(a.s, slot, { reducedMotion: false });
    stage.mount(b.s, slot, { reducedMotion: true });
    for (const key of f.scenes.keys()) f.boot(key);
    expect(f.scenes.size).toBe(2);
    stage.destroy();
    stage.destroy();
    expect(f.scenes.size).toBe(0);
    expect(a.destroyed()).toBe(1);
    expect(b.destroyed()).toBe(1);
    expect(f.resizeHandlers()).toBe(0);
    // Mounting after destroy does nothing.
    stage.mount(a.s, slot, { reducedMotion: false });
    expect(f.scenes.size).toBe(0);
  });
});
