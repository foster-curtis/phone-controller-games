// Match tuning constants (never frozen; tuned at checkpoints).

/** One fixed sim step (SPEC §8). Match time only advances through `tick(dtMs)`. */
export const STEP_MS = 1000 / 60;

/** Players needed to start a round (SPEC §6.1, §6.5). */
export const MIN_PLAYERS = 2;

/** Round-start countdown; eggs are frozen throughout (Build decisions). */
export const COUNTDOWN_MS = 3000;

/** Spectator emoji cooldown per phone (SPEC §6.6). */
export const EMOJI_COOLDOWN_MS = 1000;

/** Max name length after trimming (SPEC §6.3). */
export const NAME_MAX = 10;

export const KNOCKOUT_POINTS = 1;
export const SURVIVOR_POINTS = 3;

/** Target score by player count (Build decisions: n=2→15, 3→13, 4→12, 5–8→11). */
export const TARGET_SCORES: Readonly<Record<number, number>> = { 2: 15, 3: 13, 4: 12 };
export const TARGET_SCORE_MANY = 11;

/** sessionStorage key for host-refresh restore. */
export const STORAGE_KEY = 'sunny-side:match';

/** Float slack when counting fractional step times down to zero. */
export const TIME_EPSILON_MS = 1e-6;
