// Phone input state → sim `PlayerInput` (SPEC §3, §12.5): the host stamps each `input` sample on
// receipt; older than `balance.net.inputStaleMs` the stick and the catch bit read zero, and the hold
// bit reads released after `balance.net.holdStaleMs` (BUILD_PLAN §8 [TF0]). A Catch! press is latched
// until the next step samples it, so a tap is never lost when the TV's timer runs late or packets bunch
// (TF12). Plain TS, no relay imports.
import { BIT_CATCH, BIT_HOLD, STICK_MAX } from '../../shared/messages';
import type { PlayerId, PlayerInput } from '../sim/types';

export interface InputStaleness {
  inputStaleMs: number;
  holdStaleMs: number;
}

interface Sample {
  x: number;
  y: number;
  bits: number;
  at: number;
  /** A catch press seen since the last `sample` (rising edge latch). */
  catchSeen: boolean;
}

export interface InputStore {
  /** A phone's `input { x, y, bits }`, stamped `now` (host ms). */
  set(id: PlayerId, x: number, y: number, bits: number, now: number): void;
  forget(id: PlayerId): void;
  clear(): void;
  /** This step's inputs for every phone that has sent one, staleness applied. */
  sample(now: number): Map<PlayerId, PlayerInput>;
}

export function createInputStore(stale: InputStaleness): InputStore {
  const last = new Map<PlayerId, Sample>();
  return {
    set(id, x, y, bits, now) {
      const was = last.get(id);
      const down = (bits & BIT_CATCH) !== 0;
      last.set(id, { x, y, bits, at: now, catchSeen: (was?.catchSeen ?? false) || down });
    },
    forget: (id) => void last.delete(id),
    clear: () => last.clear(),
    sample(now) {
      const out = new Map<PlayerId, PlayerInput>();
      for (const [id, s] of last) {
        const age = now - s.at;
        const fresh = age <= stale.inputStaleMs;
        out.set(id, {
          move: fresh ? { x: s.x / STICK_MAX, y: s.y / STICK_MAX } : { x: 0, y: 0 },
          hold: age <= stale.holdStaleMs && (s.bits & BIT_HOLD) !== 0,
          catch: (fresh && (s.bits & BIT_CATCH) !== 0) || s.catchSeen,
        });
        s.catchSeen = false;
      }
      return out;
    },
  };
}
