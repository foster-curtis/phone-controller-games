// Renderer API and asset formats (SPEC §12.2, §12.10, §6.21): the rig contract
// (`art/forum/rigs/<id>.json`), code clips (`render/clips/<rig>.ts`), `art/forum/sprites.json`, the
// generated asset manifest (`generated/manifest.ts`, written by scripts/build-atlases.ts), the
// `Camera`, the layers, rig and stall instances and the effect spawner that the scene (TF7) drives
// from `WorldView`. Phaser stays behind these types; the sim never imports this folder.
// Adapted from Fort Frenzy (`apps/fort-frenzy/src/themes/types.ts`, `src/host/render/types.ts`):
// copied from Fort Frenzy, extraction candidate, BUILD_PLAN §8.
// Frozen at TF1 (BUILD_PLAN §3): additive changes only. That includes the manifest format.
import type { FrameName } from '../../../generated/keys';
import type { Outfit, ShopId, Vec2 } from '../../content/types';

/** A manifest frame name from the generated keys (`pnpm assets`). */
export type FrameKey = FrameName;

// ---- shared geometry ------------------------------------------------------------------------------

export type ViewId = 'front' | 'side' | 'back';
export const VIEW_IDS = ['front', 'side', 'back'] as const satisfies readonly ViewId[];

export type Point = [x: number, y: number];
/** [minX, minY, width, height], SVG viewBox order. */
export type ViewBox = [x: number, y: number, w: number, h: number];

/**
 * A tint slot: a CSS variable in the art (`var(--tunic, …)`). Its shapes are rasterized white in
 * their own frame layer and multiplied by the slot's color at draw time (SPEC §12.2).
 */
export type TintSlot = 'tunic' | 'mantle' | 'hair' | 'skin' | 'wrap' | 'canopy' | 'player';
export const TINT_SLOTS = [
  'tunic',
  'mantle',
  'hair',
  'skin',
  'wrap',
  'canopy',
  'player',
] as const satisfies readonly TintSlot[];

export type RigId = 'citizen' | 'merchant' | 'guard';
export const RIG_IDS = ['citizen', 'merchant', 'guard'] as const satisfies readonly RigId[];

// ---- rigs (art/forum/rigs/<id>.json) --------------------------------------------------------------

/** Where a part comes from in its pose's SVG: the element with `id`, optionally only some children. */
export interface RigPartSrc {
  id: string;
  /** Indices of the element's direct children to keep (splits the one-piece `legs` group). */
  pick?: number[];
}

export interface RigPart {
  /** null: the art doesn't show this part from this view (still listed, SPEC §6.21 full-size rule). */
  src: RigPartSrc | null;
  /** The joint the part turns around (rig units). */
  pivot: Point;
  parent?: string;
  /** The same joint on the parent (default `pivot`). */
  at?: Point;
}

/** A named point riding on a part: `hand`, `head-top` (bubbles, crowns), `feet`. */
export interface RigAttach {
  part: string;
  at: Point;
}

/** One part set: a view's base drawing or a delivered pose override (point, hands-up, run). */
export interface RigPose {
  /** The source SVG under art/forum/. */
  file: string;
  parts: Record<string, RigPart>;
  /** Back to front; lists every part of the rig once, hidden ones included. */
  order: string[];
  attach: Record<string, RigAttach>;
}

export interface RigView {
  defaultPose: string;
  poses: Record<string, RigPose>;
}

export interface RigDef {
  id: RigId;
  /** Shared by every part in every view: parts stack at rest with no offsets. */
  viewBox: ViewBox;
  /** Ground contact and y-sort point (rig units). */
  foot: Point;
  /** Atlas px per rig unit at 1×. */
  ppu: number;
  views: Record<ViewId, RigView>;
  /** Parts that only some poses draw, hidden unless a clip's pose or code turns the group on. */
  optional?: Record<string, string[]>;
  notes?: string[];
}

/** The manifest frame name of a rig part. */
export function rigFrameName(rig: string, view: ViewId, pose: string, part: string): string {
  return `${rig}/${view}/${pose}/${part}`;
}

// ---- clips (code, src/host/render/clips/<rig>.ts) -------------------------------------------------

export interface Keyframe {
  /** ms from clip start. */
  t: number;
  /** Degrees, clockwise on screen. */
  rot?: number;
  dx?: number;
  dy?: number;
  sx?: number;
  sy?: number;
  alpha?: number;
}

export interface Clip {
  durationMs: number;
  loop: boolean;
  /** Pose set to draw while playing (a delivered override such as `point`), when the view has it. */
  pose?: string;
  /** Optional groups shown while playing (`speed` lines on the run). */
  groups?: string[];
  /** Keyframe tracks per part name. */
  tracks: Record<string, Keyframe[]>;
  /**
   * View stages (TF1-fix-1, SPEC §12.2): from each stage's `t` on, the whole body and/or single
   * parts (with their children) are drawn from another view's or pose's art. The rigs are 2D cut-outs
   * of a 3D figure, so a glance turns the head alone first, then the whole body.
   */
  stages?: ClipStage[];
  /**
   * Draw-order moves while playing (TF1-fix-1): each part is drawn right after the named part, or
   * last with `'top'` (a raised near arm in front of the head).
   */
  reorder?: Record<string, string>;
}

