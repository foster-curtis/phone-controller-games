// TV remove in the lobby (SPEC §11.1): press a slot's number once to arm it ("press again to remove"),
// again to confirm. Another slot or the timeout moves/clears the arm, so a stray press never kicks anyone.

export const ARM_MS = 4000;

export type ArmResult = 'armed' | 'confirmed';

export interface RemoveArm {
  /** A slot key was pressed at `now` (ms). */
  press(slot: number, now: number): ArmResult;
  /** The slot armed at `now`, or null. */
  armed(now: number): number | null;
  clear(): void;
}

export function createRemoveArm(): RemoveArm {
  let slot: number | null = null;
  let at = 0;
  const live = (now: number) => slot !== null && now - at < ARM_MS;
  return {
    press(s, now) {
      if (live(now) && slot === s) {
        slot = null;
        return 'confirmed';
      }
      slot = s;
      at = now;
      return 'armed';
    },
    armed: (now) => (live(now) ? slot : null),
    clear() {
      slot = null;
    },
  };
}
