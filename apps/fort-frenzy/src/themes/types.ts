// Theme pack types (SPEC §2.1, §15.4): presentation only, no gameplay fields. Also the rig contract
// (§15.2 plus the art README's shared `viewBox` and `{ part, at }` attach points) and the generated
// asset manifest's shape (`generated/manifest.ts`, written by scripts/build-atlases.ts).
// The sim can't import this folder (lint, §15.1).
// Frozen at FF1 (BUILD_PLAN §3): additive changes only. That includes the manifest format.
import type {
  CardId,
  ClassId,
  DifficultyId,
  EnemyId,
  LaneId,
  SfxId,
  ShopItemId,
  StructureId,
  ThemeId,
} from '../shared/ids';

// ---- rigs (art/<theme>/rigs/<id>.json) ----------------------------------------------------------

export type ViewId = 'side' | 'front' | 'back';
export const VIEW_IDS = ['side', 'front', 'back'] as const satisfies readonly ViewId[];

export type Point = [x: number, y: number];
/** [minX, minY, width, height], SVG viewBox order. */
export type ViewBox = [x: number, y: number, w: number, h: number];

export interface RigPart {
  /** '<rig>/<view>/<part>' or '<rig>/<view>/<pose>/<part>'. */
  frame: string;
  /** The joint the part turns around. */
  pivot: Point;
  parent?: string;
  /** The same joint on the parent (equal to `pivot` at rest). */
  at: Point;
  /** Grayscale color part only; the player color is multiplied over it. */
  tint?: 'player';
  /** Glow piece (knights' `<host>-glow`, drawn right after its host); code can pulse/brighten it. */
  emissive?: boolean;
}

/** A named point that rides on a part: nametag, badge, carry, muzzle, sword-tip, eyes, top, … */
export interface RigAttach {
  part: string;
  at: Point;
}

export interface RigView {
  /** Anchor (ground contact, y-sort key), sprite units. */
  foot: Point;
  parts: Record<string, RigPart>;
  /** Back-to-front for this view (and pose). Lists every part, hidden ones included. */
  order: string[];
  attach?: Record<string, RigAttach>;
}

/** A view with several part sets (the Ranger: `stand` and `ready`, §2.4); others have one. */
export interface RigPoses {
  poses: Record<string, RigView>;
  defaultPose: string;
}

export interface RigDef {
  /** The theme's rig id: 'warden', 'colossus', 'mortar'. */
  id: string;
  /** Shared by every part in every view: parts stack at rest with no offsets. */
  viewBox: ViewBox;
  /** Enemies, the Colossus and the mortar: side only. */
  views: Partial<Record<ViewId, RigView | RigPoses>>;
  /** Named part groups, hidden unless code turns the group on. */
  optional?: Record<string, string[]>;
}

export function isPosed(v: RigView | RigPoses): v is RigPoses {
  return 'poses' in v;
}

// ---- clips (code, src/host/render/clips/<rig>.ts) -----------------------------------------------

export interface Keyframe {
  /** ms from clip start. */
  t: number;
  rot?: number;
  dx?: number;
  dy?: number;
  sx?: number;
  sy?: number;
  alpha?: number;
  glow?: number;
  /** Per-key draw-order swap (Colossus legs). */
  order?: string[];
}

export interface Clip {
  durationMs: number;
  loop: boolean;
  /** Keyframe tracks per part name. */
  tracks: Record<string, Keyframe[]>;
}

// ---- sprites.json (frames that aren't rig parts) ------------------------------------------------

export type FrameCategory = 'characters' | 'enemies' | 'structures' | 'effects' | 'map';
export const FRAME_CATEGORIES = [
  'characters',
  'enemies',
  'structures',
  'effects',
  'map',
] as const satisfies readonly FrameCategory[];

/** Ground (layers 1–2), world (layer 3, y-sorted) or effects (layer 4), §15.2. */
export type FrameLayer = 'ground' | 'world' | 'effects';

export interface SpriteFrameDef {
  category: FrameCategory;
  /** Path under art/<theme>/. */
  file: string;
  viewBox: ViewBox;
  anchor: Point;
  layer: FrameLayer;
  /** The whole frame is multiplied by the player color. */
  tint: boolean;
  attach?: Record<string, Point>;
}

export interface SpritesJson {
  notes?: string[];
  frames: Record<string, SpriteFrameDef>;
}

