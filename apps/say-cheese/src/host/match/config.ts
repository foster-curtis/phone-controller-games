// Match tuning (SPEC §6.1, §6.2, §6.4, §6.3). Frozen at SC0 (BUILD_PLAN §3): names are additive only;
// values are tuning and change freely.

/** Scatter countdown. */
export const SCATTER_MS = 10_000;
/** Shoot phase cap. */
export const SHOOT_MS = 20_000;
/** Shoot ends at this many shots. */
export const MAX_SHOTS = 15;
/** One tap is one shot. */
export const SHUTTER_COOLDOWN_MS = 400;
/** Upload phase waits this long for missing photos, then moves on. */
export const UPLOAD_GRACE_MS = 10_000;
/** Tag circle diameter, as a fraction of the photo's short side. */
export const TAG_SIZE_FRAC = 0.12;
/** Rules overview cards (SPEC §6.2.1). */
export const RULES_CARDS = 5;
/** `sessionStorage` key for the host-refresh snapshot. */
export const PERSIST_KEY = 'say-cheese:match';

/** Multiplier on the scatter/shoot/upload timers: 1 in play, `?timeScale=0.1` (debug) in e2e. */
export let timeScale = 1;

/** Reads `?timeScale=` when debug hooks are on; ignores junk. Host wiring calls it once at boot. */
export function setTimeScale(value: number): void {
  if (Number.isFinite(value) && value > 0 && value <= 1) timeScale = value;
}

export function scaled(ms: number): number {
  return Math.round(ms * timeScale);
}
