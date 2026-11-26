// Aim previews (SPEC §10.1, §15.2; C3, C4): while a phone aims, the TV draws the attack's real hit
// area (sim `aimPreview`): a transparent amber bar as wide as the bolt's hitbox for a single bolt
// (C4), a transparent amber-filled sector for arcs, cones and spread volleys, the same bar at the
// attack's own width for rectangles (the shield bash, RD9-fix-1), and a filled 0.6 ellipse for circles (all ground overlay, under the units). Ours is amber; the fill and edge stay
// dim enough to sit under the bloom threshold. Draws into the caller's pooled Graphics with no
// per-vertex allocation: the §2.5 projection is linear on the ground, so vertices are the center
// plus scaled offsets.
import type * as Phaser from 'phaser';
import type { HitShape, SoldierPreview } from '../sim';

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
    case 'line':
      // The bolt's hit width across.
      drawStrip(ground, f, c, s, shape.range, boltRadius, color);
      return;
    case 'rect':
      // The bash's solid rectangle: exactly what the sim hits (classes/sector.ts `inStrip`).
      drawStrip(ground, f, c, s, shape.range, shape.width / 2, color);
      return;
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

/**
 * A strip from the feet along the aim (unit `c`, `s`), `range` long and `half` tiles either side
 * (C4: the cones' fill and edge).
 */
function drawStrip(
  ground: Phaser.GameObjects.Graphics,
  f: GroundFrame,
  c: number,
  s: number,
  range: number,
  half: number,
  color: number,
): void {
  const ex = c * range * f.kx;
  const ey = s * range * f.ky;
  const px = -s * half * f.kx;
  const py = c * half * f.ky;
  ground.beginPath();
  ground.moveTo(f.sx + px, f.sy + py);
  ground.lineTo(f.sx + ex + px, f.sy + ey + py);
  ground.lineTo(f.sx + ex - px, f.sy + ey - py);
  ground.lineTo(f.sx - px, f.sy - py);
  ground.closePath();
  ground.fillStyle(color, AIM_FILL_ALPHA).fillPath();
  ground.lineStyle(2, color, AIM_EDGE_ALPHA).strokePath();
}

// ---- thrown builds (SPEC §7.3, §10.1; RD5) ----------------------------------------------------------

/** The throw-range ring's edge alpha: fainter than the landing spot, it only frames the reach. */
export const THROW_RANGE_ALPHA = 0.28;
/**
 * The landing spot (the sim's `buildPreview` or `soldierPreview`: one source for the sim and the TV)
 * as a filled 0.6 ellipse at the build's effect radius (a thrown soldier: his body), plus the throw
 * range as a faint ring around the knight (`f` is the knight's ground frame). Ground overlay, under
 * the units.
 */
export function drawThrowPreview(
  ground: Phaser.GameObjects.Graphics,
  pv: SoldierPreview,
  f: GroundFrame,
  color: number,
): void {
  const rr = { rx: pv.range * f.kx, ry: pv.range * f.ky };
  ground.lineStyle(1.5, color, THROW_RANGE_ALPHA).strokeEllipse(f.sx, f.sy, rr.rx * 2, rr.ry * 2);
  const lx = f.sx + (pv.landing.x - pv.from.x) * f.kx;
  const ly = f.sy + (pv.landing.y - pv.from.y) * f.ky;
  const rx = pv.radius * f.kx;
  const ry = pv.radius * f.ky;
  ground.fillStyle(color, AIM_FILL_ALPHA).fillEllipse(lx, ly, rx * 2, ry * 2);
  ground.lineStyle(2, color, AIM_EDGE_ALPHA).strokeEllipse(lx, ly, rx * 2, ry * 2);
}
