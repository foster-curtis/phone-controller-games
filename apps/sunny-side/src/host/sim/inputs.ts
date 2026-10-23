// Per-player "latest input" records (SPEC §8 input sampling). The network side only overwrites a
// record; the sim consumes all records once at the start of each step and diffs the press
// counters (SPEC §7.2) into press events.
import { BUTTON_DASH, BUTTON_SLAM, STICK_MAX } from '../../shared/messages';
import type { InputTuple } from '../../shared/messages';
import type { SimPlayerId } from './types';

export interface StepInput {
  /** Stick, magnitude clamped to ≤ 1. +x right, +y down (screen/world space). */
  sx: number;
  sy: number;
  dashHeld: boolean;
  slamHeld: boolean;
  /** `dashCount` increased since the last step (any jump size → one press). */
  dashPressed: boolean;
  /** `slamCount` increased since the last step. */
  slamPressed: boolean;
}

export const NEUTRAL_INPUT: StepInput = Object.freeze({
  sx: 0,
  sy: 0,
  dashHeld: false,
  slamHeld: false,
  dashPressed: false,
  slamPressed: false,
});

interface InputRecord {
  latest: InputTuple | null;
  /** Counters seen at the last consume; `null` = no baseline yet (first sample is never a press). */
  seenDash: number | null;
  seenSlam: number | null;
}

/** A counter increase is a press; a decrease (phone reloaded) or first sighting just re-baselines. */
function diff(seen: number | null, now: number): boolean {
  return seen !== null && now > seen;
}

export class InputTable {
  private readonly records = new Map<SimPlayerId, InputRecord>();

  set(id: SimPlayerId, input: InputTuple | null): void {
    const rec = this.records.get(id);
    const latest = input ? ([...input] as InputTuple) : null;
    if (rec) rec.latest = latest;
    else this.records.set(id, { latest, seenDash: null, seenSlam: null });
  }

  /** Read every record once (call exactly once per step) and advance the counter baselines. */
  consume(): Map<SimPlayerId, StepInput> {
    const out = new Map<SimPlayerId, StepInput>();
    for (const [id, rec] of this.records) {
      const t = rec.latest;
      if (!t) {
        // `null` zeroes stick and buttons; baselines stay so a resumed phone doesn't fire stale presses.
        out.set(id, NEUTRAL_INPUT);
        continue;
      }
      const [x, y, buttons, dashCount, slamCount] = t;
      let sx = x / STICK_MAX;
      let sy = y / STICK_MAX;
      const mag = Math.hypot(sx, sy);
      if (mag > 1) {
        sx /= mag;
        sy /= mag;
      }
      out.set(id, {
        sx,
        sy,
        dashHeld: (buttons & BUTTON_DASH) !== 0,
        slamHeld: (buttons & BUTTON_SLAM) !== 0,
        dashPressed: diff(rec.seenDash, dashCount),
        slamPressed: diff(rec.seenSlam, slamCount),
      });
      rec.seenDash = dashCount;
      rec.seenSlam = slamCount;
    }
    return out;
  }
}
