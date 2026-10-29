// Ground marks on layer 2 (SPEC §2.1, §2.4, §2.5): shadows, player rings (a thin outline in the
// player's color, never filled, with a notch toward the aim), carried-cell pips and hitbox overlays.
// Immediate mode: callers draw every frame between begin() and end(); pips come from a pool.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { ArtImage } from './atlas';
import { placeFrame, type RenderContext } from './context';
import { carryPips, ellipsePoint } from './ground';
import { PIP_FRAMES } from './keys';
import { Pool } from './pool';

export class GroundMarks {
  private readonly shadows: Phaser.GameObjects.Graphics;
  private readonly rings: Phaser.GameObjects.Graphics;
  private readonly overlay: Phaser.GameObjects.Graphics;
  private readonly pips: Pool<ArtImage>;
  private used: ArtImage[] = [];

  constructor(private readonly ctx: RenderContext) {
    const g = () => {
      const gfx = ctx.scene.make.graphics({}, false);
      ctx.layers.groundOverlay.add(gfx);
      return gfx;
    };
    this.shadows = g().setDepth(-1e6);
    this.rings = g().setDepth(1e6);
    this.overlay = ctx.scene.make.graphics({}, false);
    ctx.layers.worldUi.add(this.overlay);
    this.pips = new Pool(
      () => {
        const a = placeFrame(ctx, PIP_FRAMES.empty, 'groundOverlay', 0, 0, { sortY: 2e6 });
        return a;
      },
      (a, on) => a.img.setVisible(on),
    );
  }

  begin() {
    this.shadows.clear();
    this.rings.clear();
    this.overlay.clear();
    for (const a of this.used) this.pips.release(a);
    this.used = [];
  }

  /** A 0.6 ellipse centered on the footprint (§2.5), size in sprite units. */
  shadow(sx: number, sy: number, wUnits: number, hUnits: number, alpha = 0.4) {
    const k = this.ctx.unitPx;
    this.shadows
      .fillStyle(theme.color.brandInk.num, alpha)
      .fillEllipse(sx, sy, wUnits * k, hUnits * k);
  }

  /** Player ring for a world radius (tiles), with the aim notch (world-ground radians). */
  ring(sx: number, sy: number, rTiles: number, color: number, aimRad: number | null) {
    const { rx, ry } = this.ctx.camera.groundEllipse(rTiles);
    const w = theme.stroke.ring;
    this.rings.lineStyle(w, color, 1).strokeEllipse(sx, sy, rx * 2, ry * 2);
    if (aimRad !== null) {
      const tip = ellipsePoint(sx, sy, rx + 7, ry + 7 * 0.6, aimRad);
      const l = ellipsePoint(sx, sy, rx, ry, aimRad - 0.22);
      const r = ellipsePoint(sx, sy, rx, ry, aimRad + 0.22);
      this.rings.fillStyle(color, 1).fillTriangle(tip.x, tip.y, l.x, l.y, r.x, r.y);
    }
  }

  /** Carried cells: one slot per point of the cap, filled left to right, only while carrying (§2.4). */
  carry(sx: number, sy: number, rTiles: number, carried: number, cap: number) {
    const k = this.ctx.unitPx;
    const { rx, ry } = this.ctx.camera.groundEllipse(rTiles);
    // The §15.2 formula is in sprite units: convert the ring to units and back.
    for (const p of carryPips(carried, cap, 0, 0, rx / k, ry / k)) {
      const a = this.pips.get();
      this.ctx.lib.setFrame(a, p.filled ? PIP_FRAMES.full : PIP_FRAMES.empty);
      this.ctx.lib.setUnitScale(a, k);
      a.img.setPosition(sx + p.x * k, sy + p.y * k);
      this.used.push(a);
    }
  }

  /** Hitbox / range overlay: the sim circle as its 0.6 ellipse (§2.5). */
  hitbox(sx: number, sy: number, rTiles: number, color: number = theme.color.select.num) {
    const { rx, ry } = this.ctx.camera.groundEllipse(rTiles);
    this.overlay.lineStyle(1.5, color, 0.9).strokeEllipse(sx, sy, rx * 2, ry * 2);
  }
}
