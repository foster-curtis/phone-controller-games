// Slam charge ring (SPEC §6.6): a ring around the charging egg that fills with charge, in the
// player's color (a deliberate tell for opponents). A brief flash fires once per charge at max.
import type * as Phaser from 'phaser';
import type { ColorToken } from '../../shared/theme';
import { theme } from '../../shared/theme';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const SLAM_FLASH_MS = 350;
export const SLAM_RING_WIDTH = 9;

/** Fraction of the ring that is filled: exactly the egg's slam charge. */
export function slamRingFill(charge: number): number {
  return clamp01(charge);
}

/**
 * Detects the max-charge flash per egg: fires once when `slamMax` turns true, and re-arms only
 * after the charge has dropped below max (released or reset).
 */
export class MaxFlashTracker {
  private readonly fired = new Set<string>();
  private readonly flashes = new Map<string, number>();

  /** Feed each frame's egg state; returns true on the frame the flash starts. */
  update(id: string, slamMax: boolean, slamCharge: number, now: number): boolean {
    if (!slamMax && slamCharge < 1) this.fired.delete(id);
    if (slamMax && !this.fired.has(id)) {
      this.fired.add(id);
      this.flashes.set(id, now);
      return true;
    }
    return false;
  }

  /** 0..1 flash strength remaining (1 right at the flash, 0 when over). */
  flash(id: string, now: number): number {
    const start = this.flashes.get(id);
    if (start === undefined) return 0;
    const t = (now - start) / SLAM_FLASH_MS;
    if (t >= 1) {
      this.flashes.delete(id);
      return 0;
    }
    return 1 - Math.max(0, t);
  }
}

/** Draws the ring: a dim full track, then the filled arc clockwise from the top. */
export function drawSlamRing(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  color: ColorToken,
  charge: number,
  flash: number,
): void {
  const fill = slamRingFill(charge);
  if (fill <= 0 && flash <= 0) return;
  const start = -Math.PI / 2;
  g.lineStyle(SLAM_RING_WIDTH + theme.stroke.sticker * 2, theme.color.stickerOutline.num, 0.7);
  g.strokeCircle(x, y, radius);
  g.lineStyle(SLAM_RING_WIDTH, color.num, 0.3);
  g.strokeCircle(x, y, radius);
  if (fill > 0) {
    g.lineStyle(SLAM_RING_WIDTH, color.num, 1);
    g.beginPath();
    g.arc(x, y, radius, start, start + Math.PI * 2 * fill, false);
    g.strokePath();
  }
  if (flash > 0) {
    g.lineStyle(SLAM_RING_WIDTH + 8 * flash, theme.color.yolkShine.num, flash);
    g.strokeCircle(x, y, radius + 10 * (1 - flash));
  }
}
