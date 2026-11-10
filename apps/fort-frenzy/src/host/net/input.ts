// Phone input on the host (SPEC §11.4, §15.6): the input tuple becomes a `PlayerInput`, stamped with
// its receive time. Older than 250 ms, the phone reads as neutral (sticks zeroed, flags cleared), but
// its press counters still apply when they arrive, so a release is never lost. Presses made while the
// team is paused are swallowed (`hold` / `release`, FF14-fix-1), so nothing fires on resume.
import { neutralInput } from '../sim';
import type { InputSource, PlayerInput } from '../sim/types';
import {
  INPUT_FLAG_MAIN_AIMING,
  INPUT_FLAG_RADIAL_OPEN,
  INPUT_FLAG_SUPER_AIMING,
  type InputTuple,
} from '../../shared/messages';

/** §11.4: input older than this reads as neutral. */
export const INPUT_STALE_MS = 250;

const axis = (v: number) => Math.max(-1, Math.min(1, v / 100));

/** Tuple ints (−100..100) → the sim's −1..1 input. */
export function tupleToInput(t: InputTuple): PlayerInput {
  const flags = t[6];
  const slot = t[11];
  return {
    move: { x: axis(t[0]), y: axis(t[1]) },
    mainAim: { x: axis(t[2]), y: axis(t[3]) },
    superAim: { x: axis(t[4]), y: axis(t[5]) },
    mainAiming: (flags & INPUT_FLAG_MAIN_AIMING) !== 0,
    superAiming: (flags & INPUT_FLAG_SUPER_AIMING) !== 0,
    radialOpen: (flags & INPUT_FLAG_RADIAL_OPEN) !== 0,
    radialSlot: slot === 0 || slot === 1 || slot === 2 || slot === 3 ? slot : -1,
    mainFires: t[7],
    superFires: t[8],
    actionTaps: t[9],
    radialCommits: t[10],
  };
}

const COUNTERS = ['mainFires', 'superFires', 'actionTaps', 'radialCommits'] as const;
type Counters = Record<(typeof COUNTERS)[number], number>;

const countersOf = (i: PlayerInput): Counters => ({
  mainFires: i.mainFires,
  superFires: i.superFires,
  actionTaps: i.actionTaps,
  radialCommits: i.radialCommits,
});

/** One phone's latest sample with receive-time staleness (§15.6). The clock is injectable for tests. */
export class PhoneInputSource implements InputSource {
  private latest: PlayerInput = neutralInput();
  private at = -Infinity;
  /** Presses made during team pauses, subtracted from the phone's counters (FF14-fix-1). */
  private readonly off: Counters = { mainFires: 0, superFires: 0, actionTaps: 0, radialCommits: 0 };
  private shifted = false;
  /** The counters when a pause began, or null while running. */
  private heldAt: Counters | null = null;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly staleMs = INPUT_STALE_MS,
  ) {}

  /** A tuple (or decoded input) arrived now. */
  push(input: InputTuple | PlayerInput): void {
    this.latest = Array.isArray(input) ? tupleToInput(input) : input;
    this.at = this.now();
  }

  /** Receive time of the latest sample (ms on the injected clock). */
  get receivedAt(): number {
    return this.at;
  }

  /** A team pause began: presses from now until `release` never reach the sim (no buffered actions). */
  hold(): void {
    this.heldAt ??= countersOf(this.latest);
  }

  /** The pause ended: whatever the phone counted meanwhile is swallowed. */
  release(): void {
    const from = this.heldAt;
    if (!from) return;
    this.heldAt = null;
    for (const k of COUNTERS) {
      // A phone reload mid-pause restarts its counters: nothing to swallow then.
      const n = Math.max(0, this.latest[k] - from[k]);
      this.off[k] += n;
      if (n > 0) this.shifted = true;
    }
  }

  sample(_tick: number): PlayerInput {
    const l = this.latest;
    const c = countersOf(l);
    if (this.shifted) {
      for (const k of COUNTERS) {
        // A phone reload restarts its counters below the offset: drop it (the sim re-baselines).
        if (c[k] < this.off[k]) this.off[k] = 0;
        c[k] -= this.off[k];
      }
    }
    if (this.now() - this.at <= this.staleMs) return this.shifted ? { ...l, ...c } : l;
    return { ...neutralInput(), ...c };
  }
}
