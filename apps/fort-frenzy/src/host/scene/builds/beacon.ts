// The Artificer's healing beacon on the TV (SPEC §7.4, §7.5, §15.2; RD8): the generic life cycle plus
// the `beacon-pulse` ring, scaled out to the heal radius and faded each time the sim pulses. The ring
// is made once and only moved, scaled and faded (frame-cost rule); healed knights' glints come from
// the sim's `heal` events (scene/supportView.ts).
import { LifecycleBuild } from '../../render/buildKit';
import type { ArtImage } from '../../render/atlas';
import { placeFrame, type RenderContext } from '../../render/context';
import { BEACON_PULSE, BEACON_PULSE_R, BUILD_FRAMES } from '../../render/keys';
import type { BuildView, BuildViewFactory, BuildViewState } from '../../render/types';

/** How long one ring takes to reach the radius and fade, ms. */
export const PULSE_MS = 650;
const PULSE_FROM = 0.25;
const PULSE_ALPHA = 0.85;
/** Just above the life cycle's shadow and dotted ring on the ground overlay. */
const RING_DEPTH = -2.9e5;

/** The ring at `u` (0..1) of its life: its share of the heal radius, and its alpha. */
export function pulseLook(u: number): { scale: number; alpha: number } {
  const k = Math.min(1, Math.max(0, u));
  const eased = 1 - (1 - k) * (1 - k);
  return { scale: PULSE_FROM + (1 - PULSE_FROM) * eased, alpha: PULSE_ALPHA * (1 - k) };
}

class BeaconView implements BuildView {
  private readonly body: LifecycleBuild;
  private readonly ring: ArtImage;
  private seen: number | null | undefined = undefined;
  /** Ms into the current ring; null while none shows. */
  private age: number | null = null;

  constructor(private readonly ctx: RenderContext) {
    this.body = new LifecycleBuild(ctx, {
      frames: BUILD_FRAMES.beacon,
      shadow: [30, 18],
      barPx: 40,
      radiusRing: true,
    });
    this.ring = placeFrame(ctx, BEACON_PULSE, 'groundOverlay', -999, -999, { sortY: RING_DEPTH });
    this.ring.img.setAlpha(0);
  }

  update(s: Readonly<BuildViewState>, dtMs: number) {
    this.body.update(s, dtMs);
    const pulse = s.nextPulse ?? null;
    // The first frame only learns the value: a beacon that comes back on a resume hasn't pulsed.
    if (this.seen !== undefined && pulse !== null && pulse !== this.seen) this.age = 0;
    this.seen = pulse;
    if (this.age === null) return;
    const { ctx, ring } = this;
    if (this.age >= PULSE_MS || s.phase === 'destroyed') {
      this.age = null;
      ring.img.setAlpha(0);
      return;
    }
    const look = pulseLook(this.age / PULSE_MS);
    const full = ctx.camera.groundEllipse(s.radius).rx / (BEACON_PULSE_R * ctx.unitPx);
    ctx.lib.setUnitScale(ring, ctx.unitPx, full * look.scale);
    ring.img.setPosition(s.sx, s.sy).setAlpha(look.alpha);
    this.age += dtMs;
  }

  destroy() {
    this.body.destroy();
    this.ring.img.destroy();
  }
}

export const view: BuildViewFactory = {
  id: 'beacon',
  create: (ctx) => new BeaconView(ctx),
};
