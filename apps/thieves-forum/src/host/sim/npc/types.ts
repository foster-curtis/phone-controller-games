// NPC crowd API (SPEC §6.10, §12.3): spawning shoppers and their minds (all five techniques). Its own
// module because the disguise depends on it (SPEC §5). Also drives takeover and walk-on characters.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Rng } from '@pcg/game-kit';
import type { Content, EntryId, ShopId, StallId, Vec2 } from '../../../content/types';
import type { StepContext } from '../systems';
import type { Character, Npc, Tick } from '../types';

export interface NpcApi {
  /**
   * A fresh mind: personality, wish list, wants, purse and sale rate rolled from `rng`. `open` (TF2,
   * additive) limits the wish list to the round's open shops.
   */
  createMind(rng: Rng, content: Content, open?: readonly ShopId[]): Npc;
  /** Spawns a new NPC shopper just off screen at `entry`, walking in. */
  spawn(ctx: StepContext, entry: EntryId): Character;
}

/** Crowd churn bookkeeping (SPEC §6.10, §6.2 stream-in). TF2, additive (`World.crowd`). */
export interface CrowdState {
  /** Tick play started (the stream-in is timed from it), or −1 before play. */
  playStart: Tick;
  /** NPCs spawned so far this round (stream-in plus churn arrivals). */
  spawned: number;
  /** NPCs that walked off this round. */
  exited: number;
  /** The next churn arrival may come at this tick. */
  nextArrivalAt: Tick;
}

/** Which kind of walk an NPC is on (SPEC §6.10 techniques 1, 3, 5). TF2, additive. */
export type NpcLeg = 'none' | 'entry' | 'stall' | 'roam' | 'back' | 'coin' | 'exit';

/**
 * An NPC's steering and navigation memory (SPEC §6.10 techniques 2, 3, 5), kept on the mind so the
 * whole crowd lives in `World` (hashable, replayable). TF2, additive (`Npc.nav`).
 */
export interface NpcNav {
  leg: NpcLeg;
  /** Waypoints still to walk, next first. */
  path: Vec2[];
  /** The stall it is heading to or standing at, or null. */
  stall: StallId | null;
  /** Customer spot index at `stall`, or −1. */
  spot: number;
  /** Detour browse at a stall not on the wish list (technique 3). */
  detour: boolean;
  /** Wander drift angle, radians (technique 2). */
  wander: number;
  /** Speed multiplier while slowed or glancing (technique 3), and when it ends. */
  slow: number;
  slowUntil: Tick;
  /** Glancing at this stall while slowed (technique 3), or null. */
  look: StallId | null;
  /** Standing still before choosing a direction until this tick (technique 5). */
  pauseUntil: Tick;
  /** Stalls already rolled for a detour on this leg. */
  passed: StallId[];
  /** Walking briskly this leg (hurried personality, §6.10 gaits). */
  brisk: boolean;
  /** The entry it walks off by, while leaving. */
  exit: EntryId | null;
  /** Ticks in a row it has not moved, and ticks blocked while trying to walk. */
  still: number;
  stuck: number;
  /** Last position (for `still` / `stuck`). */
  lastX: number;
  lastY: number;
}
