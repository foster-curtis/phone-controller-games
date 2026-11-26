// Rig instances (SPEC §12.2, §6.21): compose a view's pose set in `order` (optional groups off unless
// a clip or code turns them on), turn each part about its pivot chained through its parents, tint
// each part's slot layers from the outfit, and crossfade clips. A clip's `pose` swaps in a delivered
// pose drawing when the view has one; `<clip>@<view>` variants win over `<clip>`. Adapted from Fort
// Frenzy (`src/host/render/rig.ts`): copied from Fort Frenzy, extraction candidate, BUILD_PLAN §8.
import type * as Phaser from 'phaser';
import type { Outfit, Vec2 } from '../../content/types';
import { theme } from '../../shared/theme';
import {
  addPiece,
  destroyPiece,
  placePiece,
  setPieceVisible,
  tintPiece,
  type ArtLibrary,
  type ArtPiece,
} from './atlas';
import { blendSamples, sampleClip, type ClipSample } from './clip';
import { attachPoint, composePose, decompose, viewForFacing, type Mat } from './rigMath';
import { HAIR_TONES, SKIN_TONES, outfitTints } from './tones';
import {
  rigFrameName,
  type Clip,
  type FrameKey,
  type PlayOptions,
  type RigDef,
  type RigId,
  type RigInstance,
  type RigOptions,
  type RigPose,
  type TintSlot,
  type Tints,
  type ViewId,
} from './types';

const DEFAULT_FADE_MS = 120;

/** The art's own defaults (ART_NOTES) until an outfit or look is set. */
export const DEFAULT_TINTS: Readonly<Tints> = {
  tunic: theme.fabric.woad.num,
  mantle: theme.fabric.linen.num,
  hair: HAIR_TONES[0]!,
  skin: SKIN_TONES[0]!,
  wrap: theme.fabric.terracotta.num,
};

interface Node {
  name: string;
  pivot: [number, number];
  piece: ArtPiece | null;
  groups: string[];
}

interface Playing {
  name: string;
  clip: Clip;
  t: number;
  speed: number;
}

export class RigSprite implements RigInstance {
  readonly root: Phaser.GameObjects.Container;
  private nodes: Node[] = [];
  private poseName = '';
  private rp!: RigPose;
  private mats = new Map<string, Mat>();
  private cur: Playing | null = null;
  private prev: Playing | null = null;
  private fade = { t: 0, ms: 0 };
  private groupsOn = new Set<string>();
  private tints: Tints;
  private sx = 0;
  private sy = 0;
  private _view: ViewId;
  private _mirror: boolean;
  private readonly unitPx: number;

  constructor(
    private readonly lib: ArtLibrary,
    parent: Phaser.GameObjects.Layer | Phaser.GameObjects.Container,
    readonly def: RigDef,
    private readonly clips: Readonly<Record<string, Clip>>,
    charUnitPx: number,
    opts: RigOptions = {},
  ) {
    this.root = parent.scene.make.container({ x: 0, y: 0 }, false);
    parent.add(this.root);
    this.unitPx = charUnitPx * (opts.scale ?? 1);
    this.tints = {
      ...DEFAULT_TINTS,
      ...(opts.outfit ? outfitTints(opts.outfit) : {}),
      ...opts.tints,
    };
    this._view = opts.view ?? 'front';
    this._mirror = opts.mirror ?? false;
    this.root.setScale(this._mirror ? -1 : 1, 1);
    this.build();
    if (!this.play(opts.clip ?? 'idle', { fadeMs: 0 })) this.update(0);
  }

  get rigId(): RigId {
    return this.def.id;
  }
  get view(): ViewId {
    return this._view;
  }
  get mirrored(): boolean {
    return this._mirror;
  }
  get clip(): string | null {
    return this.cur?.name ?? null;
  }
  get pose(): string {
    return this.poseName;
  }
  get clipDone(): boolean {
    const c = this.cur;
    return !!c && !c.clip.loop && c.t >= c.clip.durationMs;
  }
  /** Images drawn (the stress readout). */
  get partCount(): number {
    return this.nodes.reduce((n, x) => n + (x.piece?.layers.length ?? 0), 0);
  }

  setPosition(sx: number, sy: number, sortY = sy) {
    this.sx = sx;
    this.sy = sy;
    this.root.setPosition(sx, sy);
    this.root.setDepth(sortY);
  }

  setView(view: ViewId, mirror = false) {
    if (mirror !== this._mirror) {
      this._mirror = mirror;
      this.root.setScale(mirror ? -1 : 1, 1);
    }
    if (view === this._view) return;
    this._view = view;
    for (const p of [this.cur, this.prev]) if (p) p.clip = this.clipFor(p.name) ?? p.clip;
    this.build();
    this.update(0);
  }

  face(radians: number) {
    const { view, mirror } = viewForFacing(radians);
    this.setView(view, mirror);
  }

