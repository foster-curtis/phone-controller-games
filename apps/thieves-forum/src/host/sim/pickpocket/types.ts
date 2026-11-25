// Pickpocket API (SPEC §6.8): who is behind whom, NPC victim glances, the take.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Content } from '../../../content/types';
import type { EntityId, World } from '../types';

export interface PickpocketApi {
  /** The character `actor` would pickpocket now (behind them, within reach), or null. */
  targetFor(world: World, actor: EntityId, content: Content): EntityId | null;
}