// ---- generated asset manifest (generated/manifest.ts) -------------------------------------------

/** Every frame the atlas script found, rig part or sprite, by frame name. */
export interface FrameMeta {
  category: FrameCategory;
  /** Path under art/<theme>/. */
  file: string;
  /** Rig parts: the rig's shared viewBox. */
  viewBox: ViewBox;
  /** Rig parts: the view's `foot`. */
  anchor: Point;
  /** Rig parts are `world`. */
  layer: FrameLayer;
  /** Sprites: `tint`; rig parts: `tint: 'player'`. */
  tint: boolean;
  /** Sprites: their attach points; rig parts: the view's attach points riding on this part. */
  attach?: Record<string, Point>;
  /** Has `class="glow"` groups: the atlas also packs `<frame>@unlit` (§15.10). */
  glow: boolean;
  /** Set for rig parts. */
  rig?: { id: string; view: ViewId; pose?: string; part: string; emissive: boolean };
}

/** Per-class front-view rest-pose images for the phones (§15.4). Paths relative to `generated/`. */
export interface PortraitFiles {
  /** Every always-on part, color parts drawn white (multiply the player color over the mask). */
  body: string;
  /** The visible color parts alone, as alpha (CSS `mask-image`). */
  mask: string;
}

export interface ThemeAssets {
  theme: ThemeId;
  frames: Record<string, FrameMeta>;
  /** Every rig id (rigs/<id>.json). */
  rigs: readonly string[];
  /** Every icon id (icons/<id>.svg, badge tiles excluded). */
  icons: readonly string[];
  /** Badge tiles (icons/badge-tile*.svg). */
  tiles: readonly string[];
  /** The phones' inline icon sprite: one `<symbol id="icon-<id>">` per icon and tile. */
  iconSprite: string;
  /** By rig id: every rig with a `class-<rig>` icon. */
  portraits: Record<string, PortraitFiles>;
}

export interface AssetManifest {
  version: 1;
  themes: Partial<Record<ThemeId, ThemeAssets>>;
}

/** Symbol id prefix in the icon sprite: `<use href="#icon-coins">`. */
export const ICON_SYMBOL_PREFIX = 'icon-';

// ---- theme packs (src/themes/<id>/) -------------------------------------------------------------

/** The icon sprite as phones and the TV DOM use it. */
export interface IconSprite {
  /** `<svg>` markup with one `<symbol>` per icon, injected once into the page. */
  markup: string;
  ids: readonly string[];
}

/** A packed atlas (FF3): Phaser JSON + image, at 1× or 2×. */
export interface AtlasRef {
  key: string;
  json: string;
  image: string;
  scale: 1 | 2;
}

/** Phones and TV. */
export interface ThemeShared {
  id: ThemeId;
  defaultDifficulty: DifficultyId;
  names: Record<ClassId | EnemyId | StructureId | ShopItemId | CardId | 'base' | 'faction', string>;
  /** Class card lines, card text. */
  flavor?: Partial<Record<string, string>>;
  /** art/<theme>/icons/*.svg as one inline SVG sprite. */
  icons: IconSprite;
  /** Icon ids for internal ids (fixed ids like `act-*` or `coins` need no mapping). */
  iconFor: {
    class: Record<ClassId, string>;
    main: Record<ClassId, string>;
    super: Record<ClassId, string>;
    structure: Record<StructureId, string>;
    shop: Record<ShopItemId, string>;
    card: Record<CardId, string>;
  };
  /** Front-view images (class select, lineup). `color` is the tint mask. */
  portraits: Record<ClassId, { body: string; color: string }>;
}

/** TV only. */
export interface ThemeHost {
  atlases: AtlasRef[];
  rigs: Record<string, RigDef>;
  /** By `<rig>/<clip>`. */
  clips: Record<string, Clip>;
  /** Rig ids for internal ids. */
  rigFor: {
    class: Record<ClassId, string>;
    enemy: Record<EnemyId, string>;
    soldier: string;
    structure: Partial<Record<StructureId, string>>;
  };
  /** Music joins this map in v2 (§13). */
  sfx: Partial<Record<SfxId, string>>;
  map: {
    ground: string[];
    edges: Record<'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw', string>;
    lanes: Record<LaneId, { open: string; sealed: string }>;
    decor?: string[];
  };
}
