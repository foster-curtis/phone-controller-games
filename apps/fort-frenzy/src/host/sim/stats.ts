// Stat blocks and attack stats (SPEC §6.1 stacking, §15.3 stats). A unit's `stats` holds unit-level
// values (max HP, move speed, damage reduction, respawn time, super charge rate…); attack values
// (damage, range, cooldown…) come from the attack's def through `attackStat`, scoped to its button.
// Leaf module: no registry imports (behaviors registered there use it).
import { STAT_IDS, type StatId, type StatMod } from '../../content/types';
import type { EffectId } from '../../shared/ids';
import { statValue, type StatCap } from '../systems/modifiers';
import type { EffectDef, Modifier, StatBlock, StatusEffect, Unit } from './types';

export type EffectTable = Partial<Record<EffectId, EffectDef>>;
export type Caps = Partial<Record<StatId, StatCap>>;

/** A full block: every stat present (0 unless given). */
export function statBlock(values: Partial<StatBlock>): StatBlock {
  const out = {} as StatBlock;
  for (const id of STAT_IDS) out[id] = values[id] ?? 0;
  return out;
}

const effectMods = new WeakMap<StatusEffect, { k: number; def: EffectDef; m: Modifier }>();

/**
 * An effect's modifier at its current strength × stacks, made once per effect and strength
 * (FF15 perf: auras re-made it for every unit, every step, in both hooks and stats). Effect
 * modifiers are pure functions of the strength, so the same object serves until it changes.
 */
function effectModifier(def: EffectDef, e: StatusEffect): Modifier {
  const k = e.strength * e.stacks;
  const hit = effectMods.get(e);
  if (hit && hit.k === k && hit.def === def) return hit.m;
  const m = def.modifier(k);
  effectMods.set(e, { k, def, m });
  return m;
}

/** The unit's modifiers in attach order, then one per status effect in application order (§15.3). */
export function modifiersOf(u: Unit, effects: EffectTable): readonly Modifier[] {
  if (u.effects.length === 0) return u.mods;
  const out = u.mods.slice();
  for (const e of u.effects) {
    const def = effects[e.def];
    if (def) out.push(effectModifier(def, e));
  }
  return out;
}

function statMods(mods: readonly Modifier[]): StatMod[] {
  const out: StatMod[] = [];
  for (const m of mods) if (m.stats) for (const s of m.stats) out.push(s);
  return out;
}

const STAT_INDEX = new Map<string, number>(STAT_IDS.map((id, i) => [id, i]));
const sumPct = new Float64Array(STAT_IDS.length);
const sumAdd = new Float64Array(STAT_IDS.length);

function sumUnscoped(stats: readonly StatMod[] | undefined) {
  if (!stats) return;
  for (const s of stats) {
    if (s.scope !== undefined) continue;
    const i = STAT_INDEX.get(s.stat);
    if (i === undefined) continue;
    if (s.addPct !== undefined) sumPct[i] = sumPct[i]! + s.addPct;
    if (s.add !== undefined) sumAdd[i] = sumAdd[i]! + s.add;
  }
}

const clamp = (v: number, lo = -Infinity, hi = Infinity) => Math.min(hi, Math.max(lo, v));

/**
 * Recomputes `u.stats` from `base` and the unit's modifiers; keeps HP within the new max.
 *
 * FF15 perf: one pass over the mods into per-stat sums (was `statValue` per stat over a flattened
 * copy). The sums add in the same mod order and the formula is `statValue`'s, so results are exact.
 */
export function refreshStats(u: Unit, base: StatBlock, effects: EffectTable, caps: Caps): void {
  sumPct.fill(0);
  sumAdd.fill(0);
  for (const m of u.mods) sumUnscoped(m.stats);
  for (const e of u.effects) {
    const def = effects[e.def];
    if (def) sumUnscoped(effectModifier(def, e).stats);
  }
  for (let i = 0; i < STAT_IDS.length; i++) {
    const id = STAT_IDS[i]!;
    const cap = caps[id];
    u.stats[id] =
      base[id] * (1 + clamp(sumPct[i]!, cap?.pctMin, cap?.pctMax)) +
      clamp(sumAdd[i]!, cap?.addMin, cap?.addMax);
  }
  u.maxHp = u.stats.maxHp;
  if (u.hp > u.maxHp) u.hp = u.maxHp;
}

/** One attack value: `base` through the unit's mods for `stat`, scoped to `scope` (main/super). */
export function attackStat(
  u: Unit,
  base: number,
  stat: StatId,
  scope: 'main' | 'super' | 'passive' | undefined,
  effects: EffectTable,
  caps: Caps,
): number {
  const mods = modifiersOf(u, effects);
  let any = false;
  for (const m of mods) if (m.stats !== undefined && m.stats.length > 0) any = true;
  if (!any) return base;
  return statValue(base, statMods(mods), stat, caps[stat], scope);
}
