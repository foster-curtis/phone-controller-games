// Structures (SPEC §3.6, §7.2, §15.2): the pulse-turret stack with 8-aim heads, the mortar rig with
// its clamped tube, the Citadel with sentries, damage stages and rubble, and the wall / shock-net
// autotile fields. Everything here is ours: gunmetal and amber.
import type { Point } from '../../themes/types';
import type { ArtImage } from './atlas';
import { mortarTubeAngle, snapSentryAim, snapTurretAim } from './aim';
import { masksFor } from './autotile';
import {
  citadelCollapseAt,
  CITADEL_COLLAPSE_MS,
  COLLAPSE_AT,
  SMOKE_CROP_Y,
  smokeBaseAlpha,
  smokeLayers,
  type CollapseFrame,
} from './citadelFx';
import { placeFrame, type RenderContext } from './context';
import {
  CITADEL,
  fk,
  netFrame,
  sentryFrame,
  turretHeadFrame,
  turretPedestalFrame,
  TURRET_BANDS,
  wallChargedFrame,
  wallDmgFrame,
  wallFrame,
  wallRailFrame,
} from './keys';
import type { RigSprite } from './rig';
import type {
  CitadelStage,
  EffectSpawner,
  ScreenPoint,
  SentryAim,
  SentryLoadout,
  TowerTier,
  TurretAim,
} from './types';

/** Small depth steps so a stack keeps its order inside the y-sorted world layer. */
const EPS = 0.001;

function setVisible(a: ArtImage | null | undefined, on: boolean) {
  a?.img.setVisible(on);
}

// ---- pulse turret ---------------------------------------------------------------------------------

/** Muzzle attach indices per tier: the base head has one barrel, II and III twin barrels (§7.2). */
export function turretMuzzleIndices(tier: TowerTier): (1 | 2)[] {
  return tier >= 2 ? [1, 2] : [1];
}

/** plate (ground), pedestal (III's adds struts), bands, the head for the snapped aim (§15.2). */
export class PulseTurret {
  private plate: ArtImage;
  private fortBack: ArtImage;
  private pedestal: ArtImage;
  private bands: ArtImage[];
  private head: ArtImage;
  private dmg: ArtImage;
  private bonus: ArtImage;
  private fortFront: ArtImage;
  private tier: TowerTier = 0;
  private _aim: TurretAim = 's';
  private unlit = false;
  readonly sx: number;
  readonly sy: number;

  constructor(
    private readonly ctx: RenderContext,
    /** Tile center, world tiles. */
    x: number,
    y: number,
  ) {
    const { sx, sy } = ctx.camera.worldToScreen(x, y);
    this.sx = sx;
    this.sy = sy;
    const at = (name: string, i: number, layer: 'world' | 'groundOverlay' = 'world') =>
      placeFrame(ctx, name, layer, sx, sy, { sortY: sy + i * EPS });
    this.plate = at(fk('plate/tile'), 0, 'groundOverlay');
    // Fortify's back half draws before the tower, its front half after (art README).
    this.fortBack = at(fk('fortify/back'), 0);
    this.pedestal = at(turretPedestalFrame(0), 1);
    this.bands = TURRET_BANDS.map((b, i) => at(b, 2 + i));
    this.head = at(turretHeadFrame(0, 's'), 5);
    this.dmg = at(fk('pulse-turret/dmg'), 6);
    this.bonus = at(fk('defense-bonus'), 7);
    this.fortFront = at(fk('fortify/front'), 8);
    this.setDamaged(false);
    this.setDefenseBonus(false);
    this.setFortify(false);
    this.setTier(0);
  }

  get aim(): TurretAim {
    return this._aim;
  }

  setTier(tier: TowerTier) {
    this.tier = tier;
    this.ctx.lib.setFrame(this.pedestal, turretPedestalFrame(tier), this.unlit);
    this.bands.forEach((b, i) => setVisible(b, i < tier));
    this.refreshHead();
  }

  /** Aim at a world-ground angle (radians), snapping with 8° hysteresis. */
  aimAt(angleRad: number) {
    const next = snapTurretAim(angleRad, this._aim);
    if (next !== this._aim) {
      this._aim = next;
      this.refreshHead();
    }
  }

  setAim(aim: TurretAim) {
    this._aim = aim;
    this.refreshHead();
  }

  setDamaged(on: boolean) {
    setVisible(this.dmg, on);
  }

