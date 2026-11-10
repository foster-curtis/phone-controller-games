// Aim previews (SPEC §10.1, §15.2; C3, C4): while a phone aims, the TV draws the attack's real hit
// area (sim `aimPreview`): a transparent amber bar as wide as the bolt's hitbox for a single bolt
// (C4), a transparent amber-filled sector for arcs, cones and spread volleys, and a filled 0.6
// ellipse for circles (all ground overlay, under the units). Ours is amber; the fill and edge stay
// dim enough to sit under the bloom threshold. Draws into the caller's pooled Graphics with no
// per-vertex allocation: the §2.5 projection is linear on the ground, so vertices are the center
// plus scaled offsets.
import type * as Phaser from 'phaser';
import type { HitShape } from '../sim';

/** Fill and edge alpha: amber over the dark floor stays below the bloom's brightness cut (§15.2). */
export const AIM_FILL_ALPHA = 0.16;
export const AIM_EDGE_ALPHA = 0.45;
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
 * Draws `shape` aimed at world-ground angle `angle` (radians) on `ground`. `boltRadius` is a single
 * bolt's hit radius in tiles (`rules.projectileRadius`, the sim's projectile `r`): its bar is twice
 * that wide.
 */
export function drawAimPreview(
  ground: Phaser.GameObjects.Graphics,
  shape: HitShape,
  f: GroundFrame,
  angle: number,
  color: number,
  boltRadius: number,
): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  switch (shape.kind) {
    case 'line': {
      // A strip along the aim, the bolt's hit width across (C4: the cones' fill and edge).
      const ex = c * shape.range * f.kx;
      const ey = s * shape.range * f.ky;
      const px = -s * boltRadius * f.kx;
      const py = c * boltRadius * f.ky;
      ground.beginPath();
      ground.moveTo(f.sx + px, f.sy + py);
      ground.lineTo(f.sx + ex + px, f.sy + ey + py);
      ground.lineTo(f.sx + ex - px, f.sy + ey - py);
      ground.lineTo(f.sx - px, f.sy - py);
      ground.closePath();
      ground.fillStyle(color, AIM_FILL_ALPHA).fillPath();
      ground.lineStyle(2, color, AIM_EDGE_ALPHA).strokePath();
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
