// The generic build life cycle on the TV (SPEC §7.5, §15.2; RD5): flight (the `flight` frame spun and
// arced over its ground shadow), `landed` until it switches on, `active`, `damaged` below half HP,
// `destroyed` briefly. Around it: the faint dotted amber effect-radius ellipse, an amber HP bar only
// once damaged, and an optional footprint (`shield-base`) and cycling dome (`shield-shimmer-*`).
// A build view in `scene/builds/<build>.ts` only names its frames.
// Frame-cost rule (§15.2): everything is made once. A frame change is a `setFrame` on a phase change
// and never between two phases; per frame only position, alpha and scale move (no Graphics, no text).
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { ArtImage } from './atlas';
import { buildBarShown, throwSpin } from './buildLook';
import { TILE_W } from './camera';
import { placeFrame, type RenderContext } from './context';
import { HpBar } from './hpBar';
import {
  DOTTED_RING_TEXTURE,
  DOTTED_RING_W,
  ensureDottedRing,
  makeImage,
  SHADOW_TEXTURE,
} from './textures';
import type { BuildPhase, BuildView, BuildViewState, FrameKey } from './types';

/** Draw depths on the ground overlay layer: shadow, then footprint and ring, under the units' marks. */
const SHADOW_DEPTH = -4e5;
const GROUND_DEPTH = -3e5;
/** The shadow texture's px size (effects.ts `ensureShadowTexture`). */
const SHADOW_TEX = { w: 64, h: 38 };
/** The damaged glow's flicker: alpha swings between 1 and 1 − depth at this rate (Hz). */
const FLICKER_HZ = 7;
const FLICKER_DEPTH = 0.22;
/** Gap between a build's top and its HP bar, px. */
const BAR_GAP = 9;

export interface BuildLook {
  frames: Readonly<Record<BuildPhase, FrameKey>>;
  /** Ground footprint under a working build (`shield-base`). */
  base?: FrameKey;
  /** Effects-layer frames of a working build, one shown at a time at `fps` (`shield-shimmer-1…3`). */
  cycle?: { frames: readonly FrameKey[]; fps: number };
  /** Shadow radii in sprite units (full width and height of the ellipse). */
  shadow: readonly [number, number];
  /** HP bar width, px. */
  barPx: number;
  /** Draw the dotted effect-radius ellipse (a build with an effect radius). */
  radiusRing: boolean;
  /** Opacity while `active` (a mine once live: 0.4, translucent to players; default 1). */
  liveAlpha?: number;
  /** The frame during a trigger delay, at full opacity (`BuildViewState.triggered`, mines). */
  trigger?: FrameKey;
}

const WORKING = new Set<BuildPhase>(['active', 'damaged']);
const STANDING = new Set<BuildPhase>(['landed', 'active', 'damaged']);

export class LifecycleBuild implements BuildView {
  private readonly body: ArtImage;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image | null;
  private readonly base: ArtImage | null;
  private readonly cycle: ArtImage[];
  private readonly bar: HpBar;
  private phase: BuildPhase | null = null;
  private triggered = false;
  private cycleAt = -1;
  private alpha = 1;
  private ringRx = -1;

  constructor(
    private readonly ctx: RenderContext,
    private readonly look: BuildLook,
  ) {
    const { scene, lib, layers, unitPx } = ctx;
    this.body = lib.image(look.frames.landed);
    lib.setUnitScale(this.body, unitPx);
    layers.world.add(this.body.img);
    this.shadow = makeImage(scene, SHADOW_TEXTURE);
    this.shadow.setDepth(SHADOW_DEPTH);
    layers.groundOverlay.add(this.shadow);
    if (look.radiusRing) {
      ensureDottedRing(scene);
      this.ring = makeImage(scene, DOTTED_RING_TEXTURE);
      this.ring.setDepth(GROUND_DEPTH).setVisible(false);
      layers.groundOverlay.add(this.ring);
    } else this.ring = null;
    this.base = look.base
      ? placeFrame(ctx, look.base, 'groundOverlay', -999, -999, { sortY: GROUND_DEPTH })
      : null;
    this.base?.img.setVisible(false);
    this.cycle = (look.cycle?.frames ?? []).map((f) => {
      const a = placeFrame(ctx, f, 'effects', -999, -999);
      a.img.setVisible(false).setAlpha(0);
      return a;
    });
    this.bar = new HpBar(ctx, theme.color.amber.num, look.barPx);
  }

