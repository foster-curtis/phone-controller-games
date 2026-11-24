// Status looks (SPEC §6.1; art README "Status effects"): burn flames and poison corrosion loop at
// about 8 fps, anchored bottom-center on the body (at the top of the legs) and sized as a fraction of
// its height with a cap (RD10-fix-1: a small flame on a mite, modest on the Colossus); stun turns the
// glow off (unlit frames), loops amber chevrons centered on the `top` point and holds the unit in its
// idle clip; slow crawls flickering arcs up the legs.
import type { ArtImage } from './atlas';
import { placeFrame, type RenderContext } from './context';
import { hash01 } from './fall';
import { STATUS_FRAMES } from './keys';
import type { RigInstance, StatusLook } from './types';

const FPS = 8;
/** Frame heights in sprite units (burn/corrosion ≈ 38–42, crawl 52), for scaling to the body. */
const BODY_FRAME_H = 40;
const CRAWL_FRAME_H = 46;
/** Burn/corrosion height as a fraction of the body height (RD10-fix-1, RC2 note). */
export const BODY_LOOK_FRACTION = 0.45;
/** Cap on the burn/corrosion scale (× the frame), so big bodies get a modest flame. */
export const BODY_LOOK_MAX_SCALE = 1.1;

/**
 * Scale of the burn and corrosion frames on a body `bodyH` sprite units tall: proportional to the
 * body, capped (RD10-fix-1).
 */
export function bodyLookScale(bodyH: number): number {
  return Math.min(BODY_LOOK_MAX_SCALE, (BODY_LOOK_FRACTION * bodyH) / BODY_FRAME_H);
}

/**
 * The locomotion clip for a unit (C1 note 11, a render rule FF10 follows): a stunned unit is always
 * idle, never walking, even while the sim still slides it (knockback).
 */
export function locomotionClip(moving: boolean, looks: readonly StatusLook[]): 'idle' | 'walk' {
  return moving && !looks.includes('stun') ? 'walk' : 'idle';
}

/** Walk playback rate while slowed: it moves sluggishly (§7.2). */
export const SLOW_CLIP_SPEED = 0.55;

export function locomotionSpeed(looks: readonly StatusLook[]): number {
  return looks.includes('slow') ? SLOW_CLIP_SPEED : 1;
}

/** Slow's crawl look at time t (C1 note 12): arcs climb the legs, flicker and re-strike. */
export interface CrawlLook {
  /** Height factor on the leg height (the arcs climb, then re-strike from the feet). */
  climb: number;
  alpha: number;
  /** Mirror on alternate strikes so the arcs never repeat the same shape twice in a row. */
  flip: boolean;
  /** Small sideways jitter, sprite units. */
  jitter: number;
}

/** Strike period of the crawl, ms (a few strikes a second; the flicker runs faster). */
export const CRAWL_PERIOD_MS = 420;
const FLICKER_MS = 50;

export function crawlLook(tMs: number, seed = 0): CrawlLook {
  const strike = Math.floor(tMs / CRAWL_PERIOD_MS);
  const u = (tMs % CRAWL_PERIOD_MS) / CRAWL_PERIOD_MS;
  const tick = Math.floor(tMs / FLICKER_MS);
  const f = hash01(`crawl:${seed}:${tick}`);
  return {
    climb: 0.55 + 0.45 * Math.sin((u * Math.PI) / 2),
    // A bright strike that fades as it climbs, with an irregular flicker on top.
    alpha: Math.max(0.15, (1 - 0.55 * u) * (0.55 + 0.45 * f)),
    flip: (strike + seed) % 2 === 1,
    jitter: (hash01(`crawl:${seed}:${strike}:j`) - 0.5) * 6,
  };
}

export class StatusSprites {
  private imgs = new Map<StatusLook, ArtImage>();
  private looks: StatusLook[] = [];
  private t = 0;

  constructor(
    private readonly ctx: RenderContext,
    private readonly rig: RigInstance,
    /** Body height and leg height in sprite units (from the rig's art). */
    private readonly bodyH: number,
    private readonly legH: number,
    private readonly seed = 0,
  ) {}

  set(looks: readonly StatusLook[]) {
    this.looks = [...looks];
    const want = new Set(looks);
    for (const [look, a] of this.imgs) {
      if (!want.has(look)) {
        a.img.destroy();
        this.imgs.delete(look);
      }
    }
    for (const look of want) {
      if (this.imgs.has(look)) continue;
      const layer = 'effects';
      this.imgs.set(look, placeFrame(this.ctx, STATUS_FRAMES[look][0], layer, 0, 0));
    }
    this.rig.setUnlit(want.has('stun'));
    if (want.has('stun')) this.rig.play('idle');
  }

  /** The clip to play for a moving or standing unit under the current looks (stun → idle). */
  locomotion(moving: boolean): 'idle' | 'walk' {
    return locomotionClip(moving, this.looks);
  }

  /** Place on the rig; `foot` is the rig's foot point on screen. */
  update(dtMs: number, footSx: number, footSy: number) {
    this.t += dtMs;
    const frame = Math.floor((this.t / 1000) * FPS);
    const k = this.ctx.unitPx;
    for (const [look, a] of this.imgs) {
      const frames = STATUS_FRAMES[look];
      this.ctx.lib.setFrame(a, frames[frame % frames.length]!);
      if (look === 'stun') {
        const top = this.rig.attach('top') ?? { sx: footSx, sy: footSy - this.bodyH * k };
        this.ctx.lib.setUnitScale(a, k);
        a.img.setPosition(top.sx, top.sy - 6);
      } else if (look === 'slow') {
        const c = crawlLook(this.t, this.seed);
        const sy = (this.legH / CRAWL_FRAME_H) * c.climb;
        this.ctx.lib.setUnitScale(a, k, c.flip ? -1 : 1, sy);
        a.img.setPosition(footSx + c.jitter * k, footSy).setAlpha(c.alpha);
      } else {
        const s = bodyLookScale(this.bodyH);
        this.ctx.lib.setUnitScale(a, k, s, s * 0.9);
        a.img.setPosition(footSx, footSy - this.legH * k);
      }
    }
  }

  destroy() {
    for (const a of this.imgs.values()) a.img.destroy();
    this.imgs.clear();
  }
}
