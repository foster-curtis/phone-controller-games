// Gameplay config types (SPEC §12.4): items, shops, rarity, the balance sheet and the market layout.
// Content files in src/content/ are TS data typed with `satisfies` against these. Units: times in ms
// (the sim converts to ticks at load), distances in tiles (SPEC §12.2: 48 px wide, ground factor 0.6),
// speeds in tiles/s, rates and shares as fractions, money in denarii. Presentation never lives here.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only. Tuning values in src/content/ are not frozen.
import type { theme } from '../shared/theme';

// ---- geometry -----------------------------------------------------------------------------------

/** A point or direction on the ground plane, in tiles (x right, y down the screen). */
export interface Vec2 {
  x: number;
  y: number;
}

/** Axis-aligned rectangle on the ground plane, in tiles (x, y = top-left). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A closed polygon on the ground plane (tiles), points in order. */
export type Polygon = readonly Vec2[];

/** An inclusive `[min, max]` range (money, rates, ms). */
export type Range = readonly [min: number, max: number];

// ---- brand token names (presentation lives in theme.ts; content only names it) -------------------

/** An outfit fabric (`--fabric-*`, SPEC §6.0, §6.11). */
export type FabricId = keyof typeof theme.fabric;
/** A shop's canopy color (`--canopy-*`, SPEC §6.3). */
export type CanopyToken = keyof typeof theme.canopy;

// ---- shops and items (SPEC §6.5) ----------------------------------------------------------------

/** The 10 shops (SPEC §6.3). Append-only. */
export const SHOP_IDS = [
  'pawnbroker',
  'bakery',
  'pottery',
  'clothing',
  'wine',
  'smithy',
  'perfume',
  'spices',
  'rugs',
  'jewelry',
] as const;
export type ShopId = (typeof SHOP_IDS)[number];

/** An item's id (kebab-case, matches `art/forum/items/items.json`). Plain string: items are data. */
export type ItemId = string;

export type Rarity = 'common' | 'uncommon' | 'rare';
/** Where an item sits by default (SPEC §6.5 placement rule). */
export type Placement = 'counter' | 'shelf';

export interface ItemDef {
  id: ItemId;
  shop: ShopId;
  /** Display name (phone tiles, reveal cards). */
  name: string;
  /** Denarii. */
  value: number;
  /** Pack weight (capacity `balance.match.packCapacity`). */
  weight: number;
  rarity: Rarity;
  placement: Placement;
  /** Icon source under `art/forum/` (e.g. `items/bakery/loaf-of-bread.svg`). */
  icon: string;
}

/** How a stocked item comes back after it leaves the stall (SPEC §6.5). */
export interface RestockRule {
  /** ms until a taken common item reappears; 0 = at once. */
  commonMs: number;
  /** ms until a taken uncommon item reappears. */
  uncommonMs: number;
  /** Rare items never restock within a round (null). */
  rareMs: null;
}

export interface ShopDef {
  id: ShopId;
  /** Display name (stall view header, e.g. "Spices"). */
  name: string;
  canopy: CanopyToken;
  /** False for the pawnbroker: it buys only and stocks nothing (SPEC §6.5). */
  sells: boolean;
  /** Item slots per row when the stall is stocked (counter, back shelf). */
  slots: { counter: number; shelf: number };
  /** Rare items stocked per round (SPEC §7 "Rare stock"). */
  raresPerRound: number;
  restock: RestockRule;
}

// ---- outfits (SPEC §6.11) -----------------------------------------------------------------------

/** One character's outfit (SPEC §6.11): fabrics by brand token name, hair and skin as tone indices. */
export interface Outfit {
  tunic: FabricId;
  mantle: FabricId;
  hair: number;
  skin: number;
}

/** The shared outfit pool: players and NPCs draw from the same one (SPEC §6.11). */
export interface OutfitPool {
  tunics: readonly FabricId[];
  mantles: readonly FabricId[];
  /** Hair tones (indices into the renderer's tone table, SPEC §12.4). */
  hairTones: number;
  /** Skin tones (indices into the renderer's tone table). */
  skinTones: number;
}

// ---- balance (SPEC §7, §12.4) -------------------------------------------------------------------