  setDefenseBonus(on: boolean) {
    setVisible(this.bonus, on);
  }

  setFortify(on: boolean) {
    setVisible(this.fortBack, on);
    setVisible(this.fortFront, on);
  }

  /** Destroyed: glow cut out (§7.2). */
  setUnlit(on: boolean) {
    this.unlit = on;
    for (const a of [this.plate, this.pedestal, ...this.bands, this.head])
      this.ctx.lib.setFrame(a, a.name, on);
    this.refreshHead();
  }

  /** Muzzle `muzzle-1` / `muzzle-2` of the current head, screen px. */
  muzzle(i: 1 | 2 = 1): ScreenPoint | null {
    const p = this.ctx.lib.frames[this.head.name]?.attach?.[`muzzle-${i}`];
    return p
      ? { sx: this.sx + p[0] * this.ctx.unitPx, sy: this.sy + p[1] * this.ctx.unitPx }
      : null;
  }

  /** Every barrel tip of the current head: one up to tier I, both twin barrels from II (C1 note 6). */
  muzzles(): ScreenPoint[] {
    return turretMuzzleIndices(this.tier)
      .map((i) => this.muzzle(i))
      .filter((p): p is ScreenPoint => p !== null);
  }

  /** Muzzle flash out of every barrel, pointing along the aim (screen radians). */
  fire(fx: EffectSpawner, rotation: number) {
    for (const m of this.muzzles()) fx.burst('muzzle-ours', m.sx, m.sy, rotation);
  }

  private refreshHead() {
    this.ctx.lib.setFrame(this.head, turretHeadFrame(this.tier, this._aim), this.unlit);
    this.ctx.lib.setOrigin(this.head, [0, 0]);
    this.ctx.lib.setOrigin(this.pedestal, [0, 0]);
  }

  destroy() {
    for (const a of [
      this.plate,
      this.fortBack,
      this.pedestal,
      ...this.bands,
      this.head,
      this.dmg,
      this.bonus,
      this.fortFront,
    ])
      a.img.destroy();
  }
}

// ---- mortar (rig) ---------------------------------------------------------------------------------

/** Tier looks (§7.2): each tier keeps the earlier parts; one band per tier. */
export function mortarGroups(tier: TowerTier): string[] {
  const g: string[] = [];
  if (tier >= 1) g.push('band1');
  if (tier >= 2) g.push('band2', 'ii');
  if (tier >= 3) g.push('band3', 'iii');
  return g;
}

export class Mortar {
  private plate: ArtImage;
  readonly sx: number;
  readonly sy: number;
  private tubeRad = 0;

  constructor(
    ctx: RenderContext,
    readonly rig: RigSprite,
    x: number,
    y: number,
  ) {
    const { sx, sy } = ctx.camera.worldToScreen(x, y);
    this.sx = sx;
    this.sy = sy;
    // `plate/tile` under it, centered on the rig's foot (art README).
    this.plate = placeFrame(ctx, fk('plate/tile'), 'groundOverlay', sx, sy);
    rig.setPosition(sx, sy);
  }

  setTier(tier: TowerTier) {
    const on = new Set(mortarGroups(tier));
    for (const g of ['band1', 'band2', 'band3', 'ii', 'iii']) this.rig.setGroup(g, on.has(g));
  }

  setDamaged(on: boolean) {
    this.rig.setGroup('damaged', on);
  }

  /** Aim the tube toward a screen-space direction; clamped to ±75° from straight up. */
  aimScreen(sdx: number, sdy: number) {
    this.tubeRad = mortarTubeAngle(sdx, sdy);
    this.rig.override('tube', { rot: (this.tubeRad * 180) / Math.PI });
  }

  get tubeAngle(): number {
    return this.tubeRad;
  }

  destroy() {
    this.plate.img.destroy();
    this.rig.destroy();
  }
}

// ---- Citadel + sentries (§3.6) --------------------------------------------------------------------

/** Mounts relative to the Citadel anchor, sprite units (art README). */
export const SENTRY_MOUNTS = {
  left: [-130, -128],
  right: [130, -128],
  window: [0, -84],
} as const satisfies Record<string, Point>;
export const WINDOW_SENTRY_SCALE = 0.62;

export type SentryId = keyof typeof SENTRY_MOUNTS;

/** The core sphere's center, Citadel units (it implodes about it). */
const CORE_CENTER: Point = [170, 38];

