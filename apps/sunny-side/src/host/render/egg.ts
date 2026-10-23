// The egg (SPEC §6.0), code-drawn in the brand mark's style: an irregular egg-white blob with an
// ink outline, a yolk with its own outline and a shine dot, inside an outer player-color ring.
// Charging a slam squashes the egg flatter and heats the yolk; a hit makes the blob jiggle.
import type * as Phaser from 'phaser';
import type { ColorToken } from '../../shared/theme';
import { theme } from '../../shared/theme';
import { lerpColor } from './sticker';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Max vertical flattening at full charge. */
export const SQUASH_MAX = 0.22;
/** How long a hit keeps the blob wobbling. */
export const JIGGLE_MS = 500;
/** Player ring thickness outside the ink outline, px. */
export const RING_WIDTH = 6;

/** Flatness 0..SQUASH_MAX; strictly increasing in charge. */
export function eggSquash(charge: number): number {
  return clamp01(charge) * SQUASH_MAX;
}

/** Yolk heat 0..1 (yolk color to heat, plus a halo); strictly increasing in charge. */
export function yolkGlow(charge: number): number {
  return clamp01(charge);
}

/** Stable pseudo-random phases from a player id, so each egg's blob is slightly different. */
export function hashSeed(id: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const a = ((h >>> 0) % 628) / 100;
  const b = (((h >>> 8) >>> 0) % 628) / 100;
  return [a, b];
}

/** Signed deformation `elapsedMs` after a hit of strength `amp` (0..1): damped wobble, 0 once done. */
export function jiggleAt(elapsedMs: number, amp: number): number {
  if (elapsedMs < 0 || elapsedMs >= JIGGLE_MS) return 0;
  const t = elapsedMs / JIGGLE_MS;
  return amp * (1 - t) * (1 - t) * Math.cos(elapsedMs / 28);
}

/** Tracks the last hit per egg. Times are scene milliseconds. */
export class JiggleTracker {
  private readonly hits = new Map<string, { start: number; amp: number }>();

  /** `speed` = relative collision speed (px/s). */
  hit(id: string, speed: number, now: number): void {
    const amp = Math.min(1, Math.max(0.35, speed / 700));
    this.hits.set(id, { start: now, amp });
  }

  /** Whether a hit is still wobbling the egg. */
  active(id: string, now: number): boolean {
    const h = this.hits.get(id);
    return !!h && now - h.start < JIGGLE_MS;
  }

  /** Current signed deformation for the egg. */
  amount(id: string, now: number): number {
    const h = this.hits.get(id);
    if (!h) return 0;
    const e = now - h.start;
    if (e >= JIGGLE_MS) {
      this.hits.delete(id);
      return 0;
    }
    return jiggleAt(e, h.amp);
  }

  clear(): void {
    this.hits.clear();
  }
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * Outline of the blob around (0,0): an irregular egg radius, flattened by `squash` (shorter and
 * wider) and wobbled by `jiggle` (signed).
 */
export function blobPoints(
  radius: number,
  seed: [number, number],
  squash: number,
  jiggle: number,
  count = 40,
): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    let r = radius * (1 + 0.06 * Math.sin(2 * a + seed[0]) + 0.045 * Math.sin(3 * a + seed[1]));
    r *= 1 + jiggle * 0.2 * Math.cos(2 * a + seed[0]) + jiggle * 0.1 * Math.cos(3 * a);
    pts.push({
      x: Math.cos(a) * r * (1 + squash * 0.55),
      y: Math.sin(a) * r * (1 - squash),
    });
  }
  return pts;
}

export interface EggDrawOptions {
  x: number;
  y: number;
  radius: number;
  id: string;
  color: ColorToken;
  /** 0..1 slam charge. */
  charge: number;
  /** Signed jiggle from `JiggleTracker.amount`. */
  jiggle: number;
  /** Facing (radians), shifts the yolk a little. */
  angle: number;
  alpha?: number;
}

/** Yolk fill at a glow level: yolk token toward heat token. */
export function yolkColor(glow: number): number {
  return lerpColor(theme.color.yolk.num, theme.color.heat.num, glow);
}

export function drawEgg(g: Phaser.GameObjects.Graphics, o: EggDrawOptions): void {
  const alpha = o.alpha ?? 1;
  const squash = eggSquash(o.charge);
  const glow = yolkGlow(o.charge);
  const seed = hashSeed(o.id);
  // The squashed egg sits on the pan: keep its bottom where it was.
  const drop = squash * o.radius;
  const pts = blobPoints(o.radius, seed, squash, o.jiggle).map((p) => ({
    x: p.x + o.x,
    y: p.y + o.y + drop,
  }));
  const ink = theme.stroke.sticker;

  // Outer player-color ring (outside the ink outline), then ink, then the egg white.
  g.lineStyle((ink + RING_WIDTH) * 2, o.color.num, alpha);
  g.strokePoints(pts as unknown as Phaser.Math.Vector2[], true, true);
  g.lineStyle(ink * 2, theme.color.eggOutline.num, alpha);
  g.strokePoints(pts as unknown as Phaser.Math.Vector2[], true, true);
  g.fillStyle(theme.color.eggWhite.num, alpha);
  g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true, true);

  // Yolk: heats up and spreads with charge; wobbles opposite the jiggle.
  const yr = o.radius * (0.44 + 0.06 * glow);
  const yx = o.x + Math.cos(o.angle) * o.radius * 0.1 - o.jiggle * o.radius * 0.18;
  const yy = o.y + Math.sin(o.angle) * o.radius * 0.1 + drop;
  if (glow > 0) {
    g.fillStyle(theme.color.heat.num, 0.55 * glow * alpha);
    g.fillCircle(yx, yy, yr * (1.15 + 0.5 * glow));
  }
  g.fillStyle(yolkColor(glow), alpha);
  g.fillCircle(yx, yy, yr);
  g.lineStyle(ink, theme.color.eggOutline.num, alpha);
  g.strokeCircle(yx, yy, yr);
  g.fillStyle(theme.color.yolkShine.num, alpha);
  g.fillCircle(yx - yr * 0.32, yy - yr * 0.36, yr * 0.24);
}
