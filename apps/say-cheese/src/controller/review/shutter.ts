// Shutter rules on the phone (SPEC §6.2 step 3, §6.7): 0.4 s cooldown so one tap isn't two shots, the
// 15-shot cap and the local end-of-shoot deadline are all enforced here, from `endsInMs`. Pure.
export interface ShutterState {
  /** Shots taken so far (also the next shot's 0-based index). */
  shots: number;
  /** Time of the last accepted shot (ms), or -Infinity. */
  lastAt: number;
}

export interface ShutterRules {
  cooldownMs: number;
  maxShots: number;
  /** Local deadline (ms, same clock as `now`). */
  deadlineAt: number;
}

export const initialShutter = (): ShutterState => ({ shots: 0, lastAt: -Infinity });

/** Why a tap was ignored, or `ok`. */
export function shutterVerdict(
  s: ShutterState,
  rules: ShutterRules,
  now: number,
): 'ok' | 'cooldown' | 'cap' | 'ended' {
  if (s.shots >= rules.maxShots) return 'cap';
  if (now >= rules.deadlineAt) return 'ended';
  if (now - s.lastAt < rules.cooldownMs) return 'cooldown';
  return 'ok';
}

/** Applies a tap: the new state when it takes a shot, else null. */
export function takeShot(s: ShutterState, rules: ShutterRules, now: number): ShutterState | null {
  return shutterVerdict(s, rules, now) === 'ok' ? { shots: s.shots + 1, lastAt: now } : null;
}

/** Shooting is over: the cap is reached or the deadline passed. */
export const shootOver = (s: ShutterState, rules: ShutterRules, now: number): boolean =>
  s.shots >= rules.maxShots || now >= rules.deadlineAt;
