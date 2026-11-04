// Boss-wave rules shared by every boss (SPEC §9.2, §9.4; FF11): which Mk a boss spawns as, the
// boss's spawn in its wave, and its death ending the wave. The bosses themselves are modules in the
// registry (`bosses`), so a new boss (§13) adds a file here and touches none of this.
import type { WaveDef } from '../../../content/types';
import type { FullState } from '../state';
import type { EnemyEnt, PendingSpawn } from '../types';

/** The Mk a boss spawns as in wave `n`: the wave data's, else by how far the run is (debug spawns). */
export function bossMk(def: WaveDef | undefined, n: number): 1 | 2 | 3 {
  return def?.boss?.mk ?? (n >= 15 ? 3 : n >= 10 ? 2 : 1);
}

/** A boss wave's boss: one unit up its wave's first lane, right after that lane's spawn warning. */
export function bossSpawn(def: WaveDef, atTick: number): PendingSpawn | null {
  if (!def.boss) return null;
  const lane = def.lanes[0];
  if (!lane) return null;
  return { atTick, lane, enemy: def.boss.id, count: 1, warned: false };
}

/**
 * The boss's death ends the wave (§9.2): once no boss is left alive, every other enemy collapses
 * (killed by itself, so it pays no coins and its death has no killer), and the wave's pending
 * spawns, enemy telegraphs and enemy shots are dropped. Runs at the start of the deaths pass.
 */
export function collapseAfterBoss(s: FullState): void {
  const w = s.world;
  let died = false;
  for (const e of w.enemies) {
    if (!e.boss) continue;
    if (e.hp > 0) return;
    died = true;
  }
  if (!died) return;
  for (const e of w.enemies) {
    if (e.hp <= 0) continue;
    e.hp = 0;
    s.killers.set(e.id, e.id);
  }
  w.spawns.length = 0;
  w.markers.length = 0;
  let write = 0;
  for (const p of w.projectiles) if (p.side !== 'theirs') w.projectiles[write++] = p;
  w.projectiles.length = write;
}

/** The living boss, if any (the TV's boss bar). */
export function livingBoss(enemies: readonly EnemyEnt[]): EnemyEnt | null {
  for (const e of enemies) if (e.boss && e.hp > 0) return e;
  return null;
}
