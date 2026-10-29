// Effects (SPEC §15.2 layer 4) and projectiles (layer 3), from per-kind pools. Projectiles point
// along +x and rotate to their projected screen direction; arcing ones keep a ground shadow and sort
// by it. Colors follow the rule: amber ours, violet theirs, red only for danger.
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { ArtImage } from './atlas';
import { GROUND_SQUASH } from './camera';
import { placeFrame, type RenderContext } from './context';
import { fk, scrapFrame } from './keys';
import { Pool } from './pool';
import type {
  BurstKind,
  EffectSpawner,
  ProjectileKind,
  ProjectileSprite,
  ScrapSide,
  ScreenPoint,
} from './types';

const BURST_FRAMES = {
  'spark-ours': fk('spark-ours'),
  'spark-theirs': fk('spark-theirs'),
  'heal-glint': fk('heal-glint'),
  'nanite-mote': fk('nanite-mote'),
  'muzzle-ours': fk('muzzle-ours'),
  'muzzle-theirs': fk('muzzle-theirs'),
} as const satisfies Record<BurstKind, string>;

const PROJECTILE_FRAMES = {
  bolt: fk('bolt'),
  'nanite-bolt': fk('nanite-bolt'),
  'mortar-shell': fk('mortar-shell'),
  'bombard-shell': fk('bombard-shell'),
  boulder: fk('boulder'),
  'wasp-shot': fk('wasp-shot'),
  'power-cell': fk('power-cell'),
} as const satisfies Record<ProjectileKind, string>;

/** Tumbling projectiles don't point along their heading. */
const TUMBLES = new Set<ProjectileKind>(['boulder', 'power-cell', 'mortar-shell', 'bombard-shell']);

interface Live {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  age: number;
  ttl: number;
  done: () => void;
  tick?: (u: number) => void;
}

export const SHADOW_TEXTURE = '__ff-shadow';

/** A soft ink ellipse texture (64 × 38, 0.6 ratio) for shadows. */
export function ensureShadowTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(SHADOW_TEXTURE)) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(theme.color.brandInk.num, 0.45).fillEllipse(32, 19, 64, 38);
  g.generateTexture(SHADOW_TEXTURE, 64, 38);
  g.destroy();
}

export class Effects implements EffectSpawner {
  private live: Live[] = [];
  readonly pools = new Map<string, Pool<ArtImage>>();
  private readonly gfxPool: Pool<Phaser.GameObjects.Graphics>;
  private readonly shadowPool: Pool<Phaser.GameObjects.Image>;

  constructor(private readonly ctx: RenderContext) {
    ensureShadowTexture(ctx.scene);
    this.gfxPool = new Pool(
      () => {
        const g = ctx.scene.make.graphics({}, false);
        ctx.layers.effects.add(g);
        return g;
      },
      (g, on) => {
        g.clear().setVisible(on).setAlpha(1);
      },
    );
    this.shadowPool = new Pool(
      () => {
        const img = new Phaser.GameObjects.Image(ctx.scene, 0, 0, SHADOW_TEXTURE);
        ctx.layers.groundOverlay.add(img);
        return img;
      },
      (img, on) => {
        img.setVisible(on);
      },
    );
  }

  /** Pool of images of one frame on one layer. */
  private pool(name: string, layer: 'effects' | 'world'): Pool<ArtImage> {
    const key = `${layer}:${name}`;
    let p = this.pools.get(key);
    if (!p) {
      p = new Pool(
        () => placeFrame(this.ctx, name, layer, -999, -999),
        (a, on) => {
          a.img.setVisible(on).setAlpha(1).setRotation(0);
          this.ctx.lib.setUnitScale(a, this.ctx.unitPx);
        },
      );
      this.pools.set(key, p);
    }
    return p;
  }

  burst(kind: BurstKind, sx: number, sy: number, rotation = 0) {
    const pool = this.pool(BURST_FRAMES[kind], 'effects');
    const a = pool.get();
    a.img.setPosition(sx, sy).setRotation(rotation);
    const muzzle = kind.startsWith('muzzle');
    this.add(
      a.img,
      muzzle ? 90 : 320,
      () => pool.release(a),
      (u) => {
        a.img.setAlpha(1 - u);
        if (!muzzle) this.ctx.lib.setUnitScale(a, this.ctx.unitPx, 1 + 0.4 * u);
        if (kind === 'heal-glint' || kind === 'nanite-mote') a.img.y = sy - 12 * u;
      },
    );
  }

