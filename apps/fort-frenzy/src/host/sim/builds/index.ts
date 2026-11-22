// Build behaviors by `BuildId` (SPEC §8.5, §15.3): what a placed build does. The shared pipeline
// (builds/core.ts) handles the meter, placement, flight, landing, switch-on, HP and targeting for
// every build; a behavior adds its effect (run in combat only, §7.1) and its exceptions. A build
// without a behavior can't be placed yet (its kit milestone registers it; the meter stays full).
// Append-only registry (REDESIGN_BUILD_PLAN §3; frozen after RD6): add entries, never rename one.
// Behaviors import only types, `internal.ts`, `geometry.ts`, `stats.ts` and card helpers, and this
// file only for types, so there are no import cycles.
import type { BuildDef } from '../../../content/types';
import type { BuildId } from '../../../shared/ids';
import type { SimState } from '../internal';
import type { BuildEnt, PlayerEnt } from '../types';
import { shieldGen } from './shieldGen';

export interface BuildBehavior {
  id: BuildId;
  /** Reads every content param it needs and throws on a missing one (content.test runs it). */
  check(def: BuildDef): void;
  /**
   * How many of this build a knight may have at once (the `maxActive` exception hook, mines);
   * default `def.maxActive` + the owner's `buildMax` adds.
   */
  maxActive?(s: SimState, owner: PlayerEnt, def: BuildDef): number;
  /** Each combat step while the build is active (§7.1: effects run in combat only). */
  combat?(s: SimState, b: BuildEnt, def: BuildDef): void;
}

export const buildBehaviors: Partial<Record<BuildId, BuildBehavior>> = {
  shield_gen: shieldGen, // RD3
};

/** Can this build be placed (has it a behavior)? The phone's build button reads the same. */
export function canPlace(kind: BuildId): boolean {
  return buildBehaviors[kind] !== undefined;
}