export interface Personality {
  /** Walk speed multiplier range. */
  speed: Range;
  /** 0..1: chance per passed stall to slow, glance or browse (SPEC §6.10 technique 3). */
  distractibility: Range;
  /** Browse duration, ms. */
  browseMs: Range;
  /** Chance an NPC is the hurried kind that occasionally walks briskly (SPEC §6.10 gaits). */
  hurriedChance: number;
}

export interface Balance {
  /** SPEC §6.1, §6.2, §6.4. */
  match: {
    rounds: number;
    roundMs: number;
    roundMsRange: Range;
    openingMs: number;
    startPurse: number;
    packCapacity: number;
    /** Phone round-start countdown ("THIS IS YOU"), ms. */
    roundStartMs: number;
  };
  /** SPEC §6.4 luck: `min + (max − min) × r^skew`. */
  luck: { skew: number };
  /** SPEC §6.4 pawnbroker. */
  pawn: { rate: Range; rerollMs: number };
  /** SPEC §6.4 NPC buyers. */
  npcSale: { rate: Range };
  /** SPEC §6.10 crowd. */
  npcs: {
    base: number;
    perPlayer: number;
    /** ±fraction of the planned count. */
    tolerance: number;
    /** Tolerance floor (rounded, at least ±1). */
    toleranceMin: number;
    /** Starting money per NPC (build value). */
    purse: Range;
    /** Wish-list length (build value). */
    wishList: Range;
    personality: Personality;
    /** Seconds over which NPCs stream in after the opening (build value). */
    streamInMs: number;
    /** Chance an NPC chases a tossed coin it sees (SPEC §6.10 technique 5). */
    coinChaseChance: number;
  };
  /** SPEC §6.18 walk-on joins. */
  join: { handOffMs: number };
  /** SPEC §6.20 ambience. */
  ambience: { oneShotMs: Range; duckDb: number; duckMs: number };
  /** SPEC §6.5, §6.7 grab time `base + perWeight × weight + perValue × value`, rounded. */
  grab: {
    baseMs: number;
    perWeightMs: number;
    perValueMs: number;
    roundToMs: number;
    reachPenaltyMs: number;
  };
  /** SPEC §6.8. */
  pickpocket: {
    holdMs: number;
    amount: Range;
    /** Reach behind the victim, tiles (build value). */
    reach: number;
    /** Max angle off the victim's back, degrees (build value). */
    behindDeg: number;
  };
  /** SPEC §6.13 tip-offs, §12.6 snapshot. */
  tip: {
    fee: number;
    share: number;
    snapshotTtlMs: number;
    snapshotW: number;
    snapshotH: number;
    /** JPEG quality 0..1. */
    jpegQuality: number;
  };
  /** SPEC §6.13 catches. */
  catch: {
    wrongGrabPenalty: number;
    potShare: number;
    hotMs: number;
    graceMs: number;
    /** In-person grab reach, tiles (build value). */
    reach: number;
  };
  /** SPEC §6.13 stocks. */
  stocks: { ms: number; immunityMs: number };
  /** SPEC §6.12 guards. */
  guards: {
    escapeMs: number;
    /** Starting guards per round (index = round − 1) below / from `largeFrom` players. */
    start: { small: readonly number[]; large: readonly number[]; largeFrom: number };
    activationsPerGuard: number;
    cap: number;
    alleySpeed: number;
    walkSpeed: number;
    jogSpeed: number;
    coneRange: number;
    coneHalfDeg: number;
    /** Reach for a catch on arrival, tiles. */
    catchReach: number;
  };
  /** SPEC §6.9 coin toss. */
  toss: {
    cost: number;
    cooldownMs: number;
    /** Throw distance, tiles. */
    range: number;
    /** Flight + bounce + glint, ms (SPEC §6.9 "under 1 s"). */
    flightMs: number;
    /** Merchants within this distance of the coin react, tiles. */
    merchantRange: number;
  };
  /** SPEC §6.3 open stalls. */
  stalls: { openExtra: number; openMin: number; openMax: number };
  /** SPEC §6.6 merchants. */
  merchants: {
    suspicion: { glanceMult: number; decayMs: number };
    glanceIntervalMs: Range;
    /** Half-turn warning beat, ms. */
    windupMs: number;
    /** Over-the-shoulder look, ms. */
    lookMs: number;
    /** Chance per customer visit to bring a shelf item forward. */
    bringForwardChance: number;
    /** Chance he leaves it on the counter when distracted. */
    leaveOutChance: number;
    walkSpeed: number;
  };
  /** SPEC §6.8 NPC victims. */
  npcGlance: {
    chance: number;
    robbedChance: number;
    robbedMs: number;
    windupMs: number;
    lookMs: number;
  };
  /** SPEC §6.5 stock (per-shop slot counts live in shops.ts). */
  stock: { raresPerStall: number; uncommonRestockMs: number; commonRestockMs: number };
  /** SPEC §6.10 gaits, tiles/s. */
  movement: {
    shuffle: number;
    walk: number;
    brisk: number;
    jog: number;
    run: number;
    bodyRadius: number;
    /** Stick magnitude (0..1) above which a player jogs. */
    jogFrom: number;
  };
  /** SPEC §6.10 steering weights (technique 2). */
  crowd: { seek: number; wander: number; separation: number; separationRadius: number };
  /** SPEC §12.5 input staleness. */
  net: { inputStaleMs: number; holdStaleMs: number };
  /** SPEC §6.11 outfit pool. */
  outfit: OutfitPool;
}

