// Phone input state → sim `PlayerInput` (SPEC §3, §12.5): the host stamps each `input` sample on
// receipt; older than `balance.net.inputStaleMs` the stick and the catch bit read zero, and the hold
// bit reads released after `balance.net.holdStaleMs` (BUILD_PLAN §8 [TF0]). Plain TS, no relay imports.
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
      last.set(id, { x, y, bits, at: now });
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
          catch: fresh && (s.bits & BIT_CATCH) !== 0,
        });
      }
      return out;
    },
  };
}
