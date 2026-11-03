// Atlas loading and frame placement (SPEC §15.2, §15.10). The TV picks the 2× atlases when the
// canvas's device-pixel height exceeds 1.5 × 1080. Frames are placed in sprite units: an image's
// origin is a point in its frame's viewBox, and its scale maps the texture's px back to units.
// A missing frame draws a labeled dev-only fallback shape (counted, so the gallery e2e can assert
// none); production builds fail in the atlas script instead.
import * as Phaser from 'phaser';
import { ICON_FRAME_PREFIX, UNLIT_SUFFIX } from '../../../generated/keys';
import type { AtlasRef, FrameMeta, Point, ThemeAssets, ViewBox } from '../../themes/types';
import { CANVAS_H } from './camera';

/** `?atlas=1|2` forces a scale; otherwise device-pixel height of the fitted canvas > 1.5 × 1080. */
export function pickAtlasScale(): 1 | 2 {
  const forced = new URLSearchParams(location.search).get('atlas');
  if (forced === '1' || forced === '2') return Number(forced) as 1 | 2;
  const fit = Math.min(innerWidth / 1920, innerHeight / CANVAS_H);
  return fit * CANVAS_H * (devicePixelRatio || 1) > 1.5 * CANVAS_H ? 2 : 1;
}

export function preloadAtlases(scene: Phaser.Scene, atlases: readonly AtlasRef[], scale: 1 | 2) {
  for (const a of atlases) if (a.scale === scale) scene.load.atlas(a.key, a.image, a.json);
}

/** An image placed by sprite units. */
export interface ArtImage {
  img: Phaser.GameObjects.Image;
  name: string;
  vb: ViewBox;
  /** Texture px per sprite unit (≈ 0.6 at 1×, 1.2 at 2×). */
  ppuX: number;
  ppuY: number;
  unlit: boolean;
  /** Origin in sprite units, kept across frame swaps. */
  origin: Point;
}

export class ArtLibrary {
  readonly frames: Readonly<Record<string, FrameMeta>>;
  /** Fallback shapes drawn so far (dev); the gallery e2e asserts 0. */
  fallbacks = 0;
  readonly missing = new Set<string>();
  private readonly where = new Map<string, string>();
  private readonly dev: boolean;

  constructor(
    private readonly scene: Phaser.Scene,
    theme: ThemeAssets,
    atlases: readonly AtlasRef[],
    readonly scale: 1 | 2,
    dev = import.meta.env.DEV,
  ) {
    this.frames = theme.frames;
    this.dev = dev;
    for (const a of atlases) {
      if (a.scale !== scale || !scene.textures.exists(a.key)) continue;
      for (const f of scene.textures.get(a.key).getFrameNames()) this.where.set(f, a.key);
    }
  }

  has(name: string): boolean {
    return this.where.has(name);
  }

  hasUnlit(name: string): boolean {
    return this.where.has(name + UNLIT_SUFFIX);
  }

  /** viewBox of a frame (icons: their raster size at 1 px per unit). */
  viewBox(name: string): ViewBox {
    const meta = this.frames[name];
    if (meta) return meta.viewBox;
    if (name.startsWith(ICON_FRAME_PREFIX)) {
      const key = this.where.get(name);
      if (key) {
        const f = this.scene.textures.getFrame(key, name);
        return [0, 0, f.realWidth / this.scale, f.realHeight / this.scale];
      }
      return [0, 0, 24, 24];
    }
    return [0, 0, 40, 40];
  }

  anchor(name: string): Point {
    return this.frames[name]?.anchor ?? [0, 0];
  }

  /** A new image (not added to any layer) for `name`, origin at `origin` units (default anchor). */
  image(name: string, origin?: Point, unlit = false): ArtImage {
    const img = new Phaser.GameObjects.Image(this.scene, 0, 0, '__WHITE');
    const art: ArtImage = {
      img,
      name,
      vb: this.viewBox(name),
      ppuX: 1,
      ppuY: 1,
      unlit: false,
      origin: origin ?? this.anchor(name),
    };
    this.setFrame(art, name, unlit);
    this.setOrigin(art, origin ?? this.anchor(name));
    return art;
  }

  /** Swaps the frame (or its `@unlit` variant when there is one); keeps the origin in units. */
  setFrame(art: ArtImage, name: string, unlit = false) {
    const wantUnlit = unlit && this.hasUnlit(name);
    const atlasName = wantUnlit ? name + UNLIT_SUFFIX : name;
    const key = this.where.get(atlasName);
    art.name = name;
    art.vb = this.viewBox(name);
    art.unlit = wantUnlit;
    if (key) art.img.setTexture(key, atlasName);
    else art.img.setTexture(this.fallbackTexture(name, art.vb));
    const f = art.img.frame;
    art.ppuX = f.realWidth / art.vb[2];
    art.ppuY = f.realHeight / art.vb[3];
    this.setOrigin(art, art.origin);
  }

  setOrigin(art: ArtImage, origin: Point) {
    art.origin = origin;
    art.img.setDisplayOrigin(
      (origin[0] - art.vb[0]) * art.ppuX,
      (origin[1] - art.vb[1]) * art.ppuY,
    );
  }

  /** Scale so one sprite unit is `unitPx` screen px (times extra factors). */
  setUnitScale(art: ArtImage, unitPx: number, sx = 1, sy = sx) {
    art.img.setScale((sx * unitPx) / art.ppuX, (sy * unitPx) / art.ppuY);
  }

  private fallbackTexture(name: string, vb: ViewBox): string {
    this.fallbacks++;
    const key = `__fallback:${name}`;
    if (this.scene.textures.exists(key)) return key;
    if (!this.missing.has(name)) {
      this.missing.add(name);
      console.warn(`render: missing frame ${name}${this.dev ? ' (fallback shape)' : ''}`);
    }
    const w = Math.max(8, Math.ceil(vb[2] * 0.6 * this.scale));
    const h = Math.max(8, Math.ceil(vb[3] * 0.6 * this.scale));
    const tex = this.scene.textures.createCanvas(key, w, h);
    const ctx = tex?.getContext();
    if (tex && ctx && this.dev) {
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#ff00ff';
      ctx.font = `${Math.max(8, Math.min(14, w / 8))}px sans-serif`;
      ctx.fillText(name, 3, Math.min(h - 3, 14));
      tex.refresh();
    }
    return key;
  }
}
