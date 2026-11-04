// Host timers (SPEC §8): scatter, shoot and upload grace run on `performance.now()` deadlines. The
// clock pauses while the host tab is hidden, so a countdown resumes where it stopped. The match
// already scales `ms` by `timeScale` (config.ts `scaled`); these timers run what they are given.

export interface HostTimersEnv {
  /** Monotonic ms; default `performance.now()`. */
  now?: () => number;
  setTimeout?: (cb: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface HostTimers {
  /** Clock that stands still while paused (the match's `now`). */
  now(): number;
  /** (Re)starts `id`: `fire` runs once, `ms` of unpaused time from now. */
  start(id: string, ms: number, fire: () => void): void;
  clear(id: string): void;
  setPaused(paused: boolean): void;
  readonly paused: boolean;
  /** Clears every timer. */
  dispose(): void;
}

interface Pending {
  deadline: number;
  fire: () => void;
  handle: unknown;
}

export function createHostTimers(env: HostTimersEnv = {}): HostTimers {
  const realNow = env.now ?? (() => performance.now());
  const setT = env.setTimeout ?? ((cb, ms) => globalThis.setTimeout(cb, ms));
  const clearT =
    env.clearTimeout ??
    ((h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>));
  const timers = new Map<string, Pending>();
  /** Total paused time, and when the current pause began. */
  let offset = 0;
  let pausedAt: number | null = null;

  const now = () => (pausedAt ?? realNow()) - offset;

  function arm(id: string, p: Pending): void {
    p.handle = setT(
      () => {
        if (timers.get(id) !== p) return;
        // A late wake-up after a pause: re-arm for what is left.
        const left = p.deadline - now();
        if (left > 0) return arm(id, p);
        timers.delete(id);
        p.fire();
      },
      Math.max(0, p.deadline - now()),
    );
  }

  function clear(id: string): void {
    const p = timers.get(id);
    if (!p) return;
    if (p.handle !== null) clearT(p.handle);
    timers.delete(id);
  }

  return {
    now,
    start(id, ms, fire) {
      clear(id);
      const p: Pending = { deadline: now() + ms, fire, handle: null };
      timers.set(id, p);
      if (pausedAt === null) arm(id, p);
    },
    clear,
    setPaused(paused) {
      if (paused === (pausedAt !== null)) return;
      if (paused) {
        pausedAt = realNow();
        for (const p of timers.values()) {
          if (p.handle !== null) clearT(p.handle);
          p.handle = null;
        }
      } else {
        offset += realNow() - pausedAt!;
        pausedAt = null;
        for (const [id, p] of timers) arm(id, p);
      }
    },
    get paused() {
      return pausedAt !== null;
    },
    dispose() {
      for (const id of [...timers.keys()]) clear(id);
    },
  };
}
