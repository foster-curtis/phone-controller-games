// Phone input on the host (SPEC §11.4, §15.6): the input tuple becomes a `PlayerInput`, stamped with
// its receive time. Older than 250 ms, the phone reads as neutral (sticks zeroed, flags cleared), but
// its press counters still apply when they arrive, so a release is never lost.
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

/** One phone's latest sample with receive-time staleness (§15.6). The clock is injectable for tests. */
export class PhoneInputSource implements InputSource {
  private latest: PlayerInput = neutralInput();
  private at = -Infinity;

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

  sample(_tick: number): PlayerInput {
    if (this.now() - this.at <= this.staleMs) return this.latest;
    const l = this.latest;
    return {
      ...neutralInput(),
      mainFires: l.mainFires,
      superFires: l.superFires,
      actionTaps: l.actionTaps,
      radialCommits: l.radialCommits,
    };
  }
}
