// Effects (SPEC §15.2 layer 4) and projectiles (layer 3), from per-kind pools. Projectiles point
// along +x and rotate to their projected screen direction; arcing ones keep a ground shadow and sort
// by it. Colors follow the rule: amber ours, violet theirs, red only for danger.
import * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { ArtImage } from './atlas';
import { GROUND_SQUASH } from './camera';
import { placeFrame, type RenderContext } from './context';
import { bodyBurstPoints } from './effectsMath';
import { fk, MARK_FRAMES, scrapFrame } from './keys';
import { Pool } from './pool';
import { SHADOW_TEXTURE } from './textures';
import type {
  BurstKind,
  EffectSpawner,
  MarkKind,
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
  'bombard-shell': fk('bombard-shell'),
  boulder: fk('boulder'),
  'wasp-shot': fk('wasp-shot'),
} as const satisfies Record<ProjectileKind, string>;

/** Tumbling projectiles don't point along their heading. */
const TUMBLES = new Set<ProjectileKind>(['boulder', 'bombard-shell']);

/**
 * How each mark plays (RD5): its layer, the fraction of its time spent fading in, the fraction held
 * at full alpha before the fade out, and how much it grows (1 = none).
 */
const MARK_LOOK = {
  'slam-cracks': { layer: 'groundOverlay', fadeIn: 0, hold: 0.15, grow: 1 },
  'slam-cracks-wide': { layer: 'groundOverlay', fadeIn: 0, hold: 0.15, grow: 1 },
  'landing-dust': { layer: 'groundOverlay', fadeIn: 0, hold: 0.1, grow: 1.35 },
  'portal-flare': { layer: 'effects', fadeIn: 0.2, hold: 0.4, grow: 1 },
} as const satisfies Record<
  MarkKind,
  { layer: string; fadeIn: number; hold: number; grow: number }
>;
/** Marks lie over the map and under shadows, rings and units (layer 2). */
const MARK_DEPTH = -3e5;

/** Scrap shows this long before fading (default) and fades over this long. */
const SCRAP_SHOW_MS = 960;
const SCRAP_FADE_MS = 640;

interface Live {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;
  age: number;
  ttl: number;
  done: () => void;
  tick?: (u: number) => void;
  /** Hidden until this age, ms (staggered bursts). */
  delay?: number;
}

export { SHADOW_TEXTURE };

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
  /** Seeds bodyBurst placements (stable sequence, no randomness). */
  private seq = 0;
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
  private pool(name: string, layer: 'effects' | 'world' | 'groundOverlay'): Pool<ArtImage> {
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

  burst(kind: BurstKind, sx: number, sy: number, rotation = 0, delayMs = 0) {
    const pool = this.pool(BURST_FRAMES[kind], 'effects');
    const a = pool.get();
    a.img.setPosition(sx, sy).setRotation(rotation);
    const muzzle = kind.startsWith('muzzle');
    const rise = kind === 'heal-glint' || kind === 'nanite-mote';
    this.add(
      a.img,
      muzzle ? 90 : rise ? 520 : 320,
      () => pool.release(a),
      (u) => {
        a.img.setAlpha(rise ? Math.min(1, 4 * u) * (1 - u) * 1.3 : 1 - u);
        if (!muzzle) this.ctx.lib.setUnitScale(a, this.ctx.unitPx, 1 + 0.4 * u);
        if (rise) a.img.y = sy - 14 * u;
      },
      delayMs,
    );
  }

  bodyBurst(kind: 'heal-glint' | 'nanite-mote', footSx: number, footSy: number, heightPx: number) {
    for (const p of bodyBurstPoints(this.seq++))
      this.burst(kind, footSx + p.x * heightPx, footSy - p.y * heightPx, 0, p.delayMs);
  }

  mark(kind: MarkKind, sx: number, sy: number, ms = 1000, scale = 1) {
    const look = MARK_LOOK[kind];
    const pool = this.pool(MARK_FRAMES[kind], look.layer);
    const a = pool.get();
    a.img.setPosition(sx, sy).setDepth(look.layer === 'effects' ? sy : MARK_DEPTH);
    this.add(
      a.img,
      ms,
      () => pool.release(a),
      (u) => {
        const fadeOut =
          1 - Math.max(0, (u - look.hold - look.fadeIn) / (1 - look.hold - look.fadeIn));
        a.img.setAlpha(look.fadeIn > 0 ? Math.min(1, u / look.fadeIn) * fadeOut : fadeOut);
        this.ctx.lib.setUnitScale(a, this.ctx.unitPx, scale * (1 + (look.grow - 1) * u));
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

  scrap(side: ScrapSide, size: 1 | 2 | 3 | 4 | 5, sx: number, sy: number, holdMs = SCRAP_SHOW_MS) {
    const pool = this.pool(scrapFrame(side, size), 'world');
    const a = pool.get();
    a.img.setPosition(sx, sy).setDepth(sy);
    const ttl = holdMs + SCRAP_FADE_MS;
    this.add(
      a.img,
      ttl,
      () => pool.release(a),
      (u) => {
        const t = u * ttl;
        a.img.setAlpha(t < holdMs ? 1 : 1 - (t - holdMs) / SCRAP_FADE_MS);
      },
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

  arcWave(
    side: ScrapSide,
    x: number,
    y: number,
    r: number,
    angleRad: number,
    arcDeg: number,
    ms = 380,
  ) {
    const g = this.gfxPool.get();
    const cam = this.ctx.camera;
    const color = side === 'ours' ? theme.color.amber.num : theme.color.hostile.num;
    const core = side === 'ours' ? theme.color.ember.num : theme.color.hostileCore.num;
    const half = (arcDeg * Math.PI) / 360;
    const n = Math.max(6, Math.round(arcDeg / 8));
    const pts = (rad: number) =>
      Array.from({ length: n + 1 }, (_, i) => {
        const a = angleRad - half + (2 * half * i) / n;
        return cam.worldToScreen(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      });
    this.add(
      g,
      ms,
      () => this.gfxPool.release(g),
      (u) => {
        // The front rolls out fast and eases; a thinner hot core trails it.
        const front = r * (0.25 + 0.75 * (1 - (1 - u) * (1 - u)));
        g.clear();
        for (const [rad, w, c, a] of [
          [front, 5, color, 1 - u],
          [front * 0.92, 2, core, (1 - u) * 0.9],
        ] as const) {
          const p = pts(rad);
          g.lineStyle(w, c, a).beginPath().moveTo(p[0]!.sx, p[0]!.sy);
          for (const q of p.slice(1)) g.lineTo(q.sx, q.sy);
          g.strokePath();
        }
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

  private add(
    obj: Live['obj'],
    ttl: number,
    done: () => void,
    tick?: (u: number) => void,
    delay = 0,
  ) {
    this.live.push({ obj, age: 0, ttl, done, tick, delay });
    if (delay > 0) obj.setVisible(false);
    else tick?.(0);
  }

  update(dtMs: number) {
    if (this.live.length === 0) return;
    const keep: Live[] = [];
    for (const l of this.live) {
      l.age += dtMs;
      const d = l.delay ?? 0;
      if (l.age < d) {
        keep.push(l);
        continue;
      }
      if (d > 0 && !l.obj.visible) l.obj.setVisible(true);
      if (l.age - d >= l.ttl) l.done();
      else {
        l.tick?.((l.age - d) / l.ttl);
        keep.push(l);
      }
    }
    this.live = keep;
  }

  get active(): number {
    return this.live.length;
  }
}
