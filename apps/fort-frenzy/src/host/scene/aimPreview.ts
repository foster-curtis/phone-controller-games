// Aim previews (SPEC §10.1, §15.2; C3): while a phone aims, the TV draws the attack's real hit area
// (sim `aimPreview`): a dashed amber line for a single bolt (world UI), a transparent amber-filled
// sector for arcs, cones and spread volleys, and a filled 0.6 ellipse for circles (ground overlay,
// under the units). Ours is amber; the fill and edge stay dim enough to sit under the bloom
// threshold. Draws into the caller's pooled Graphics with no per-vertex allocation: the §2.5
// projection is linear on the ground, so vertices are the center plus scaled offsets.
import type * as Phaser from 'phaser';
import type { HitShape } from '../sim';

/** Fill and edge alpha: amber over the dark floor stays below the bloom's brightness cut (§15.2). */
export const AIM_FILL_ALPHA = 0.16;
export const AIM_EDGE_ALPHA = 0.45;
const DASH_PX = 14;
/** Arc vertices per radian of opening (smooth at the stomp's reach). */
const ARC_STEPS_PER_RAD = 10;

export interface GroundFrame {
  /** Screen position of the attacker's feet (z = 0). */
  sx: number;
  sy: number;
  /** Screen px per tile across (W·k) and down-field (W·k·0.6). */
  kx: number;
  ky: number;
}

/**
 * Draws `shape` aimed at world-ground angle `angle` (radians): fills go on `ground`, the bolt line
 * on `ui`.
 */
export function drawAimPreview(
  ground: Phaser.GameObjects.Graphics,
  ui: Phaser.GameObjects.Graphics,
  shape: HitShape,
  f: GroundFrame,
  angle: number,
  color: number,
): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  switch (shape.kind) {
    case 'line': {
      const ex = f.sx + c * shape.range * f.kx;
      const ey = f.sy + s * shape.range * f.ky;
      const n = Math.max(1, Math.floor(Math.hypot(ex - f.sx, ey - f.sy) / DASH_PX));
      ui.lineStyle(3, color, 0.85);
      for (let i = 0; i < n; i += 2) {
        const u0 = i / n;
        const u1 = Math.min(1, (i + 1) / n);
        ui.lineBetween(
          f.sx + (ex - f.sx) * u0,
          f.sy + (ey - f.sy) * u0,
          f.sx + (ex - f.sx) * u1,
          f.sy + (ey - f.sy) * u1,
        );
      }
      return;
    }
    case 'cone': {
      const r = shape.range;
      const steps = Math.max(4, Math.ceil(2 * shape.half * ARC_STEPS_PER_RAD));
      ground.beginPath();
      ground.moveTo(f.sx, f.sy);
      for (let i = 0; i <= steps; i++) {
        const a = angle - shape.half + (2 * shape.half * i) / steps;
        ground.lineTo(f.sx + Math.cos(a) * r * f.kx, f.sy + Math.sin(a) * r * f.ky);
      }
      ground.closePath();
      ground.fillStyle(color, AIM_FILL_ALPHA).fillPath();
      ground.lineStyle(2, color, AIM_EDGE_ALPHA).strokePath();
      return;
    }
    case 'circle': {
      const rx = shape.radius * f.kx;
      const ry = shape.radius * f.ky;
      ground.fillStyle(color, AIM_FILL_ALPHA).fillEllipse(f.sx, f.sy, rx * 2, ry * 2);
      ground.lineStyle(2, color, AIM_EDGE_ALPHA).strokeEllipse(f.sx, f.sy, rx * 2, ry * 2);
      return;
    }
    case 'none':
      return;
  }
}
