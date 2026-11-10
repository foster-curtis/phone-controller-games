// Rig instances (SPEC §2.4, §15.2): compose a view's parts in `order` (optional groups off unless
// switched on), turn each part about its pivot chained through its parents, tint the player color
// parts, crossfade poses and clips, apply per-key draw-order swaps, brighten or dim emissive parts
// and swap glow-baked frames to `@unlit`. The knights' one-piece front/back legs draw as two
// cropped halves (render/split.ts), so clips move each leg on its own.
import * as Phaser from 'phaser';
import {
  isPosed,
  type Clip,
  type Point,
  type RigDef,
  type RigPart,
  type RigView,
  type ViewId,
} from '../../themes/types';
import type { ArtImage, ArtLibrary } from './atlas';
import { applyOrder, blendSamples, clipTime, REST, sampleClip, type ClipSample } from './clip';
import { attachPoint, composeView, decompose, partPoint, type Mat } from './rigMath';
import { splitView, type CropX } from './split';
import type { PlayOptions, RigInstance, RigOptions, ScreenPoint } from './types';

/** Dimmed emissive parts (unlit, downed): the knights' front shade (§2.5). */
const UNLIT_GLOW = 0x4a5362;
const DEFAULT_FADE_MS = 120;

interface PartNode {
  name: string;
  part: RigPart;
  art: ArtImage;
  /** Additive copy for glow > 1 (emissive parts only). */
  boost: ArtImage | null;
  groups: string[];
}

interface PartSet {
  view: ViewId;
  pose: string | null;
  rv: RigView;
  container: Phaser.GameObjects.Container;
  nodes: Map<string, PartNode>;
  orderKey: string;
  /** The view's own order, joined (no swap). */
  baseKey: string;
  mats: Map<string, Mat>;
}

interface Playing {
  clip: Clip;
  name: string;
  t: number;
  speed: number;
}

/**
 * White fill on plain art images, or back (FF12: the structure upgrade flash). Lives here, beside
 * the rig's own flash, because this module already loads Phaser (structures.ts stays Node-safe).
 */
export function whiteFlash(images: readonly ArtImage[], on: boolean): void {
  for (const a of images) {
    if (!a.img.active) continue;
    if (on) a.img.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
    else a.img.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
  }
}

export class RigSprite implements RigInstance {
  readonly root: Phaser.GameObjects.Container;
  private sets: PartSet[] = [];
  /** Pose crossfade: the newest set fades in over the rest. */
  private poseFade = { t: 0, ms: 0 };
  private cur: Playing | null = null;
  private prev: Playing | null = null;
  private clipFade = { t: 0, ms: 0 };
  private groupsOn = new Set<string>();
  private overrides = new Map<string, { rot?: number; dx?: number; dy?: number }>();
  private tint: number | null;
  private glowLevel = 1;
  private unlit = false;
  private flashMs = 0;
  private flashing = false;
  private sx = 0;
  private sy = 0;
  private _view: ViewId;
  private _mirror: boolean;
  private _pose: string | null = null;
  private readonly extra: number;
  private extras: Phaser.GameObjects.Graphics | null = null;

  constructor(
    private readonly lib: ArtLibrary,
    layer: Phaser.GameObjects.Layer,
    readonly def: RigDef,
    private readonly clips: Readonly<Record<string, Clip>>,
    private readonly unitPx: number,
    opts: RigOptions = {},
  ) {
    const scene = layer.scene;
    this.root = scene.make.container({ x: 0, y: 0 }, false);
    layer.add(this.root);
    this.extra = opts.scale ?? 1;
    this.tint = opts.tint ?? null;
    for (const g of opts.groups ?? []) this.groupsOn.add(g);
    const views = Object.keys(def.views) as ViewId[];
    this._view =
      opts.view && def.views[opts.view] ? opts.view : views.includes('side') ? 'side' : views[0]!;
    this._mirror = opts.mirror ?? false;
    this.buildSet(this._view, null);
    this.applyRootScale();
    if (!this.play(opts.clip ?? 'idle', { fadeMs: 0 })) this.update(0);
  }

  get rigId(): string {
    return this.def.id;
  }
  get view(): ViewId {
    return this._view;
  }
  get mirrored(): boolean {
    return this._mirror;
  }
  get pose(): string | null {
    return this._pose;
  }
  get clip(): string | null {
    return this.cur?.name ?? null;
  }

  /** Every optional group name of this rig. */
  get groups(): string[] {
    return Object.keys(this.def.optional ?? {});
  }