export class Citadel {
  readonly ground: ArtImage[];
  private body: ArtImage;
  private glow: ArtImage;
  private core: ArtImage;
  private ramparts: ArtImage;
  private window: ArtImage;
  private sentries: Record<SentryId, ArtImage>;
  private aims: Record<SentryId, SentryAim> = { left: 'dl', right: 'dr', window: 'c' };
  private overlays: [ArtImage, ArtImage, ArtImage];
  /** Two drifting copies of the smoke plumes over the static overlay (C1 note 7). */
  private smokeDrift: [ArtImage, ArtImage];
  private rubble: ArtImage;
  private stage: CitadelStage = 0;
  private destroyed = false;
  private loadout: SentryLoadout = 'base';
  private third = false;
  private t = 0;
  private hitMs = 0;
  /** Destroyed transition playhead, ms (null when not collapsing). */
  private collapseT: number | null = null;
  private keepUnlit = false;
  readonly sx: number;
  readonly sy: number;

  constructor(
    private readonly ctx: RenderContext,
    /** Anchor: front-center of the 4 × 2 footprint, world tiles (map v1: (18, 2)). */
    x: number,
    y: number,
  ) {
    const { sx, sy } = ctx.camera.worldToScreen(x, y);
    this.sx = sx;
    this.sy = sy;
    let i = 0;
    // Multi-tile structures sort by their footprint's front edge (§15.2).
    const w = (name: string, origin?: Point, scale?: number, px = sx, py = sy) =>
      placeFrame(ctx, name, 'world', px, py, { sortY: sy + i++ * EPS, origin, scale });
    this.ground = [
      placeFrame(ctx, CITADEL.plate, 'ground', sx, sy),
      placeFrame(ctx, CITADEL.repairZone, 'ground', sx, sy),
    ];
    // Draw order: body, glow, core, corner sentries, ramparts, window, window sentry, overlays.
    this.body = w(CITADEL.body);
    this.glow = w(CITADEL.glow);
    this.core = w(CITADEL.core, CORE_CENTER, 1, sx, this.coreY(1));
    const mount = (id: SentryId) => {
      const [mx, my] = SENTRY_MOUNTS[id];
      const s = id === 'window' ? WINDOW_SENTRY_SCALE : 1;
      return w(
        sentryFrame('base', this.aims[id]),
        [0, 0],
        s,
        sx + mx * ctx.unitPx,
        sy + my * ctx.unitPx,
      );
    };
    const left = mount('left');
    const right = mount('right');
    this.ramparts = w(CITADEL.ramparts);
    this.window = w(CITADEL.window);
    this.sentries = { left, right, window: mount('window') };
    this.overlays = [w(CITADEL.cracks), w(CITADEL.fire), w(CITADEL.smoke)];
    this.smokeDrift = [w(CITADEL.smoke), w(CITADEL.smoke)];
    for (const s of this.smokeDrift) {
      const vb = s.vb;
      s.img.setCrop(0, 0, vb[2] * s.ppuX, (SMOKE_CROP_Y - vb[1]) * s.ppuY);
    }
    this.rubble = w(CITADEL.rubble);
    this.refresh();
  }

  /** Cumulative stages: 1 cracks (66%), 2 + fire (33%), 3 + heavy smoke (10%). */
  setStage(stage: CitadelStage) {
    this.stage = stage;
    this.refresh();
  }

  /** Stage for an HP fraction (reverses as HP is repaired over each threshold). */
  static stageFor(hpFrac: number): CitadelStage {
    return hpFrac <= 0.1 ? 3 : hpFrac <= 0.33 ? 2 : hpFrac <= 0.66 ? 1 : 0;
  }

  /** Snap to destroyed (rubble) or back to standing; cancels a running collapse. */
  setDestroyed(on: boolean) {
    this.destroyed = on;
    this.collapseT = null;
    this.applyCollapse(null);
    this.refresh();
  }

