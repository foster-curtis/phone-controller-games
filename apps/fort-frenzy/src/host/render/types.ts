// Renderer API (SPEC §2.5, §15.2): the camera, the six layers, rig instances, the structure and
// world pieces, ground ellipses and the effect spawners that host wiring (FF7) and later milestones
// drive from sim snapshots. Phaser stays behind these types; the sim never imports them.
// Frozen at FF3 (BUILD_PLAN §3): additive changes only.
import type { FrameName, IconName } from '../../../generated/keys';
import type { ViewId } from '../../themes/types';

/** A frame name from the generated atlas keys (`pnpm assets`); code never names frames otherwise. */
export type FrameKey = FrameName;
export type IconKey = IconName;

// ---- camera (§15.2) -------------------------------------------------------------------------------

export interface ScreenPoint {
  sx: number;
  sy: number;
}

export interface Camera {
  /** World (tiles; z = height in tiles) → screen px, applying the §2.5 projection. */
  worldToScreen(x: number, y: number, z?: number): ScreenPoint;
  /** Ground ellipse radii for a world circle of radius r (rx = r·W·k, ry = rx·0.6). */
  groundEllipse(r: number): { rx: number; ry: number };
  /** Zoom factor k (1 in v1). */
  readonly scale: number;
  update(dtMs: number, focus: readonly { x: number; y: number }[]): void; // no-op in v1
}

// ---- layers (§15.2) -------------------------------------------------------------------------------

/**
 * Bottom to top: 1 ground, 2 ground overlays, 3 world (one y-sorted layer), 4 effects, 5 world UI,
 * 6 HUD (screen space; the DOM overlay holds the real HUD, §15.2). Bloom covers layers 1–4.
 */
export const LAYER_IDS = ['ground', 'groundOverlay', 'world', 'effects', 'worldUi', 'hud'] as const;
export type LayerId = (typeof LAYER_IDS)[number];

// ---- rigs (§2.4, §15.2) ---------------------------------------------------------------------------

export interface RigOptions {
  /** Start view (default: the rig's first view: side for single-view rigs). */
  view?: ViewId;
  /** Mirror the side view to face left. */
  mirror?: boolean;
  /** Player color multiplied over `tint: 'player'` parts (0xRRGGBB). */
  tint?: number;
  /** Optional groups switched on at start (`banner`, `mk2`, `ii`, …). */
  groups?: readonly string[];
  /** Start clip (default `idle` when the rig has one). */
  clip?: string;
  /** Extra uniform scale on top of the camera's (the Citadel's window sentry, footmen…). */
  scale?: number;
}

export interface PlayOptions {
  /** Restart even when this clip is already playing. */
  restart?: boolean;
  /** Playback rate (1 = authored). */
  speed?: number;
  /** Crossfade from the current clip, ms (default 120). */
  fadeMs?: number;
  /** Phase offset in ms (de-syncs crowds). */
  offsetMs?: number;
}

/** One composed rig on the world layer: a knight, footman, enemy, the Colossus or the mortar. */
export interface RigInstance {
  readonly rigId: string;
  readonly view: ViewId;
  readonly mirrored: boolean;
  readonly pose: string | null;
  /** Foot point in screen px; the world layer sorts by `sortY` (default: sy). */
  setPosition(sx: number, sy: number, sortY?: number): void;
  /** Switch view (side views mirror for left). Unknown views fall back to side. */
  setView(view: ViewId, mirror?: boolean): void;
  /** Posed rigs (the Ranger: `stand`, `ready`): crossfade over `fadeMs` (0 snaps). */
  setPose(pose: string, fadeMs?: number): void;
  /** Player color for tint parts; null clears. */
  setTint(color: number | null): void;
  setGroup(group: string, on: boolean): void;
  isGroupOn(group: string): boolean;
  /** Plays `<rig>/<clip>`; unknown clips are ignored (returns false). */
  play(clip: string, opts?: PlayOptions): boolean;
  readonly clip: string | null;
  /** Length of `<rig>/<clip>` in ms, or null when the rig has no such clip (FF3-fix-1). */
  clipMs(clip: string): number | null;
  /** The playing one-shot clip has reached its end (a dead enemy's fade is done: remove it). */
  readonly clipDone: boolean;
  /** Emissive level for glow parts: 1 normal, >1 brighter (additive boost), <1 dimmer, 0 dark. */
  setGlow(level: number): void;
  /** Swap glow-baked frames to their `@unlit` variants and darken emissive parts (stun, down, destroyed). */
  setUnlit(on: boolean): void;
  /** Whole-body white flash (hit, burn/poison tick: about 60 ms). */
  flash(ms?: number): void;
  setAlpha(alpha: number): void;
  setVisible(visible: boolean): void;
  /** Named attach point (nametag, badge, carry, muzzle, top, …) in screen px, or null. */
  attach(name: string): ScreenPoint | null;
  /** Advance clips, crossfades and flashes. */
  update(dtMs: number): void;
  destroy(): void;
}

