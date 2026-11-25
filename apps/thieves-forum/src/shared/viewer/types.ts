// Host-granted private views (SPEC §2, §12.6): the stall view state and the tip-off snapshot header
// with its tappable hit areas. No game imports, so this folder can move into `@pcg/net-client` once a
// second game needs it (SPEC §4; extraction candidate, BUILD_PLAN §8).
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.

/** A tile's grab state on the phone (SPEC §6.7, §6.17). */
export type ViewItemState = 'free' | 'takenByOther' | 'tooHeavy' | 'outOfReach';

export type ViewRarity = 'common' | 'uncommon' | 'rare';

/** One item tile in a stall view row. */
export interface StallViewItem {
  /** Slot id within the stall, echoed back by `grab {stall, slot}`. Unique across both rows. */
  slot: number;
  item: string;
  name: string;
  /** Denarii (the buy price = the item's value). */
  price: number;
  /** Host hold time for this tile now, ms (the back-shelf reach penalty already added). */
  grabMs: number;
  rarity: ViewRarity;
  state: ViewItemState;
}

/** A stall's contents as the browsing player may see them (state, not pixels; SPEC §2). */
export interface StallView {
  stall: number;
  /** Header color: a brand canopy token name (`theme.canopy.*`). */
  canopy: string;
  /** Header text, e.g. "Spices". */
  title: string;
  /** "Counter · hold to grab" (items the merchant brought forward included). */
  counter: StallViewItem[];
  /** "Back shelf": `outOfReach` while the merchant is behind his counter. */
  shelf: StallViewItem[];
}

/** The one-time tip-off still frame (SPEC §6.13, §12.6). Its bytes arrive by blob transfer. */
export interface TipSnapshot {
  /** Also the blob id of its bytes. */
  id: number;
  /** Snapshot pixels. */
  w: number;
  h: number;
  mime: 'image/jpeg' | 'image/webp';
  /** Decoded size in bytes. */
  bytes: number;
}

/** A tappable character in the snapshot, in snapshot pixels. `targetId` is opaque (host-mapped). */
export interface HitArea {
  targetId: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
