// `?gallery=1` art gallery (SPEC §6.21, §12.7; BUILD_PLAN TF1), in dev or with `?debug=1`: one page at
// a time (`&page=` one of `PAGES` in pages.ts, buttons on top), rebuilt on
// every switch. `window.__pcgGallery` reports readiness, fallback shapes and the stress FPS for e2e.
// Frozen at TF0 (BUILD_PLAN §3): the `mount(root)` signature.
import { debugEnabled } from '@pcg/game-kit';
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { ATLASES, MANIFEST } from '../render/assets';
import { pickAtlasScale, preloadAtlases } from '../render/atlas';
import { CANVAS_H, CANVAS_W } from '../render/camera';
import { RenderWorld } from '../render/world';
import { PAGE_BUILDERS, PAGES, type PageId, type PageKit } from './pages';
import { runStress } from './stress';

export interface GalleryProbe {
  ready: boolean;
  page: PageId;
  fallbacks: number;
  missing: string[];
  atlasScale: 1 | 2;
  rigs: number;
  /** Stress page only. */
  fps?: number;
  parts?: number;
}

declare global {
  interface Window {
    __pcgGallery?: GalleryProbe;
  }
}

function readPage(): PageId {
  const p = new URLSearchParams(location.search).get('page');
  return (PAGES as readonly string[]).includes(p ?? '') ? (p as PageId) : 'citizen';
}

const scale = pickAtlasScale();

class GalleryScene extends Phaser.Scene {
  private world!: RenderWorld;
  private ticks: ((dt: number, t: number) => void)[] = [];
  private t = 0;
  private fpsText: Phaser.GameObjects.Text | null = null;
  private stress: ReturnType<typeof runStress> | null = null;

  constructor() {
    super('gallery');
  }

  preload() {
    preloadAtlases(this, ATLASES, scale);
  }

  create() {
    const page = readPage();
    this.ticks = [];
    this.t = 0;
    this.stress = null;
    this.fpsText = null;
    this.world = new RenderWorld(this, scale);
    const kit: PageKit = {
      world: this.world,
      label: (text, x, y, size = 14) => {
        const t = this.add
          .text(x, y, text, {
            fontFamily: theme.font.sans,
            fontSize: `${size}px`,
            color: theme.color.muted.hex,
            align: 'center',
          })
          .setOrigin(0.5, 0);
        this.world.layers.overlay.add(t);
      },
      tick: (fn) => this.ticks.push(fn),
    };
    if (page === 'stress') {
      this.stress = runStress(kit);
      this.fpsText = this.add
        .text(CANVAS_W - 24, 64, '', {
          fontFamily: theme.font.mono,
          fontSize: '28px',
          color: theme.color.gold.hex,
          backgroundColor: theme.color.background.hex,
        })
        .setOrigin(1, 0)
        .setDepth(10);
    } else PAGE_BUILDERS[page](kit);
    this.world.update(0);
    window.__pcgGallery = {
      ready: true,
      page,
      fallbacks: this.world.lib.fallbacks,
      missing: [...this.world.lib.missing],
      atlasScale: scale,
      rigs: this.world.rigs.size,
    };
  }

  override update(_time: number, delta: number) {
    const dt = Math.min(delta, 100);
    this.t += dt;
    for (const fn of this.ticks) fn(dt, this.t);
    this.world.update(dt);
    const probe = window.__pcgGallery;
    if (!probe) return;
    probe.fallbacks = this.world.lib.fallbacks;
    probe.missing = [...this.world.lib.missing];
    if (this.stress && this.fpsText) {
      probe.fps = this.stress.fps();
      probe.parts = this.stress.parts();
      this.fpsText.setText(
        `${probe.fps.toFixed(0)} fps · ${this.world.rigs.size} rigs · ${probe.parts} images`,
      );
    }
  }
}

function nav(): HTMLElement {
  const el = document.createElement('nav');
  el.id = 'gallery-nav';
  el.style.cssText =
    'position:fixed;top:8px;left:8px;z-index:10;display:flex;gap:6px;flex-wrap:wrap;' +
    'font:14px var(--font-sans, sans-serif)';
  const current = readPage();
  for (const p of PAGES) {
    const a = document.createElement('a');
    const q = new URLSearchParams(location.search);
    q.set('page', p);
    a.href = `?${q.toString()}`;
    a.textContent = p;
    a.dataset.page = p;
    a.style.cssText =
      'padding:4px 10px;border-radius:999px;text-decoration:none;border:1px solid var(--border);' +
      `color:var(--foreground);background:${p === current ? 'var(--surface-strong)' : 'var(--surface)'}`;
    el.append(a);
  }
  return el;
}

export function mount(root: HTMLElement): void {
  root.dataset.mode = 'gallery';
  if (!debugEnabled(import.meta.env.DEV)) {
    root.textContent = 'The art gallery needs a dev build or ?debug=1.';
    return;
  }
  const stage = document.createElement('div');
  stage.style.cssText = `position:fixed;inset:0;background:${theme.color.background.hex}`;
  root.append(stage, nav());
  // Count every frame the manifest knows, for a quick look in the console.
  console.info(`gallery: ${Object.keys(MANIFEST.frames).length} frames, atlas ${scale}×`);
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: stage,
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: theme.color.surface.hex,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
    scene: [GalleryScene],
  });
}