// ---- structures and world pieces (§3.6, §7.2, §15.2) ----------------------------------------------

/** Pulse-turret aims; `s` faces the camera. Order is counter-clockwise from east in screen space. */
export const TURRET_AIMS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'] as const;
export type TurretAim = (typeof TURRET_AIMS)[number];

/** 0 = unupgraded, then shop tiers I–III. */
export type TowerTier = 0 | 1 | 2 | 3;

export const SENTRY_AIMS = ['l', 'dl', 'c', 'dr', 'r'] as const;
export type SentryAim = (typeof SENTRY_AIMS)[number];
export const SENTRY_LOADOUTS = ['base', 'dmg', 'rng', 'max'] as const;
export type SentryLoadout = (typeof SENTRY_LOADOUTS)[number];

/** Citadel damage stages (§3.3, §3.6), cumulative: 0 none, 1 cracks, 2 + fire, 3 + smoke. */
export type CitadelStage = 0 | 1 | 2 | 3;

/** 4-bit same-type neighbor mask: N = 1, E = 2, S = 4, W = 8. */
export type TileMask = number;

export type LaneState = 'open' | 'sealed';

/** Status looks (§6.1) the renderer draws on a unit. */
export type StatusLook = 'burn' | 'poison' | 'stun' | 'slow';

// ---- effects (§15.2 layer 4, pooled) --------------------------------------------------------------

export type ProjectileKind =
  | 'bolt'
  | 'nanite-bolt'
  | 'mortar-shell'
  | 'bombard-shell'
  | 'boulder'
  | 'wasp-shot'
  | 'power-cell';

export type BurstKind =
  'spark-ours' | 'spark-theirs' | 'heal-glint' | 'nanite-mote' | 'muzzle-ours' | 'muzzle-theirs';

export type ScrapSide = 'ours' | 'theirs';

export interface EffectSpawner {
  /**
   * A one-shot burst at a screen point (rotation in radians for muzzle flashes), optionally after
   * `delayMs`.
   */
  burst(kind: BurstKind, sx: number, sy: number, rotation?: number, delayMs?: number): void;
  /**
   * Heal glints or nanite motes over a body (FF3-fix-1): 3–5 staggered bursts spread across and
   * around a body `heightPx` tall standing at the foot point, never in one column.
   */
  bodyBurst(
    kind: 'heal-glint' | 'nanite-mote',
    footSx: number,
    footSy: number,
    heightPx: number,
  ): void;
  /** A tracer line (amber ours, violet theirs) that fades over `ms`. */
  tracer(side: ScrapSide, from: ScreenPoint, to: ScreenPoint, ms?: number): void;
  /**
   * Scrap pile: `size` 1–5 (1–2 footman-sized, 3–5 structure-sized). Shows for `holdMs` (default
   * 960; a downed knight's pile holds for the down timer, FF3-fix-1), then fades out.
   */
  scrap(side: ScrapSide, size: 1 | 2 | 3 | 4 | 5, sx: number, sy: number, holdMs?: number): void;
  /** The charged-wall strike from a post to an attacker. */
  wallStrike(from: ScreenPoint, to: ScreenPoint): void;
  /** Ground ring (AoE, blast, shockwave) at a world point, radius in tiles, expanding and fading. */
  ring(side: ScrapSide | 'danger', x: number, y: number, r: number, ms?: number): void;
  /**
   * Ground shockwave in a sector (FF8: the Warden's slam and stomp): a 0.6 band rolling out from
   * (x, y) to `r` tiles across `arcDeg` around the world-ground angle `angleRad`, fading.
   */
  arcWave?(
    side: ScrapSide,
    x: number,
    y: number,
    r: number,
    angleRad: number,
    arcDeg: number,
    ms?: number,
  ): void;
}

/** A pooled projectile drawn on the world layer; arcing ones sort by their shadow. */
export interface ProjectileSprite {
  readonly kind: ProjectileKind;
  /** World position (tiles) and height (tiles); the shadow stays at z = 0. */
  set(x: number, y: number, z: number, headingRad: number): void;
  release(): void;
}
