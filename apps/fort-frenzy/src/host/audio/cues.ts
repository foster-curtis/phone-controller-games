// Sim events → sound cues (SPEC §12; BUILD_PLAN FF13). Append-only registry (BUILD_PLAN §3): add
// entries at the end, never reorder or delete.
import type { SfxId } from '../../shared/ids';
import type { SimEvent } from '../sim/events';

export interface Cue {
  /** Which event plays it. */
  on: SimEvent['e'];
  sfx: SfxId;
  /** Optional filter on the event. */
  when?: (e: SimEvent) => boolean;
}

export const cues: readonly Cue[] = [];