  /**
   * The destroyed transition (C1 note 8; FF7/FF14 trigger it on defeat): the core implodes, the
   * glow cuts out, the keep sinks into its footprint and the rubble frame fades in, ending in the
   * destroyed state. Sparks and scrap burst along the way when `fx` is given. Returns its length, ms.
   */
  collapse(fx?: EffectSpawner): number {
    this.destroyed = false;
    this.collapseT = 0;
    this.refresh();
    this.applyCollapse(citadelCollapseAt(0));
    if (fx) {
      const k = this.ctx.unitPx;
      const core = { sx: this.sx, sy: this.coreY(1) };
      fx.burst('spark-ours', core.sx, core.sy, 0, COLLAPSE_AT.implode);
      for (let j = 0; j < 6; j++) {
        const x = this.sx + (j - 2.5) * 52 * k;
        const at = COLLAPSE_AT.sinkStart + j * 170;
        fx.burst('spark-ours', x, this.sy - (30 + (j % 3) * 22) * k, 0, at);
      }
    }
    return CITADEL_COLLAPSE_MS;
  }

  get collapsing(): boolean {
    return this.collapseT !== null;
  }

  /** Damage (twin barrels) and Range (scope) stack: 4 loadouts (§3.5, §3.6). */
  setLoadout(damage: boolean, range: boolean, third: boolean) {
    this.loadout = damage && range ? 'max' : damage ? 'dmg' : range ? 'rng' : 'base';
    this.third = third;
    this.refresh();
  }

  setSentryAim(id: SentryId, aim: SentryAim) {
    this.aims[id] = aim;
    this.refresh();
  }

  /** Corner sentries snap to the frame nearest their target (world-ground angle). */
  aimSentryAt(id: 'left' | 'right', angleRad: number) {
    this.setSentryAim(id, snapSentryAim(angleRad, this.aims[id]));
  }

  /** Core flicker + keep shake on a hit (§3.6). */
  hit() {
    this.hitMs = 220;
  }

  sentryScreen(id: SentryId): ScreenPoint {
    const [mx, my] = SENTRY_MOUNTS[id];
    return { sx: this.sx + mx * this.ctx.unitPx, sy: this.sy + my * this.ctx.unitPx };
  }

  update(dtMs: number) {
    this.t += dtMs;
    if (this.collapseT !== null) {
      this.collapseT += dtMs;
      if (this.collapseT >= CITADEL_COLLAPSE_MS) this.setDestroyed(true);
      else {
        this.applyCollapse(citadelCollapseAt(this.collapseT));
        return;
      }
    }
    const shake = this.hitMs > 0 ? Math.sin(this.t / 18) * 2 * (this.hitMs / 220) : 0;
    this.hitMs = Math.max(0, this.hitMs - dtMs);
    for (const a of this.keep()) a.img.x = this.sx + shake;
    if (this.destroyed) return;
    const flicker = this.hitMs > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(this.t / 25)) : 1;
    const dim = this.stage >= 3 ? 0.55 : 1;
    this.core.img.setAlpha(flicker * dim);
    this.glow.img.setAlpha(this.stage >= 3 ? 0.6 : 1);
    // Fire flickers; smoke breathes and pours upward (deterministic, no randomness).
    this.overlays[1].img.setAlpha(0.85 + 0.15 * Math.sin(this.t / 70));
    this.overlays[2].img.setAlpha(smokeBaseAlpha(this.t));
    const k = this.ctx.unitPx;
    smokeLayers(this.t).forEach((l, j) => {
      const s = this.smokeDrift[j]!;
      this.ctx.lib.setUnitScale(s, k, l.scale);
      s.img.setPosition(this.sx + shake + l.dx * k, this.sy + l.dy * k).setAlpha(l.alpha);
    });
  }

  /** Screen y of the core's center at a keep height factor. */
  private coreY(keepSy: number): number {
    return this.sy + (CORE_CENTER[1] - 234) * this.ctx.unitPx * keepSy;
  }

  /** The upright pieces that shake and sink (sentries and overlays sink too). */
  private keep(): ArtImage[] {
    return [this.body, this.glow, this.core, this.ramparts, this.window];
  }

  /** Applies one frame of the destroyed transition, or restores the standing keep (null). */
  private applyCollapse(f: CollapseFrame | null) {
    const lib = this.ctx.lib;
    const k = this.ctx.unitPx;
    const sy = f?.keepSy ?? 1;
    const shake = f ? Math.sin(this.t / 16) * f.shake : 0;
    const unlit = f?.unlit ?? false;
    if (unlit !== this.keepUnlit) {
      this.keepUnlit = unlit;
      for (const a of [this.body, this.ramparts, this.window, this.core])
        lib.setFrame(a, a.name, unlit);
    }
    const sinking = [this.body, this.glow, this.ramparts, this.window, ...this.overlays];
    for (const a of sinking) {
      lib.setUnitScale(a, k, 1, sy);
      a.img.setPosition(this.sx + shake, this.sy).setAlpha(f?.keepAlpha ?? 1);
    }
    for (const s of this.smokeDrift) s.img.setVisible(!f && !this.destroyed && this.stage >= 3);
    lib.setUnitScale(this.core, k, f?.coreScale ?? 1);
    this.core.img.setPosition(this.sx + shake, this.coreY(sy)).setAlpha(f ? f.coreAlpha : 1);
    if (f) this.glow.img.setAlpha(f.glowAlpha * f.keepAlpha);
    for (const id of ['left', 'right', 'window'] as const) {
      const s = this.sentries[id];
      const [mx, my] = SENTRY_MOUNTS[id];
      const scale = id === 'window' ? WINDOW_SENTRY_SCALE : 1;
      lib.setUnitScale(s, k, scale, scale * sy);
      s.img.setPosition(this.sx + mx * k + shake, this.sy + my * k * sy);
      s.img.setAlpha(f?.keepAlpha ?? 1);
    }
    this.rubble.img.setVisible(this.destroyed || !!f).setAlpha(f ? f.rubbleAlpha : 1);
  }

  private refresh() {
    const lib = this.ctx.lib;
    const alive = !this.destroyed;
    for (const a of this.keep()) setVisible(a, alive);
    for (const id of ['left', 'right', 'window'] as const) {
      const s = this.sentries[id];
      lib.setFrame(
        s,
        sentryFrame(this.loadout, id === 'window' ? 'c' : this.aims[id]),
        this.keepUnlit,
      );
      lib.setOrigin(s, [0, 0]);
      setVisible(s, alive && (id !== 'window' || this.third));
    }
    this.overlays.forEach((o, i) => setVisible(o, alive && this.stage > i));
    for (const s of this.smokeDrift) setVisible(s, alive && this.stage >= 3 && !this.collapsing);
    setVisible(this.rubble, this.destroyed || this.collapsing);
  }
}

