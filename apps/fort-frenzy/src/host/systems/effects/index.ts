// Generic timed effects: one system for burn, poison, stun, slow, morale, shields and auras (SPEC §6.1,
// §7.1, §15.3). Extraction-ready (§15.1): effect ids and sources are generics, so the sim's
// `StatusEffect` list fits as is. Times are whole steps; callers convert config ms with `msToSteps`.
// `beforeEffect` immunity hooks run in the caller before `applyEffect`.
// Frozen at FF2 (BUILD_PLAN §3): additive changes only.

/**
 * - `refresh`: one instance; the timer resets to the longer of the two, the stronger strength wins
 *   (auras re-applied every step).
 * - `strongest`: one instance; a stronger apply replaces it, an equal one extends the timer, a weaker
 *   one is ignored (slows don't stack, §7.1).
 * - `stack`: one instance whose `stacks` grows by one per apply up to `maxStacks`; the timer resets
 *   to the longer, the strength is the stronger (burn, poison).
 */
export type Stacking = 'refresh' | 'strongest' | 'stack';

export interface EffectRule {
  stacking: Stacking;
  maxStacks?: number;
  /** Periodic tick (damage over time) every this many steps. */
  tickEvery?: number;
}

/** Structurally the sim's `StatusEffect`. */
export interface TimedEffect<E extends string = string, Src = number | null> {
  def: E;
  strength: number;
  /** Steps left. */
  remaining: number;
  stacks: number;
  source: Src;
  /** Steps until the next periodic tick. */
  nextTick?: number;
}

export interface EffectApplyOf<E extends string = string, Src = number | null> {
  def: E;
  strength: number;
  /** Steps. */
  duration: number;
  source: Src;
}

export type ApplyOutcome = 'added' | 'refreshed' | 'replaced' | 'stacked' | 'ignored';

/** Whole steps for a config time (at least 1 for any positive time). */
export function msToSteps(ms: number, hz: number): number {
  if (ms <= 0) return 0;
  return Math.max(1, Math.round((ms * hz) / 1000));
}

/** What the effect does now: strength × stacks (stacks are 1 except under `stack`). */
export function effectiveStrength(e: { strength: number; stacks: number }): number {
  return e.strength * e.stacks;
}

/** Applies `apply` to `list` (mutated) under `rule`; new effects go at the end (application order). */
export function applyEffect<E extends string, Src>(
  list: TimedEffect<E, Src>[],
  rule: EffectRule,
  apply: EffectApplyOf<E, Src>,
): ApplyOutcome {
  const cur = list.find((e) => e.def === apply.def);
  if (!cur) {
    const e: TimedEffect<E, Src> = {
      def: apply.def,
      strength: apply.strength,
      remaining: apply.duration,
      stacks: 1,
      source: apply.source,
    };
    if (rule.tickEvery) e.nextTick = rule.tickEvery;
    list.push(e);
    return 'added';
  }
  switch (rule.stacking) {
    case 'refresh':
      cur.remaining = Math.max(cur.remaining, apply.duration);
      if (apply.strength >= cur.strength) {
        cur.strength = apply.strength;
        cur.source = apply.source;
      }
      return 'refreshed';
    case 'strongest':
      if (apply.strength > cur.strength) {
        cur.strength = apply.strength;
        cur.remaining = apply.duration;
        cur.source = apply.source;
        return 'replaced';
      }
      if (apply.strength < cur.strength) return 'ignored';
      cur.remaining = Math.max(cur.remaining, apply.duration);
      cur.source = apply.source;
      return 'refreshed';
    case 'stack':
      cur.stacks = Math.min(cur.stacks + 1, rule.maxStacks ?? Infinity);
      cur.remaining = Math.max(cur.remaining, apply.duration);
      if (apply.strength >= cur.strength) {
        cur.strength = apply.strength;
        cur.source = apply.source;
      }
      return 'stacked';
  }
}

/**
 * One step: counts every timer down, fires `onPeriodic` for due periodic ticks (in application order,
 * the last one included), then drops expired effects from `list` (order kept). Returns the expired.
 */
export function tickEffects<E extends string, Src>(
  list: TimedEffect<E, Src>[],
  ruleOf: (def: E) => EffectRule,
  onPeriodic?: (e: TimedEffect<E, Src>) => void,
): TimedEffect<E, Src>[] {
  const expired: TimedEffect<E, Src>[] = [];
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    e.remaining--;
    const every = ruleOf(e.def).tickEvery;
    if (every && e.nextTick !== undefined) {
      e.nextTick--;
      if (e.nextTick <= 0) {
        e.nextTick += every;
        onPeriodic?.(e);
      }
    }
    if (e.remaining <= 0) expired.push(e);
    else list[w++] = e;
  }
  list.length = w;
  return expired;
}

/** One modifier per active effect, in application order, built from its effective strength. */
export function activeModifiers<E extends string, M>(
  list: readonly TimedEffect<E, unknown>[],
  make: (def: E, strength: number) => M,
): M[] {
  return list.map((e) => make(e.def, effectiveStrength(e)));
}