  tracer(side: ScrapSide, from: ScreenPoint, to: ScreenPoint, ms = 120) {
    const g = this.gfxPool.get();
    const color = side === 'ours' ? theme.color.amber.num : theme.color.hostile.num;
    const core = side === 'ours' ? theme.color.ember.num : theme.color.hostileCore.num;
    g.lineStyle(3, color, 1).lineBetween(from.sx, from.sy, to.sx, to.sy);
    g.lineStyle(1, core, 1).lineBetween(from.sx, from.sy, to.sx, to.sy);
    this.add(
      g,
      ms,
      () => this.gfxPool.release(g),
      (u) => g.setAlpha(1 - u),
    );
  }

  scrap(side: ScrapSide, size: 1 | 2 | 3 | 4 | 5, sx: number, sy: number) {
    const pool = this.pool(scrapFrame(side, size), 'world');
    const a = pool.get();
    a.img.setPosition(sx, sy).setDepth(sy);
    this.add(
      a.img,
      1600,
      () => pool.release(a),
      (u) => a.img.setAlpha(u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4),
    );
  }

  wallStrike(from: ScreenPoint, to: ScreenPoint) {
    const pool = this.pool(fk('wall-strike'), 'effects');
    const a = pool.get();
    const len = Math.hypot(to.sx - from.sx, to.sy - from.sy);
    // Runs (0,0)–(100,0) in units: stretch x only so the bolt stays thin.
    this.ctx.lib.setUnitScale(a, this.ctx.unitPx, len / (100 * this.ctx.unitPx), 1);
    a.img.setPosition(from.sx, from.sy).setRotation(Math.atan2(to.sy - from.sy, to.sx - from.sx));
    this.add(
      a.img,
      140,
      () => pool.release(a),
      (u) => a.img.setAlpha(u < 0.5 ? 1 : 2 - 2 * u),
    );
  }

  ring(side: ScrapSide | 'danger', x: number, y: number, r: number, ms = 450) {
    const g = this.gfxPool.get();
    const { sx, sy } = this.ctx.camera.worldToScreen(x, y);
    const { rx, ry } = this.ctx.camera.groundEllipse(r);
    const color =
      side === 'ours'
        ? theme.color.amber.num
        : side === 'theirs'
          ? theme.color.hostile.num
          : theme.color.danger.num;
    this.add(
      g,
      ms,
      () => this.gfxPool.release(g),
      (u) => {
        g.clear()
          .lineStyle(3, color, 1 - u)
          .strokeEllipse(sx, sy, 2 * rx * (0.3 + 0.7 * u), 2 * ry * (0.3 + 0.7 * u));
      },
    );
  }

  /** A pooled projectile; `release()` returns it. */
  projectile(kind: ProjectileKind): ProjectileSprite {
    const pool = this.pool(PROJECTILE_FRAMES[kind], 'world');
    const a = pool.get();
    const shadow = this.shadowPool.get();
    const ctx = this.ctx;
    let spin = 0;
    return {
      kind,
      set(x, y, z, heading) {
        const ground = ctx.camera.worldToScreen(x, y);
        const p = ctx.camera.worldToScreen(x, y, z);
        // Arcing projectiles sort by their shadow (§2.5).
        a.img.setPosition(p.sx, p.sy).setDepth(ground.sy);
        if (TUMBLES.has(kind)) a.img.setRotation((spin += 0.12));
        else a.img.setRotation(Math.atan2(Math.sin(heading) * GROUND_SQUASH, Math.cos(heading)));
        const s = Math.max(0.25, 0.5 - z * 0.05);
        shadow
          .setPosition(ground.sx, ground.sy)
          .setScale(s, s)
          .setVisible(z > 0.05);
      },
      release() {
        pool.release(a);
        shadow.setVisible(false);
      },
    };
  }

  private add(obj: Live['obj'], ttl: number, done: () => void, tick?: (u: number) => void) {
    this.live.push({ obj, age: 0, ttl, done, tick });
    tick?.(0);
  }

  update(dtMs: number) {
    if (this.live.length === 0) return;
    const keep: Live[] = [];
    for (const l of this.live) {
      l.age += dtMs;
      if (l.age >= l.ttl) l.done();
      else {
        l.tick?.(l.age / l.ttl);
        keep.push(l);
      }
    }
    this.live = keep;
  }

  get active(): number {
    return this.live.length;
  }
}