  /** Views and their poses (null for unposed views). */
  get viewsAndPoses(): { view: ViewId; poses: string[] | null }[] {
    return (Object.entries(this.def.views) as [ViewId, NonNullable<RigDef['views'][ViewId]>][]).map(
      ([view, v]) => ({ view, poses: isPosed(v) ? Object.keys(v.poses) : null }),
    );
  }

  setPosition(sx: number, sy: number, sortY = sy) {
    this.sx = sx;
    this.sy = sy;
    this.root.setPosition(sx, sy);
    this.root.setDepth(sortY);
  }

  setView(view: ViewId, mirror = false) {
    const v = this.def.views[view] ? view : 'side';
    if (!this.def.views[v]) return;
    if (v === this._view && mirror === this._mirror) return;
    this._mirror = mirror;
    this.applyRootScale();
    if (v !== this._view) {
      this._view = v;
      // Per-view clips (the down pile) follow the view, keeping their playhead.
      for (const p of [this.cur, this.prev]) if (p) p.clip = this.clipFor(p.name) ?? p.clip;
      for (const s of this.sets) s.container.destroy();
      this.sets = [];
      this.buildSet(v, this._pose);
      this.update(0);
    }
  }

  setPose(pose: string, fadeMs = 200) {
    const v = this.def.views[this._view];
    if (!v || !isPosed(v) || !v.poses[pose] || pose === this._pose) return;
    this._pose = pose;
    if (fadeMs <= 0) {
      for (const s of this.sets) s.container.destroy();
      this.sets = [];
    }
    this.buildSet(this._view, pose);
    this.poseFade = { t: 0, ms: Math.max(0, fadeMs) };
    this.update(0);
  }

  setTint(color: number | null) {
    this.tint = color;
    this.applyTints();
  }

  setGroup(group: string, on: boolean) {
    if (on) this.groupsOn.add(group);
    else this.groupsOn.delete(group);
    this.update(0);
  }

  isGroupOn(group: string): boolean {
    return this.groupsOn.has(group);
  }

  /** `<rig>/<clip>@<view>` when the clip is solved per view (the knights' down pile), else `<rig>/<clip>`. */
  private clipFor(clip: string, view = this._view): Clip | undefined {
    return this.clips[`${this.def.id}/${clip}@${view}`] ?? this.clips[`${this.def.id}/${clip}`];
  }

  clipMs(clip: string): number | null {
    return this.clipFor(clip)?.durationMs ?? null;
  }

  get clipDone(): boolean {
    const c = this.cur;
    return !!c && !c.clip.loop && c.t >= c.clip.durationMs;
  }

  play(clip: string, opts: PlayOptions = {}): boolean {
    const c = this.clipFor(clip);
    if (!c) return false;
    if (this.cur?.name === clip && !opts.restart) {
      this.cur.speed = opts.speed ?? this.cur.speed;
      return true;
    }
    const fadeMs = opts.fadeMs ?? DEFAULT_FADE_MS;
    this.prev = fadeMs > 0 ? this.cur : null;
    this.cur = { clip: c, name: clip, t: opts.offsetMs ?? 0, speed: opts.speed ?? 1 };
    this.clipFade = { t: 0, ms: fadeMs };
    this.update(0);
    return true;
  }

  setGlow(level: number) {
    this.glowLevel = Math.max(0, level);
  }

  setUnlit(on: boolean) {
    if (on === this.unlit) return;
    this.unlit = on;
    for (const s of this.sets) {
      for (const n of s.nodes.values()) {
        this.lib.setFrame(n.art, n.part.frame, on);
        this.lib.setOrigin(n.art, n.part.pivot);
      }
    }
    this.applyTints();
    this.update(0);
  }

  flash(ms = 60) {
    this.flashMs = ms;
    this.flashing = true;
    this.applyTints();
  }

  setAlpha(alpha: number) {
    this.root.setAlpha(alpha);
  }

  setVisible(visible: boolean) {
    this.root.setVisible(visible);
  }

  attach(name: string): ScreenPoint | null {
    const set = this.sets[this.sets.length - 1];
    const u = set ? attachPoint(set.rv, set.mats, name) : null;
    if (!set || !u) return null;
    return {
      sx: this.sx + (u[0] - set.rv.foot[0]) * this.root.scaleX,
      sy: this.sy + (u[1] - set.rv.foot[1]) * this.root.scaleY,
    };
  }

