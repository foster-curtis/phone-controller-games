// Generic modifiers: stat stacking with caps, hook ordering, module definitions (SPEC §6.1 stat math,
// §15.3). Extraction-ready (§15.1): no Fort Frenzy content, sim or render imports; stat ids and hook
// shapes come in as generics, so the sim's `StatMod`, `Modifier` and `Hooks` fit as they are.
// Frozen at FF2 (BUILD_PLAN §3): additive changes only.

/** One stat change. `addPct` is a fraction (+10% = 0.1); `add` is in the stat's own unit. */
export interface StatMod<S extends string = string> {
  stat: S;
  addPct?: number;
  add?: number;
  /** Which attack the change applies to; omitted = the whole unit. */
  scope?: string;
}

/** Bounds on a stat's summed `addPct` (`pctMin`/`pctMax`) and summed `add` (`addMin`/`addMax`). */
export interface StatCap {
  pctMin?: number;
  pctMax?: number;
  addMin?: number;
  addMax?: number;
}

export type StatCaps<S extends string = string> = Partial<Record<S, StatCap>>;

/** Anything carrying stat mods and hooks (passives, cards, effects, auras, bosses). */
export interface ModifierLike<S extends string = string, H = unknown> {
  id: string;
  stats?: readonly StatMod<S>[];
  hooks?: Partial<H>;
}

const clamp = (v: number, lo = -Infinity, hi = Infinity) => Math.min(hi, Math.max(lo, v));

const inScope = (m: StatMod, scope: string | undefined) =>
  m.scope === undefined || m.scope === scope;

/**
 * `base × (1 + clamp(Σ addPct, pctMin, pctMax)) + clamp(Σ add, addMin, addMax)` (§15.3): stacks add,
 * never multiply. Unscoped mods always count; scoped ones only when `scope` matches.
 */
export function statValue<S extends string>(
  base: number,
  mods: Iterable<StatMod<S>>,
  stat: S,
  cap: StatCap = {},
  scope?: string,
): number {
  let pct = 0;
  let add = 0;
  for (const m of mods) {
    if (m.stat !== stat || !inScope(m, scope)) continue;
    pct += m.addPct ?? 0;
    add += m.add ?? 0;
  }
  return base * (1 + clamp(pct, cap.pctMin, cap.pctMax)) + clamp(add, cap.addMin, cap.addMax);
}

/** Every stat in `base`, recomputed from `mods` (call when mods or effects change). */
export function computeStats<S extends string>(
  base: Readonly<Record<S, number>>,
  mods: readonly StatMod<S>[],
  caps: StatCaps<S> = {},
  scope?: string,
): Record<S, number> {
  const out = {} as Record<S, number>;
  for (const stat of Object.keys(base) as S[]) {
    out[stat] = statValue(base[stat], mods, stat, caps[stat], scope);
  }
  return out;
}

/** The stat mods of `modifiers`, flattened in attach order (a card picked twice counts twice). */
export function collectStatMods<S extends string>(
  modifiers: readonly { id: string; stats?: readonly StatMod<S>[] }[],
): StatMod<S>[] {
  const out: StatMod<S>[] = [];
  for (const m of modifiers) if (m.stats) out.push(...m.stats);
  return out;
}

/**
 * The `key` hook of every modifier, group by group in order (§15.3: a unit's mods in attach order,
 * then its status effects in application order). Modifiers without that hook are skipped.
 */
export function hookList<H, K extends keyof H>(
  groups: readonly (readonly { hooks?: Partial<H> }[])[],
  key: K,
): NonNullable<H[K]>[] {
  const out: NonNullable<H[K]>[] = [];
  for (const group of groups) {
    for (const m of group) {
      const fn = m.hooks?.[key];
      if (fn != null) out.push(fn as NonNullable<H[K]>);
    }
  }
  return out;
}

/** A module registered by id and built from config params. */
export interface ModuleDefOf<P, M> {
  id: string;
  make(params: P): M;
}

/** Modules are registered by id and built from config params (§15.3). */
export function defineModule<P, M>(id: string, make: (params: P) => M): ModuleDefOf<P, M> {
  return { id, make };
}
