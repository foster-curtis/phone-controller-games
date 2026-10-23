// Ghosts (SPEC §6.0, §6.2): steam wisps. A ghost is a steam-white ghost-shaped wisp with ink eyes
// and a player-color ring that also shows the pulse cooldown (full = ready). The ~0.4 s wind-up is a
// steam ring growing out to the real pulse radius (everything inside gets pushed); the puff is an
// expanding steam ring plus puffs. All steam-colored.
import type * as Phaser from 'phaser';
import type { ColorToken } from '../../shared/theme';
import { theme } from '../../shared/theme';
import { SIM_CONFIG } from '../sim/config';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const GHOST_RADIUS = SIM_CONFIG.ghost.radius;
export const PULSE_RADIUS = SIM_CONFIG.ghost.pulseRadius;
export const PUFF_MS = 500;
const TAU = Math.PI * 2;

/** Radius of the telegraph ring: grows from 0 to the real pulse radius over the wind-up. */
export function windupRadius(windup: number): number {
  return PULSE_RADIUS * clamp01(windup);
}

/** Ring fill showing pulse readiness: 1 = ready, 0 = just fired. */
export function readyFill(cooldown: number): number {
  return 1 - clamp01(cooldown);
}

export interface Puff {
  x: number;
  y: number;
  start: number;
}

/** Pulse puffs in flight (spawned from sim `pulse` events). */
export class PuffTracker {
  private puffs: Puff[] = [];

  add(x: number, y: number, now: number): void {
    this.puffs.push({ x, y, start: now });
  }

  /** Puffs still visible at `now`, with 0..1 progress. */
  active(now: number): (Puff & { t: number })[] {
    this.puffs = this.puffs.filter((p) => now - p.start < PUFF_MS);
    return this.puffs.map((p) => ({ ...p, t: (now - p.start) / PUFF_MS }));
  }
}

function steam(g: Phaser.GameObjects.Graphics, alpha: number): void {
  g.fillStyle(theme.translucent.steam.num, Math.min(1, theme.translucent.steam.alpha * alpha));
}

export interface GhostDrawOptions {
  x: number;
  y: number;
  color: ColorToken;
  windup: number;
  cooldown: number;
  now: number;
}

export function drawGhost(g: Phaser.GameObjects.Graphics, o: GhostDrawOptions): void {
  const bob = Math.sin(o.now / 320) * 4;
  const x = o.x;
  const y = o.y + bob;
  const r = GHOST_RADIUS;

  // Pulse telegraph: dashed target circle at the real pulse radius + a growing steam ring.
  if (o.windup > 0) {
    g.lineStyle(theme.stroke.sticker, theme.translucent.steam.num, 0.45);
    const dashes = 28;
    for (let i = 0; i < dashes; i += 2) {
      g.beginPath();
      g.arc(x, o.y, PULSE_RADIUS, (i / dashes) * TAU, ((i + 1) / dashes) * TAU, false);
      g.strokePath();
    }
    steam(g, 0.35 * o.windup);
    g.fillCircle(x, o.y, windupRadius(o.windup));
    g.lineStyle(10, theme.translucent.steam.num, 0.95);
    g.strokeCircle(x, o.y, windupRadius(o.windup));
  }

  // Rising wisps above the body.
  for (let i = 0; i < 3; i++) {
    const phase = (((o.now / 1400 + i / 3) % 1) + 1) % 1;
    steam(g, 1 - phase);
    g.fillCircle(x + Math.sin(phase * 6 + i * 2) * 14, y - r - phase * 34, 6 + (1 - phase) * 4);
  }

  // Body: dome + wavy hem.
  const pts: { x: number; y: number }[] = [];
  for (let a = Math.PI; a <= TAU + 1e-6; a += Math.PI / 12) {
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 1.05 });
  }
  const hemSteps = 12;
  for (let i = 0; i <= hemSteps; i++) {
    const t = i / hemSteps;
    const wave = Math.sin(t * Math.PI * 6 + o.now / 150) * 4;
    pts.push({ x: x + r - t * 2 * r, y: y + r * 0.95 + wave });
  }
  steam(g, 1.6);
  g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true, true);
  g.lineStyle(theme.stroke.sticker, theme.translucent.steam.num, 0.9);
  g.strokePoints(pts as unknown as Phaser.Math.Vector2[], true, true);

  // Eyes: ink dots.
  g.fillStyle(theme.color.eggOutline.num, 0.9);
  g.fillCircle(x - r * 0.35, y - r * 0.1, 4);
  g.fillCircle(x + r * 0.35, y - r * 0.1, 4);
  g.fillEllipse(x, y + r * 0.35, 8, 10);

  // Player-color ring: readiness (full = pulse ready; fills back up during the cooldown).
  const ringR = r + 14;
  const ready = readyFill(o.cooldown);
  g.lineStyle(7, theme.color.stickerOutline.num, 0.6);
  g.strokeCircle(x, y, ringR);
  g.lineStyle(5, o.color.num, 0.35);
  g.strokeCircle(x, y, ringR);
  if (ready > 0) {
    g.lineStyle(5, o.color.num, 1);
    g.beginPath();
    g.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + TAU * ready, false);
    g.strokePath();
  }
}

/** The puff: an expanding, fading steam ring with puffs thrown outward. */
export function drawPuff(g: Phaser.GameObjects.Graphics, p: Puff & { t: number }): void {
  const out = 1 - (1 - p.t) * (1 - p.t);
  const fade = 1 - p.t;
  g.lineStyle(12 * fade + 2, theme.translucent.steam.num, 0.9 * fade);
  g.strokeCircle(p.x, p.y, GHOST_RADIUS + (PULSE_RADIUS - GHOST_RADIUS) * out);
  steam(g, fade);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.3;
    const d = PULSE_RADIUS * (0.35 + 0.65 * out);
    g.fillCircle(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 14 * (1 - p.t * 0.6));
  }
}
