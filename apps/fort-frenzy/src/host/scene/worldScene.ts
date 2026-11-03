// The Phaser `World` scene (SPEC §15.2): loads the theme's atlases, then each frame advances the
// runtime and draws the run through `WorldView`. Between runs it draws nothing (the DOM overlay
// shows home and the lobby); a new run restarts the scene so every object is rebuilt.
import * as Phaser from 'phaser';
import { manifest } from '../../../generated/manifest';
import { theme } from '../../shared/theme';
import { neonKnightsHost } from '../../themes/neon-knights/host';
import type { ThemeAssets } from '../../themes/types';
import type { Content } from '../../content';
import { pickAtlasScale, preloadAtlases } from '../render/atlas';
import { CANVAS_H, CANVAS_W } from '../render/camera';
import { RenderWorld } from '../render/world';
import { WorldView, type FrameInput } from './worldView';

export interface SceneHost {
  readonly runId: number;
  readonly content: Content;
  frame(deltaMs: number): FrameInput | null;
  /** Atlas progress 0..1; null when ready. */
  onLoading(progress: number | null): void;
  /** After every frame (the DOM overlay refresh). */
  afterFrame?(): void;
}

const assets = manifest.themes['neon-knights'] as ThemeAssets;

export class WorldScene extends Phaser.Scene {
  private world: RenderWorld | null = null;
  private view: WorldView | null = null;
  private runId = -1;
  private readonly scale1x2: 1 | 2;

  constructor(private readonly host: SceneHost) {
    super('world');
    this.scale1x2 = pickAtlasScale();
  }

  preload() {
    const fresh = neonKnightsHost.atlases.filter((a) => !this.textures.exists(a.key));
    if (fresh.length > 0) this.load.on('progress', (p: number) => this.host.onLoading(p));
    preloadAtlases(this, fresh, this.scale1x2);
  }

  create() {
    this.host.onLoading(null);
    // `?bloom=0` turns the bloom off (e2e under software GL; the C1 quarter-res fallback lives in bloom.ts).
    const bloom = new URLSearchParams(location.search).get('bloom') !== '0';
    this.world = new RenderWorld(this, neonKnightsHost, assets, this.scale1x2, { bloom });
    this.view = null;
    this.runId = this.host.runId;
  }

  /** Dev fallback shapes drawn so far (e2e asserts none). */
  get fallbacks(): number {
    return this.world?.lib.fallbacks ?? 0;
  }

  override update(_time: number, delta: number) {
    const f = this.host.frame(delta);
    if (this.host.runId !== this.runId) {
      // A run started or ended: rebuild from scratch next frame.
      this.scene.restart();
      this.host.afterFrame?.();
      return;
    }
    if (f && this.world) {
      this.view ??= new WorldView(this.world, this.host.content);
      this.view.update(f);
    }
    this.host.afterFrame?.();
  }
}

/** The TV's Phaser game: 1920 × 1080, no Phaser scaling (the shared CSS fit transform scales it). */
export function createWorldGame(parent: HTMLElement, host: SceneHost): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: theme.color.background.hex,
    scale: { mode: Phaser.Scale.NONE },
    scene: [new WorldScene(host)],
  });
}
