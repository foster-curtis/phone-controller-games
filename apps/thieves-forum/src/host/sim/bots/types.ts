// Bot API for the economy harness (SPEC §12.9, TF17): seeded policies that play a round headless
// through the same input and commands as phones. Never used in a real match (SPEC §6.1: no bots).
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.
import type { Rng } from '@pcg/game-kit';
import type { PlayerId, PlayerInput, SimCommand, World } from '../types';

export interface BotDecision {
  input: PlayerInput;
  commands: SimCommand[];
}

export interface BotPolicy {
  id: string;
  /** Reads the full world (bots are a test harness, not players). */
  decide(world: World, player: PlayerId, rng: Rng): BotDecision;
}