  /** A point on a part of the current view and pose, in the root's space (rig units, foot at 0, 0). */
  partPoint(part: string, at: Point): Point | null {
    const set = this.sets[this.sets.length - 1];
    const u = set ? partPoint(set.rv, set.mats, part, at) : null;
    if (!set || !u) return null;
    return [u[0] - set.rv.foot[0], u[1] - set.rv.foot[1]];
  }

  /** Playhead of the current clip, ms (one-shots clamp at their end). */
  get clipT(): number {
    const c = this.cur;
    return c ? clipTime(c.clip, c.t) : 0;
  }

  /**
   * A graphics layer over the parts, in the root's space (rig units, foot at 0, 0), for code-drawn
   * extras that move with the rig (the Ranger's slack string); made on first use.
   */
  overlay(): Phaser.GameObjects.Graphics {
    if (!this.extras) {
      this.extras = this.root.scene.make.graphics({}, false);
      this.root.add(this.extras);
    }
    return this.extras;
  }

  update(dtMs: number) {
    // Clips.
    let sample: ClipSample;
    if (!this.cur) sample = { parts: new Map(), order: null };
    else {
      this.cur.t += dtMs * this.cur.speed;
      sample = sampleClip(this.cur.clip, this.cur.t);
      if (this.prev && this.clipFade.ms > 0) {
        this.prev.t += dtMs * this.prev.speed;
        this.clipFade.t += dtMs;
        const w = Math.min(1, this.clipFade.t / this.clipFade.ms);
        sample = blendSamples(sampleClip(this.prev.clip, this.prev.t), sample, w);
        if (w >= 1) this.prev = null;
      }
    }
    // Pose crossfade.
    if (this.sets.length > 1) {
      this.poseFade.t += dtMs;
      const w = this.poseFade.ms > 0 ? Math.min(1, this.poseFade.t / this.poseFade.ms) : 1;
      const top = this.sets[this.sets.length - 1]!;
      top.container.setAlpha(w);
      for (const s of this.sets.slice(0, -1)) s.container.setAlpha(1 - w);
      if (w >= 1) {
        for (const s of this.sets.slice(0, -1)) s.container.destroy();
        this.sets = [top];
      }
    }
    // Flash.
    if (this.flashing) {
      this.flashMs -= dtMs;
      if (this.flashMs <= 0) {
        this.flashing = false;
        this.applyTints();
      }
    }
    // Code-driven parts (the mortar tube's aim, the Colossus head): added on top of the clip.
    if (this.overrides.size > 0) {
      for (const [part, o] of this.overrides) {
        const base = sample.parts.get(part) ?? REST;
        sample.parts.set(part, {
          ...base,
          rot: base.rot + (o.rot ?? 0),
          dx: base.dx + (o.dx ?? 0),
          dy: base.dy + (o.dy ?? 0),
        });
      }
    }
    for (const set of this.sets) this.poseSet(set, sample);
  }

  /** Extra rotation (degrees) and offset on one part, on top of any clip. */
  override(part: string, o: { rot?: number; dx?: number; dy?: number } | null) {
    if (o) this.overrides.set(part, o);
    else this.overrides.delete(part);
  }

  destroy() {
    this.root.destroy();
    this.sets = [];
  }

  // ---- internals ----------------------------------------------------------------------------------

  private viewSet(view: ViewId, pose: string | null): { rv: RigView; pose: string | null } {
    const v = this.def.views[view]!;
    if (!isPosed(v)) return { rv: v, pose: null };
    const p = pose && v.poses[pose] ? pose : v.defaultPose;
    return { rv: v.poses[p]!, pose: p };
  }

  private buildSet(view: ViewId, pose: string | null) {
    const { rv: base, pose: p } = this.viewSet(view, pose);
    const { rv, crops } = splitView(this.def.id, view, base, this.def.viewBox);
    this._pose = p;
    const scene = this.root.scene;
    const container = scene.make.container({ x: 0, y: 0 }, false);
    this.root.add(container);
    // Code-drawn extras stay over every part set.
    if (this.extras) this.root.bringToTop(this.extras);
    const groupsOf = new Map<string, string[]>();
    for (const [g, parts] of Object.entries(this.def.optional ?? {})) {
      for (const part of parts) groupsOf.set(part, [...(groupsOf.get(part) ?? []), g]);
    }
    const nodes = new Map<string, PartNode>();
    for (const name of rv.order) {
      const part = rv.parts[name];
      if (!part) continue;
      const art = this.lib.image(part.frame, part.pivot, this.unlit);
      container.add(art.img);
      let boost: ArtImage | null = null;
      if (part.emissive) {
        boost = this.lib.image(part.frame, part.pivot);
        boost.img.setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
        container.add(boost.img);
      }
      const crop = crops.get(name);
      if (crop) for (const a of boost ? [art, boost] : [art]) cropX(a, crop);
      nodes.set(name, { name, part, art, boost, groups: groupsOf.get(name) ?? [] });
    }
    const set: PartSet = {
      view,
      pose: p,
      rv,
      container,
      nodes,
      orderKey: rv.order.join(','),
      baseKey: rv.order.join(','),
      mats: new Map(),
    };
    this.sets.push(set);
    this.applyTints();
  }

