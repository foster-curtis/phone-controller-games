// Guard API (SPEC §6.12, §6.13): patrols, view cones, spots, alerts, chase and escape, collecting a
// landed tip, marching to the stocks, escalation. Other subsystems raise alerts through it.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Balance, LaneId } from '../../../content/types';
import type { StepContext } from '../systems';
import type { ActivationCause, EntityId, PlayerId } from '../types';

export interface GuardsApi {
  /**
   * An NPC or merchant shouted THIEF! at `thief` in `lane`: every guard in that lane (or the nearest
   * guard) jogs at them and a chase starts. Counts as an activation (SPEC §6.12).
   */
  raiseAlert(ctx: StepContext, thief: EntityId, lane: LaneId, cause: ActivationCause): void;
  /** A landed tip: the nearest free guard collects `thief`, locked in (SPEC §6.13). */
  collect(ctx: StepContext, thief: EntityId, tipper: PlayerId): void;
  /** Starting guards for a round (SPEC §6.12). */
  startingGuards(players: number, round: number, balance: Balance): number;
}
