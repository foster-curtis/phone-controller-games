// Per-wave class growth (SPEC §6.1, §8.1; RD11): at every wave's end each knight gets its class's
// growth list, the `boss` list after a boss wave in place of `regular`. Bumps are counted on the
// player (`PlayerEnt.growth`, saved in the snapshot) and become one `growth` modifier: the lists ×
// their counts, additive percentages like the cards' stat math. Only uncapped stats grow (a stat with
// a `rules.statCaps` entry is skipped), so growth never uses up the shared +40% caps.
import type { StatMod } from '../../content/types';
import type { Catalog } from './catalog';
import { effects as effectDefs } from './registry';
import type { FullState } from './state';
import { refreshStats } from './stats';
import type { Modifier, PlayerEnt } from './types';

const ID = 'growth';

/** The stat changes a list adds `n` times, capped stats left out. */
function times(cat: Catalog, mods: readonly StatMod[], n: number): StatMod[] {
  if (n <= 0) return [];
  const caps = cat.rules.statCaps;
  return mods
    .filter((m) => caps[m.stat] === undefined)
    .map((m) => ({
      ...m,
      ...(m.addPct !== undefined ? { addPct: m.addPct * n } : {}),
      ...(m.add !== undefined ? { add: m.add * n } : {}),
    }));
}

/** The player's growth modifier from their bump counts (null before the first bump). */
export function growthModifier(cat: Catalog, p: PlayerEnt): Modifier | null {
  const g = cat.role(cat.knight(p.classId).role).growth;
  const stats = [...times(cat, g.regular, p.growth.regular), ...times(cat, g.boss, p.growth.boss)];
  return stats.length > 0 ? { id: ID, stats } : null;
}

/** Puts the player's growth modifier on (replacing the old one); new max HP comes in full. */
export function attachGrowth(s: FullState, p: PlayerEnt): void {
  const m = growthModifier(s.cat, p);
  const at = p.mods.findIndex((x) => x.id === ID);
  if (at >= 0) p.mods.splice(at, 1);
  if (m) p.mods.push(m);
  const before = p.maxHp;
  refreshStats(p, s.baseStats.get(p.id)!, effectDefs, s.caps);
  if (p.respawnAt === null && p.maxHp > before) p.hp += p.maxHp - before;
}

/** The end of wave `w.wave`: every knight grows (`growth` event per slot). */
export function growKnights(s: FullState): void {
  const boss = s.cat.wave(s.world.wave)?.boss !== undefined;
  for (const p of s.world.players) {
    if (boss) p.growth.boss++;
    else p.growth.regular++;
    attachGrowth(s, p);
    s.emit({ e: 'growth', slot: p.slot, boss });
  }
}
