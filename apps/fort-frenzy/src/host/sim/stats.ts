// Stat blocks and attack stats (SPEC §6.1 stacking, §15.3 stats). A unit's `stats` holds unit-level
// values (max HP, move speed, damage reduction, respawn time, super charge rate…); attack values
// (damage, range, cooldown…) come from the attack's def through `attackStat`, scoped to its button.
// Leaf module: no registry imports (behaviors registered there use it).
import { STAT_IDS, type StatId, type StatMod } from '../../content/types';
import type { EffectId } from '../../shared/ids';
import { statValue, type StatCap } from '../systems/modifiers';
import type { EffectDef, Modifier, StatBlock, Unit } from './types';

export type EffectTable = Partial<Record<EffectId, EffectDef>>;
export type Caps = Partial<Record<StatId, StatCap>>;

/** A full block: every stat present (0 unless given). */
export function statBlock(values: Partial<StatBlock>): StatBlock {
  const out = {} as StatBlock;
  for (const id of STAT_IDS) out[id] = values[id] ?? 0;
  return out;
}

/** The unit's modifiers in attach order, then one per status effect in application order (§15.3). */
export function modifiersOf(u: Unit, effects: EffectTable): readonly Modifier[] {
  if (u.effects.length === 0) return u.mods;
  const out = u.mods.slice();
  for (const e of u.effects) {
    const def = effects[e.def];
    if (def) out.push(def.modifier(e.strength * e.stacks));
  }
  return out;
}

function statMods(mods: readonly Modifier[]): StatMod[] {
  const out: StatMod[] = [];
  for (const m of mods) if (m.stats) for (const s of m.stats) out.push(s);
  return out;
}

/** Recomputes `u.stats` from `base` and the unit's modifiers; keeps HP within the new max. */
export function refreshStats(u: Unit, base: StatBlock, effects: EffectTable, caps: Caps): void {
  const mods = statMods(modifiersOf(u, effects));
  for (const id of STAT_IDS) u.stats[id] = statValue(base[id], mods, id, caps[id]);
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