// ---- walls and shock nets (autotiles) -------------------------------------------------------------

export interface WallTile {
  c: number;
  r: number;
  charged?: boolean;
  damaged?: boolean;
}

/** Walls: rail (ground), wall (world, y-sorted at the tile center), charged and damage overlays. */
export class WallField {
  private images: ArtImage[] = [];
  constructor(private readonly ctx: RenderContext) {}

  set(tiles: readonly WallTile[], unlit = false) {
    for (const a of this.images) a.img.destroy();
    this.images = [];
    const masks = masksFor(tiles.map((t) => [t.c, t.r] as const));
    for (const t of tiles) {
      const m = masks.get(`${t.c},${t.r}`) ?? 0;
      const { sx, sy } = this.ctx.camera.worldToScreen(t.c + 0.5, t.r + 0.5);
      const add = (name: string, layer: 'groundOverlay' | 'world', i: number) =>
        this.images.push(placeFrame(this.ctx, name, layer, sx, sy, { sortY: sy + i * EPS, unlit }));
      add(wallRailFrame(m), 'groundOverlay', 0);
      add(wallFrame(m), 'world', 0);
      if (t.charged) add(wallChargedFrame(m), 'world', 1);
      if (t.damaged) add(wallDmgFrame(m), 'world', 2);
    }
  }
}

/** Shock nets on the ground; adjacent nets join into one field. */
export class NetField {
  private images: ArtImage[] = [];
  constructor(private readonly ctx: RenderContext) {}

  set(tiles: readonly { c: number; r: number }[]) {
    for (const a of this.images) a.img.destroy();
    this.images = [];
    const masks = masksFor(tiles.map((t) => [t.c, t.r] as const));
    for (const t of tiles) {
      const { sx, sy } = this.ctx.camera.worldToScreen(t.c + 0.5, t.r + 0.5);
      this.images.push(
        placeFrame(this.ctx, netFrame(masks.get(`${t.c},${t.r}`) ?? 0), 'groundOverlay', sx, sy),
      );
    }
  }
}

/** One frame anywhere (armory, rally flag, power cell, build ghosts…). */
export function frameAt(
  ctx: RenderContext,
  name: string,
  layer: 'ground' | 'groundOverlay' | 'world' | 'effects',
  x: number,
  y: number,
) {
  const { sx, sy } = ctx.camera.worldToScreen(x, y);
  return placeFrame(ctx, name, layer, sx, sy);
}