  private applyRootScale() {
    const k = this.unitPx * this.extra;
    this.root.setScale(this._mirror ? -k : k, k);
  }

  private poseSet(set: PartSet, sample: ClipSample) {
    set.mats = composeView(set.rv, sample.parts);
    const [fx, fy] = set.rv.foot;
    for (const n of set.nodes.values()) {
      const visible = n.groups.length === 0 || n.groups.some((g) => this.groupsOn.has(g));
      n.art.img.setVisible(visible);
      if (!visible) {
        n.boost?.img.setVisible(false);
        continue;
      }
      const m = set.mats.get(n.name)!;
      const d = decompose(m, n.part.pivot);
      const p = sample.parts.get(n.name);
      let alpha = p?.alpha ?? 1;
      // No per-part array (FF15 perf: ~1,300 parts a frame at peak).
      placePart(n.art, d, fx, fy);
      if (n.boost) placePart(n.boost, d, fx, fy);
      if (n.part.emissive) {
        const level = this.unlit ? 1 : (p?.glow ?? 1) * this.glowLevel;
        alpha *= Math.min(1, level);
        const boost = Math.max(0, Math.min(1, level - 1));
        n.boost!.img.setVisible(boost > 0).setAlpha(boost * alpha);
      }
      n.art.img.setAlpha(alpha);
    }
    // Per-key draw-order swaps. Most clips have none: then the order is the view's own, and there is
    // no copy and join every frame (FF15 perf).
    const swap = sample.order !== null && sample.order.length > 0;
    if (!swap && set.orderKey === set.baseKey) return;
    const order = swap ? applyOrder(set.rv.order, sample.order) : set.rv.order;
    const key = swap ? order.join(',') : set.baseKey;
    if (key !== set.orderKey) {
      set.orderKey = key;
      const rank = new Map(order.map((p, i) => [p, i]));
      const imgRank = new Map<Phaser.GameObjects.GameObject, number>();
      for (const n of set.nodes.values()) {
        const r = (rank.get(n.name) ?? 0) * 2;
        imgRank.set(n.art.img, r);
        if (n.boost) imgRank.set(n.boost.img, r + 1);
      }
      set.container.list.sort((a, b) => (imgRank.get(a) ?? 0) - (imgRank.get(b) ?? 0));
    }
  }

  private applyTints() {
    for (const s of this.sets) {
      for (const n of s.nodes.values()) {
        for (const a of n.boost ? [n.art, n.boost] : [n.art]) {
          const img = a.img;
          if (this.flashing) {
            img.setTintMode(Phaser.TintModes.FILL).setTint(0xffffff);
          } else if (n.part.emissive && this.unlit) {
            img.setTintMode(Phaser.TintModes.FILL).setTint(UNLIT_GLOW);
          } else if (n.part.tint === 'player' && this.tint !== null) {
            img.setTintMode(Phaser.TintModes.MULTIPLY).setTint(this.tint);
          } else {
            img.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
          }
        }
      }
    }
  }
}

function placePart(
  a: ArtImage,
  d: { x: number; y: number; rotation: number; scaleX: number; scaleY: number },
  fx: number,
  fy: number,
) {
  a.img.setPosition(d.x - fx, d.y - fy).setRotation(d.rotation);
  a.img.setScale(d.scaleX / a.ppuX, d.scaleY / a.ppuY);
}

/** Crops an image to [x0, x1] sprite units of its frame (Phaser keeps it across `@unlit` swaps). */
function cropX(a: ArtImage, [x0, x1]: CropX) {
  a.img.setCrop((x0 - a.vb[0]) * a.ppuX, 0, (x1 - x0) * a.ppuX, a.img.frame.realHeight);
}