  update(s: Readonly<BuildViewState>, _dtMs: number) {
    const { ctx, look } = this;
    const triggered = look.trigger !== undefined && s.triggered === true;
    if (s.phase !== this.phase || triggered !== this.triggered) this.setPhase(s.phase, triggered);
    const flying = s.phase === 'flight';
    const lift = s.z * TILE_W * ctx.camera.scale;

    // Body: upright on its ground point; in flight it spins about its center above the point.
    const img = this.body.img;
    img.setDepth(s.sy);
    if (flying) {
      const vb = this.body.vb;
      img.setPosition(s.sx, s.sy - lift + (vb[1] + vb[3] / 2) * ctx.unitPx);
      img.setRotation(throwSpin(s.flightU));
    } else {
      img.setPosition(s.sx, s.sy);
      const a = triggered
        ? 1
        : s.phase === 'damaged'
          ? this.flicker(s.clockMs)
          : s.phase === 'active'
            ? (look.liveAlpha ?? 1)
            : 1;
      if (a !== this.alpha) {
        this.alpha = a;
        img.setAlpha(a);
        // A translucent build's shadow fades with it, or the shadow would give a hidden mine away.
        if (look.liveAlpha !== undefined) this.shadow.setAlpha(a);
      }
    }

    // The shadow stays on the ground and shrinks as the throw climbs.
    const k = flying ? Math.max(0.5, 1 - s.z * 0.18) : 1;
    this.shadow
      .setPosition(s.sx, s.sy)
      .setScale(
        (look.shadow[0] * ctx.unitPx * k) / SHADOW_TEX.w,
        (look.shadow[1] * ctx.unitPx * k) / SHADOW_TEX.h,
      );

    if (this.ring && STANDING.has(s.phase)) {
      const { rx } = ctx.camera.groundEllipse(s.radius);
      if (rx !== this.ringRx) {
        this.ringRx = rx;
        const sc = (2 * rx) / DOTTED_RING_W;
        this.ring.setScale(sc, sc);
      }
      this.ring.setPosition(s.sx, s.sy);
    }
    if (this.base && WORKING.has(s.phase)) this.base.img.setPosition(s.sx, s.sy);

    // The dome cycles by alpha over pre-made images (no frame swap per tick).
    if (look.cycle && WORKING.has(s.phase)) {
      const i = Math.floor((s.clockMs / 1000) * look.cycle.fps) % this.cycle.length;
      if (i !== this.cycleAt) {
        this.cycle[this.cycleAt]?.img.setAlpha(0);
        this.cycle[i]!.img.setAlpha(1);
        this.cycleAt = i;
      }
      for (const c of this.cycle) c.img.setPosition(s.sx, s.sy);
    }

    if (buildBarShown(s.phase, s.hpFrac))
      this.bar.set(s.sx, s.sy + this.body.vb[1] * ctx.unitPx - BAR_GAP, s.hpFrac);
    else this.bar.hide();
  }

  /** Alpha of the damaged frame's flicker at a clock time. */
  private flicker(clockMs: number): number {
    return 1 - FLICKER_DEPTH * (0.5 + 0.5 * Math.sin((clockMs / 1000) * FLICKER_HZ * Math.PI * 2));
  }

  private setPhase(next: BuildPhase, triggered = false) {
    const { lib, unitPx } = this.ctx;
    const prev = this.phase;
    this.phase = next;
    this.triggered = triggered;
    const frame = triggered ? this.look.trigger! : this.look.frames[next];
    lib.setFrame(this.body, frame);
    // Thrown, it turns about its center; landed, it stands on its anchor.
    if (next === 'flight') {
      const vb = this.body.vb;
      lib.setOrigin(this.body, [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2]);
    } else {
      lib.setOrigin(this.body, lib.anchor(frame));
      if (prev === 'flight' || prev === null) this.body.img.setRotation(0);
    }
    lib.setUnitScale(this.body, unitPx);
    this.alpha = 1;
    this.body.img.setAlpha(1);
    if (this.look.liveAlpha !== undefined) this.shadow.setAlpha(1);
    this.ring?.setVisible(STANDING.has(next));
    this.base?.img.setVisible(WORKING.has(next));
    for (const c of this.cycle) c.img.setVisible(WORKING.has(next));
    this.ringRx = -1;
  }

  destroy() {
    this.body.img.destroy();
    this.shadow.destroy();
    this.ring?.destroy();
    this.base?.img.destroy();
    for (const c of this.cycle) c.img.destroy();
    this.bar.destroy();
  }
}