// ---- layout (SPEC §6.3, §12.4) ------------------------------------------------------------------

export type LaneId = 'upper' | 'lower';
export const ENTRY_IDS = ['upperLeft', 'upperRight', 'lowerLeft', 'lowerRight'] as const;
export type EntryId = (typeof ENTRY_IDS)[number];
/** A stall slot's index in `LayoutDef.stalls` (0–4 top row, 5–9 middle row). */
export type StallId = number;

export interface StallSlotDef {
  id: StallId;
  row: 'top' | 'middle';
  /** The shop this slot holds when open. */
  shop: ShopId;
  /** Ground footprint: blocks walking and line of sight. */
  footprint: Rect;
  /** The lane its counter faces. */
  lane: LaneId;
  /** y of the counter's front edge. */
  counterY: number;
  /** Where a customer stands to browse: a segment along the counter front. */
  customer: { x0: number; x1: number; y: number };
  /** The merchant's walking lines behind the counter and at the back shelf (y). */
  merchantCounterY: number;
  merchantShelfY: number;
  /** Where the merchant walks out to (beside the stall) when he leaves the counter. */
  exit: Vec2;
}

export interface LaneDef {
  id: LaneId;
  rect: Rect;
  /** The lane's center line y (guards patrol here). */
  y: number;
}

export interface AlleyDef {
  id: string;
  rect: Rect;
  /** The middle-row stalls it runs between (stall ids). */
  between: readonly [StallId, StallId];
}

export interface PassageDef {
  id: 'left' | 'right';
  rect: Rect;
}

export interface EntryDef {
  id: EntryId;
  lane: LaneId;
  /** First point on screen. */
  at: Vec2;
  /** Spawn point just off screen. */
  spawn: Vec2;
  /** Phone copy: "You're walking in at the {label}" (SPEC §6.18). */
  label: string;
}

export interface GateDef {
  /** The gated aisle (blocked while closed). */
  rect: Rect;
  /** The top-row stall it sits beside (the center stall). */
  beside: StallId;
  /** Off-screen point reinforcements enter from. */
  spawn: Vec2;
  /** Where they step into the upper lane. */
  at: Vec2;
}

export interface StocksDef {
  rect: Rect;
  /** Standing slots (several thieves at once, SPEC §11 #27). */
  slots: readonly Vec2[];
}

export interface LayoutDef {
  id: string;
  /** World size in tiles. */
  size: { w: number; h: number };
  /** Projection (SPEC §12.2). */
  tilePx: number;
  groundFactor: number;
  lanes: Record<LaneId, LaneDef>;
  stalls: readonly StallSlotDef[];
  alleys: readonly AlleyDef[];
  passages: readonly PassageDef[];
  entries: readonly EntryDef[];
  gate: GateDef;
  stocks: StocksDef;
  /** Where characters may walk (lanes, alleys, passages). */
  walkable: readonly Polygon[];
  /** Line-of-sight and movement blockers (stall footprints, the stocks, the closed gate). */
  blockers: readonly Rect[];
  /** The guards' natural loop (SPEC §6.12): upper lane → alley → lower lane → end passage. */
  patrol: readonly Vec2[];
}

// ---- the bundle -------------------------------------------------------------------------------

export interface Content {
  balance: Balance;
  items: readonly ItemDef[];
  shops: Readonly<Record<ShopId, ShopDef>>;
  layout: LayoutDef;
}
