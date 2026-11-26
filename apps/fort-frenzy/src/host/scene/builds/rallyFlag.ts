// The Commander's rally flag on the TV (SPEC §2.4, §7.5; RD9). In flight, `rally-flag/flight-pole`,
// `flight-cloth` (his color) and `flight-trim` spin together about their anchor over a ground shadow;
// planted, the amber ring lies under the pole, cloth (his color) and trim. Frame-cost rule (§15.2):
// everything is made once; in flight only position and rotation move, planted nothing does.
import type * as Phaser from 'phaser';
import type { ArtImage } from '../../render/atlas';
import { throwSpin } from '../../render/buildLook';
import { TILE_W } from '../../render/camera';
import { placeFrame, type RenderContext } from '../../render/context';
import { fk } from '../../render/keys';
import { makeImage, SHADOW_TEXTURE } from '../../render/textures';
import type { BuildView, BuildViewFactory, BuildViewState } from '../../render/types';

const SHADOW_DEPTH = -4e5;
/** The shadow texture's px size (effects.ts `ensureShadowTexture`). */
const SHADOW_TEX = { w: 64, h: 38 };
/** Shadow size in sprite units (full width and height of the ellipse). */
const SHADOW: readonly [number, number] = [26, 15];

class RallyFlagView implements BuildView {
  private readonly flying: ArtImage[];
  private readonly planted: ArtImage[];
  private readonly clothes: ArtImage[];
  private readonly shadow: Phaser.GameObjects.Image;
  private tint: number | null = null;
  private inFlight: boolean | null = null;

  constructor(private readonly ctx: RenderContext) {
    const at = (name: Parameters<typeof placeFrame>[1], layer: 'world' | 'groundOverlay') => {
      const a = placeFrame(ctx, name, layer, -999, -999);
      a.img.setVisible(false);
      return a;
    };
    const flightCloth = at(fk('rally-flag/flight-cloth'), 'world');
    const cloth = at(fk('rally-flag/cloth'), 'world');
    this.flying = [
      at(fk('rally-flag/flight-pole'), 'world'),
      flightCloth,
      at(fk('rally-flag/flight-trim'), 'world'),
    ];
    this.planted = [
      at(fk('rally-flag/ring'), 'groundOverlay'),
      at(fk('rally-flag/pole'), 'world'),
      cloth,
      at(fk('rally-flag/cloth-trim'), 'world'),
    ];
    this.clothes = [flightCloth, cloth];
    this.shadow = makeImage(ctx.scene, SHADOW_TEXTURE);
    this.shadow.setDepth(SHADOW_DEPTH).setVisible(false);
    ctx.layers.groundOverlay.add(this.shadow);
  }

  update(s: Readonly<BuildViewState>) {
    if (s.ownerTint !== undefined && s.ownerTint !== this.tint) {
      this.tint = s.ownerTint;
      for (const c of this.clothes) c.img.setTint(s.ownerTint);
    }
    const flying = s.phase === 'flight';
    if (flying !== this.inFlight) {
      this.inFlight = flying;
      for (const a of this.flying) a.img.setVisible(flying);
      for (const a of this.planted) a.img.setVisible(!flying);
      this.shadow.setVisible(flying);
      if (!flying) this.plant(s);
    }
    if (!flying) return;
    const { camera, unitPx } = this.ctx;
    const lift = s.z * TILE_W * camera.scale;
    const spin = throwSpin(s.flightU);
    this.flying.forEach((a, i) => {
      a.img
        .setPosition(s.sx, s.sy - lift)
        .setRotation(spin)
        .setDepth(s.sy + i * 0.001);
    });
    const k = Math.max(0.5, 1 - s.z * 0.18);
    this.shadow
      .setPosition(s.sx, s.sy)
      .setScale((SHADOW[0] * unitPx * k) / SHADOW_TEX.w, (SHADOW[1] * unitPx * k) / SHADOW_TEX.h);
  }

  /** Once, on landing: the planted frames at the ground point, sorted pole, cloth, trim. */
  private plant(s: Readonly<BuildViewState>) {
    this.planted.forEach((a, i) => {
      a.img.setPosition(s.sx, s.sy).setDepth(s.sy + Math.max(0, i - 1) * 0.001);
    });
  }

  destroy() {
    for (const a of [...this.flying, ...this.planted]) a.img.destroy();
    this.shadow.destroy();
  }
}

export const view: BuildViewFactory = {
  id: 'rally_flag',
  create: (ctx) => new RallyFlagView(ctx),
};
