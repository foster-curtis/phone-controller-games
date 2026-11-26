// Host hold machine API (SPEC §3, §6.7, §6.8, §6.13, §12.3): GRAB and PICKPOCKET timed from the `hold`
// bit. A hold is armed (TF8 on a `grab` command, TF14 when the bit rises behind someone), starts on the
// first step that sees the bit set, and completes after its duration of continuous host-observed hold.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only. The full machine API froze at TF3.
import type { HoldKind, HoldResult } from '../../../shared/hold';
import type { StepContext } from '../systems';
import type { Character, EntityId, Hold, HoldTarget, StallId, Tick, World } from '../types';

/**
 * How long an arm waits for the `hold` bit before it disarms (BUILD_PLAN TF3 risks: the `grab` event
 * can arrive before the bit). Not a §7 value; kept beside the machine (BUILD_PLAN §8 [TF3]).
 */
export const ARM_WAIT_MS = 500;

/** A hold waiting for the actor's `hold` bit (SPEC §12.3). */
export interface HoldArm {
  actor: EntityId;
  kind: HoldKind;
  target: HoldTarget;
  /** Hold time once started, ms (GRAB: the tile's `grabMs`; PICKPOCKET: `balance.pickpocket.holdMs`). */
  durationMs: number;
  /** Disarms at this tick if the bit never came. */
  expiresAt: Tick;
}

/** The machine's own round state (`World.holdMachine`). */
export interface HoldMachineState {
  /** Next `Hold.id` (per round, never reused; separate from entity ids so ids leak nothing). */
  nextId: number;
  arms: HoldArm[];
}

export interface HoldsApi {
  /** Starts a hold if the actor may (one at a time; item not held by another). Null if refused. */
  start(ctx: StepContext, actor: EntityId, kind: HoldKind, target: HoldTarget): Hold | null;
  /** Ends a hold with a result (emits `holdEnd`, stamps `holdEndedAt`). */
  end(ctx: StepContext, hold: Hold, result: HoldResult): void;
  /** The actor's live hold, if any. */
  activeFor(world: World, actor: EntityId): Hold | null;
  /** True while the character is mid-steal (a live hold), or within `graceTicks` of one ending. */
  isMidSteal(world: World, actor: EntityId, graceTicks: number): boolean;

  // ---- TF3 additions ----

  /**
   * Arms GRAB on a stall slot for `ms` (the tile's `grabMs`, reach penalty included). Starts on the
   * first step that sees the actor's `hold` bit; disarms after `ARM_WAIT_MS`. False if refused (a live
   * hold, an empty slot, an item held by another, or a back-shelf slot while the merchant is not away).
   */
  armGrab(ctx: StepContext, actor: EntityId, stall: StallId, slot: number, ms: number): boolean;
  /** Arms PICKPOCKET on `victim` for `balance.pickpocket.holdMs`; same start and refusal rules. */
  armPickpocket(ctx: StepContext, actor: EntityId, victim: EntityId): boolean;
  /** A merchant, NPC or player caught `actor` mid-hold: ends the live hold as `caught`. */
  caught(ctx: StepContext, actor: EntityId): Hold | null;
  /** Hot hands (SPEC §6.13): within `catch.hotMs` of starting any steal, whatever its outcome. */
  isHot(character: Character, tick: Tick): boolean;
}
