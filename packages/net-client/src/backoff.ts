// Reconnect backoff: exponential from 250 ms, capped at 4 s, with jitter.

export const BACKOFF_BASE_MS = 250;
export const BACKOFF_MAX_MS = 4_000;

/**
 * Delay before reconnect attempt `attempt` (0-based). The un-jittered ceiling doubles from
 * BACKOFF_BASE_MS up to BACKOFF_MAX_MS; jitter picks a value in [75%, 100%] of it.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(ceiling * (0.75 + 0.25 * random()));
}