/** A view relative to the facing view: `'turn'` = side from front/back, front from side. */
export type ViewRef = ViewId | 'turn';

/** Where a part's art comes from during a stage: another view and/or pose of the same rig. */
export interface PartRef {
  view?: ViewRef;
  /** Pose in that view (default: the body's pose in the same view, else that view's default). */
  pose?: string;
}

export interface ClipStage {
  /** ms from clip start; the stage holds until the next one. */
  t: number;
  /** Draw the whole rig in this view (the look of a glance). */
  body?: ViewRef;
  /** Per-part art overrides; a part's children come along. */
  parts?: Record<string, PartRef>;
}

// ---- glances aimed at a theft (SPEC §6.6, §6.8; TF1-fix-2, `render/glance.ts`) ------------------

/** A body facing as the rigs draw it: front, back, or side facing screen-left / screen-right. */
export type Facing4 = 'front' | 'back' | 'left' | 'right';
export const FACINGS = ['front', 'back', 'left', 'right'] as const satisfies readonly Facing4[];

/** The rigs that glance: merchants (stall theft) and citizens (NPCs catching a pickpocket). */
export type GlanceRig = 'merchant' | 'citizen';

/** How a glance ends: the thief was caught mid-steal, or not. */
export type GlanceOutcome = 'caught' | 'clear';

export type GlanceStage = 'windup' | 'look' | 'point' | 'turnBack';

/** One step of a glance: `rig.setView(view, mirror)`, then play `clip` from its start. */
export interface GlanceStep {
  stage: GlanceStage;
  view: ViewId;
  mirror: boolean;
  clip: string;
  /** How long the step lasts, ms; null = it holds until the caller moves on (the point). */
  ms: number | null;
}

/** A glance from one facing toward a target (`planGlance`); `resolveGlance` adds the ending. */
export interface GlancePlan {
  rig: GlanceRig;
  /** The body facing before the glance (and after a clear one). */
  facing: Facing4;
  /** The facing that looks at the target. */
  toward: Facing4;
  /** Screen side the wind-up head turns to on a front/back body; null on a side body (front head). */
  headSide: 'left' | 'right' | null;
  windup: GlanceStep;
  look: GlanceStep;
}

// ---- sprites.json (frames that aren't rig parts) --------------------------------------------------

export type SpriteCategory = 'stalls' | 'map' | 'items' | 'effects' | 'ui';
export const SPRITE_CATEGORIES = [
  'stalls',
  'map',
  'items',
  'effects',
  'ui',
] as const satisfies readonly SpriteCategory[];

export type FrameCategory = SpriteCategory | 'characters';

/** SPEC §12.2 layers, back to front. The DOM HUD sits over the canvas. */
export const LAYER_IDS = ['ground', 'world', 'overlay'] as const;
export type LayerId = (typeof LAYER_IDS)[number];

export interface SpriteDef {
  category: SpriteCategory;
  /** Path under art/forum/. */
  file: string;
  /** Anchor (placement and y-sort point) in the file's own units. */
  anchor: Point;
  layer: LayerId;
  /** Atlas px per unit at 1×. */
  ppu: number;
  attach?: Record<string, Point>;
}

export interface SpritesJson {
  notes?: string[];
  frames: Record<string, SpriteDef>;
}

// ---- generated asset manifest (generated/manifest.ts) ---------------------------------------------

/** One packed raster of a frame: a run of shapes that share a tint slot (or none). */
export interface FrameLayerRef {
  /** Atlas frame name (identical rasters share one). */
  atlas: string;
  tint: TintSlot | null;
}

export interface FrameMeta {
  category: FrameCategory;
  /** Path under art/forum/. */
  file: string;
  viewBox: ViewBox;
  anchor: Point;
  layer: LayerId;
  ppu: number;
  /** Back to front. */
  layers: FrameLayerRef[];
  attach?: Record<string, Point>;
  rig?: { id: RigId; view: ViewId; pose: string; part: string };
}

export interface AtlasFile {
  scale: 1 | 2;
  key: string;
  /** Paths relative to generated/. */
  json: string;
  image: string;
  frames: number;
  size: readonly [number, number];
}

export interface AssetManifest {
  version: 1;
  frames: Record<string, FrameMeta>;
  rigs: readonly RigId[];
  atlases: readonly AtlasFile[];
}

// ---- camera (SPEC §12.2) --------------------------------------------------------------------------

export interface Camera {
  /** Tile width in px (48). */
  readonly tilePx: number;
  /** Ground depth factor (0.6): a tile is 48 px wide and 28.8 px deep. */
  readonly groundFactor: number;
  /** Ground point (tiles) and height z (tiles) → screen px. */
  toScreen(p: Vec2, z?: number): Vec2;
  /** Screen px → ground point (z = 0). */
  toWorld(s: Vec2): Vec2;
  /** Y-sort key: the foot point's screen y. */
  depth(p: Vec2): number;
}

