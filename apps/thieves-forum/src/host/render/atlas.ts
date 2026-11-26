// Atlas loading and frame placement (SPEC §12.2, §12.10). Adapted from Fort Frenzy
// (`src/host/render/atlas.ts`): extraction candidate, BUILD_PLAN §8. The TV picks the 2× atlases
// when the fitted canvas's device-pixel height exceeds 1.5 × 1080. A frame is a stack of raster
// layers (one per tint run, scripts/build-atlases.ts); a piece places them all at one origin in the
// frame's own units. A missing frame draws a labeled dev-only fallback shape, counted so the gallery
// e2e can assert none.
import * as Phaser from 'phaser';
import type { AtlasRef } from './assets';
import { CANVAS_H } from './camera';
import type { FrameKey, FrameMeta, Point, TintSlot, Tints, ViewBox } from './types';

/** `?atlas=1|2` forces a scale; otherwise device-pixel height of the fitted canvas > 1.5 × 1080. */
export function pickAtlasScale(): 1 | 2 {
  const forced = new URLSearchParams(location.search).get('atlas');
  if (forced === '1' || forced === '2') return Number(forced) as 1 | 2;
  const fit = Math.min(innerWidth / 1920, innerHeight / CANVAS_H);
  return fit * CANVAS_H * (devicePixelRatio || 1) > 1.5 * CANVAS_H ? 2 : 1;
}

export function preloadAtlases(scene: Phaser.Scene, atlases: readonly AtlasRef[], scale: 1 | 2) {
  for (const a of atlases)
    if (a.scale === scale && !scene.textures.exists(a.key))
      scene.load.atlas(a.key, a.image, a.json);
}

export interface ArtLayer {
  img: Phaser.GameObjects.Image;
  tint: TintSlot | null;
}

/** One frame's layers, placed together. */
export interface ArtPiece {
  name: string;
  vb: ViewBox;
  origin: Point;
  layers: ArtLayer[];
  /** Texture px per frame unit. */
  ppuX: number;
  ppuY: number;
}

export class ArtLibrary {
  /** Fallback shapes drawn so far (dev); the gallery e2e asserts 0. */
  fallbacks = 0;
  readonly missing = new Set<string>();
  private readonly where = new Map<string, string>();

  constructor(
    private readonly scene: Phaser.Scene,
    readonly frames: Readonly<Record<string, FrameMeta>>,
    atlases: readonly AtlasRef[],
    readonly scale: 1 | 2,
    private readonly dev = import.meta.env.DEV,
  ) {
    for (const a of atlases) {
      if (a.scale !== scale || !scene.textures.exists(a.key)) continue;
      for (const f of scene.textures.get(a.key).getFrameNames()) this.where.set(f, a.key);
    }
  }

  has(name: string): boolean {
    const meta = this.frames[name];
    return !!meta && meta.layers.every((l) => this.where.has(l.atlas));
  }

  /** New images for `name` (not added to any display list), origin at `origin` frame units. */
  piece(name: FrameKey, origin?: Point): ArtPiece {
    const meta = this.frames[name];
    const vb: ViewBox = meta?.viewBox ?? [0, 0, 40, 40];
    const at = origin ?? meta?.anchor ?? [0, 0];
    const layers: ArtLayer[] = [];
    if (meta && this.has(name)) {
      for (const l of meta.layers) {
        const img = new Phaser.GameObjects.Image(
          this.scene,
          0,
          0,
          this.where.get(l.atlas)!,
          l.atlas,
        );
        layers.push({ img, tint: l.tint });
      }
    } else {
      layers.push({
        img: new Phaser.GameObjects.Image(this.scene, 0, 0, this.fallbackTexture(name, vb)),
        tint: null,
      });
    }
    const f = layers[0]!.img.frame;
    const piece: ArtPiece = {
      name,
      vb,
      origin: at,
      layers,
      ppuX: f.realWidth / vb[2],
      ppuY: f.realHeight / vb[3],
    };
    this.setOrigin(piece, at);
    return piece;
  }

  setOrigin(p: ArtPiece, origin: Point) {
    p.origin = origin;
    for (const l of p.layers)
      l.img.setDisplayOrigin((origin[0] - p.vb[0]) * p.ppuX, (origin[1] - p.vb[1]) * p.ppuY);
  }

  private fallbackTexture(name: string, vb: ViewBox): string {
    this.fallbacks++;
    const key = `__fallback:${name}`;
    if (this.scene.textures.exists(key)) return key;
    if (!this.missing.has(name)) {
      this.missing.add(name);
      console.warn(`render: missing frame ${name}${this.dev ? ' (fallback shape)' : ''}`);
    }
    const w = Math.max(8, Math.ceil(vb[2] * 2 * this.scale));
    const h = Math.max(8, Math.ceil(vb[3] * 2 * this.scale));
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

/** Places every layer of a piece. `unitPx` = screen px per frame unit (times extra scale). */
export function placePiece(
  p: ArtPiece,
  x: number,
  y: number,
  unitPx: number,
  rotation = 0,
  sx = 1,
  sy = sx,
) {
  for (const l of p.layers) {
    l.img.setPosition(x, y).setRotation(rotation);
    l.img.setScale((sx * unitPx) / p.ppuX, (sy * unitPx) / p.ppuY);
  }
}

/** Multiplies each tint layer by its slot's color (untinted when the slot has none). */
export function tintPiece(p: ArtPiece, tints: Tints) {
  for (const l of p.layers) {
    const c = l.tint ? tints[l.tint] : undefined;
    if (c === undefined) l.img.clearTint();
    else l.img.setTint(c);
  }
}

export function setPieceAlpha(p: ArtPiece, alpha: number) {
  for (const l of p.layers) l.img.setAlpha(alpha);
}

export function setPieceVisible(p: ArtPiece, visible: boolean) {
  for (const l of p.layers) l.img.setVisible(visible);
}

export function addPiece(
  p: ArtPiece,
  parent: Phaser.GameObjects.Container | Phaser.GameObjects.Layer,
) {
  for (const l of p.layers) parent.add(l.img);
}

export function destroyPiece(p: ArtPiece) {
  for (const l of p.layers) l.img.destroy();
}