  setOutfit(outfit: Outfit) {
    this.tints = { ...this.tints, ...outfitTints(outfit) };
    this.applyTints();
  }

  setTint(slot: TintSlot, color: number | null) {
    if (color === null) delete this.tints[slot];
    else this.tints[slot] = color;
    this.applyTints();
  }

  setGroup(group: string, on: boolean) {
    if (on) this.groupsOn.add(group);
    else this.groupsOn.delete(group);
    this.update(0);
  }

  private clipFor(name: string, view = this._view): Clip | undefined {
    return this.clips[`${this.def.id}/${name}@${view}`] ?? this.clips[`${this.def.id}/${name}`];
  }

  clipMs(name: string): number | null {
    return this.clipFor(name)?.durationMs ?? null;
  }

  play(name: string, opts: PlayOptions = {}): boolean {
    const clip = this.clipFor(name);
    if (!clip) return false;
    if (this.cur?.name === name && !opts.restart) {
      this.cur.speed = opts.speed ?? this.cur.speed;
      return true;
    }
    const fadeMs = opts.fadeMs ?? DEFAULT_FADE_MS;
    const poseChanges = this.poseOf(clip) !== this.poseName;
    // A pose swap redraws the parts: no crossfade across different drawings.
    this.prev = fadeMs > 0 && !poseChanges ? this.cur : null;
    this.cur = { name, clip, t: opts.offsetMs ?? 0, speed: opts.speed ?? 1 };
    this.fade = { t: 0, ms: fadeMs };
    if (poseChanges) this.build();
    this.update(0);
    return true;
  }

  setAlpha(alpha: number) {
    this.root.setAlpha(alpha);
  }

  setVisible(visible: boolean) {
    this.root.setVisible(visible);
  }

  attach(name: string): Vec2 | null {
    const u = attachPoint(this.rp, this.mats, name);
    if (!u) return null;
    const [fx, fy] = this.def.foot;
    const k = this.unitPx;
    return {
      x: this.sx + (u[0] - fx) * k * (this._mirror ? -1 : 1),
      y: this.sy + (u[1] - fy) * k,
    };
  }

  update(dtMs: number) {
    let sample: ClipSample = new Map();
    if (this.cur) {
      this.cur.t += dtMs * this.cur.speed;
      sample = sampleClip(this.cur.clip, this.cur.t);
      if (this.prev && this.fade.ms > 0) {
        this.prev.t += dtMs * this.prev.speed;
        this.fade.t += dtMs;
        const w = Math.min(1, this.fade.t / this.fade.ms);
        sample = blendSamples(sampleClip(this.prev.clip, this.prev.t), sample, w);
        if (w >= 1) this.prev = null;
      }
    }
    this.mats = composePose(this.rp, sample);
    const clipGroups = this.cur?.clip.groups ?? [];
    const [fx, fy] = this.def.foot;
    for (const n of this.nodes) {
      if (!n.piece) continue;
      const on =
        n.groups.length === 0 ||
        n.groups.some((g) => this.groupsOn.has(g) || clipGroups.includes(g));
      setPieceVisible(n.piece, on);
      if (!on) continue;
      const d = decompose(this.mats.get(n.name)!, n.pivot);
      const k = this.unitPx;
      placePiece(n.piece, (d.x - fx) * k, (d.y - fy) * k, k, d.rotation, d.scaleX, d.scaleY);
      const alpha = sample.get(n.name)?.alpha ?? 1;
      for (const l of n.piece.layers) l.img.setAlpha(alpha);
    }
  }

  destroy() {
    this.root.destroy();
    this.nodes = [];
  }

  // ---- internals ----------------------------------------------------------------------------------

  private poseOf(clip: Clip | undefined): string {
    const v = this.def.views[this._view];
    return clip?.pose && v.poses[clip.pose] ? clip.pose : v.defaultPose;
  }

  private build() {
    for (const n of this.nodes) if (n.piece) destroyPiece(n.piece);
    this.nodes = [];
    this.poseName = this.poseOf(this.cur?.clip);
    this.rp = this.def.views[this._view].poses[this.poseName]!;
    const groupsOf = new Map<string, string[]>();
    for (const [g, parts] of Object.entries(this.def.optional ?? {}))
      for (const p of parts) groupsOf.set(p, [...(groupsOf.get(p) ?? []), g]);
    for (const name of this.rp.order) {
      const part = this.rp.parts[name]!;
      const piece = part.src
        ? this.lib.piece(
            rigFrameName(this.def.id, this._view, this.poseName, name) as FrameKey,
            part.pivot,
          )
        : null;
      if (piece) addPiece(piece, this.root);
      this.nodes.push({ name, pivot: part.pivot, piece, groups: groupsOf.get(name) ?? [] });
    }
    this.applyTints();
  }

  private applyTints() {
    for (const n of this.nodes) if (n.piece) tintPiece(n.piece, this.tints);
  }
}