// ---- rig instances --------------------------------------------------------------------------------

/** Colors per tint slot, `0xRRGGBB`. */
export type Tints = Partial<Record<TintSlot, number>>;

export interface RigOptions {
  view?: ViewId;
  /** Mirror (side view: face left; point poses: point the other way). */
  mirror?: boolean;
  /** Citizen outfits (tunic, mantle, hair, skin) from the shared pool (SPEC §6.11). */
  outfit?: Outfit;
  /** Extra slot colors (merchant `wrap`, a guard's `skin`). */
  tints?: Tints;
  /** Start clip (default `idle`). */
  clip?: string;
  /** Extra uniform scale on top of the character scale. */
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

/** One composed character on the world layer: citizen, merchant or guard. */
export interface RigInstance {
  readonly rigId: RigId;
  readonly view: ViewId;
  readonly mirrored: boolean;
  /** Current clip name, or null. */
  readonly clip: string | null;
  /** The playing one-shot clip has reached its end. */
  readonly clipDone: boolean;
  /** Foot point in screen px; the world layer sorts by `sortY` (default sy). */
  setPosition(sx: number, sy: number, sortY?: number): void;
  setView(view: ViewId, mirror?: boolean): void;
  /** Picks the view for a facing (radians, 0 = +x, y down): back up-screen, front down, side else. */
  face(radians: number): void;
  setOutfit(outfit: Outfit): void;
  setTint(slot: TintSlot, color: number | null): void;
  /** Plays `<rig>/<clip>` (a per-view `<clip>@<view>` wins); unknown clips return false. */
  play(clip: string, opts?: PlayOptions): boolean;
  clipMs(clip: string): number | null;
  setGroup(group: string, on: boolean): void;
  setAlpha(alpha: number): void;
  setVisible(visible: boolean): void;
  /** Named attach point (`hand`, `head-top`, `feet`) in screen px, or null. */
  attach(name: string): Vec2 | null;
  update(dtMs: number): void;
  destroy(): void;
}

// ---- stalls (SPEC §6.3, §6.6, ART_NOTES draw order) -----------------------------------------------

export interface StallInstance {
  readonly shop: ShopId;
  readonly open: boolean;
  /** Top-left of the 104 × 96 stall box in screen px; sorts at the counter's front edge. */
  setPosition(sx: number, sy: number): void;
  setOpen(open: boolean): void;
  /** Item ids per counter and shelf spot (null = empty); closed stalls draw none. */
  setItems(counter: readonly (string | null)[], shelf: readonly (string | null)[]): void;
  /** The stall's merchant, drawn between the shelf items and the counter; null removes him. */
  setMerchant(merchant: RigInstance | null): void;
  /** 0 = at the counter, 1 = at the back shelf (he rises on screen, SPEC §6.21). */
  setMerchantDepth(t: number, xUnits?: number): void;
  update(dtMs: number): void;
  destroy(): void;
}

// ---- stocks (SPEC §6.13; TF1-fix-1) ----------------------------------------------------------------

/**
 * The stocks in the lower-left corner. An occupant is drawn from `map/stocks-occupied-reference.svg`
 * (front view only, slightly larger than a character), tinted with that character's outfit; the
 * occupant's rig is hidden meanwhile (wiring: TF12).
 */
export interface StocksInstance {
  readonly occupied: boolean;
  /** The stocks' foot (anchor 30, 58 in its units) in screen px; it y-sorts there. */
  setPosition(sx: number, sy: number): void;
  /** An outfit puts a thief in the stocks; null empties them. */
  setOccupant(outfit: Outfit | null): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

// ---- effects (SPEC §6.9, §6.12–§6.14; choreography is TF20) ---------------------------------------

export const EFFECT_KINDS = [
  'alertBang',
  'caughtBurst',
  'glanceSwoosh',
  'glint',
  'questionBubble',
  'thiefBubble',
  'speedLines',
  'confetti',
  'fireworkGold',
  'fireworkWhite',
  'crown',
  'playerRing',
  'coin',
  'coinFlat',
] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

export interface EffectOptions {
  /** Lifetime, ms (default per kind). */
  ms?: number;
  /** Extra scale. */
  scale?: number;
  /** `player-ring` color (`--player`), 0xRRGGBB. */
  tint?: number;
  mirror?: boolean;
}

export interface EffectSpawner {
  /** A one-shot effect at a screen point (overlay layer, or ground for rings and the flat coin). */
  spawn(kind: EffectKind, at: Vec2, opts?: EffectOptions): void;
  /** Coin toss: arc from `from` to `to` (screen px), flipping, then the flat coin and a glint. */
  coinArc(from: Vec2, to: Vec2, ms?: number): void;
  /** Effects alive now. */
  readonly active: number;
  update(dtMs: number): void;
}
