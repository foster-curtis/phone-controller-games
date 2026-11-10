// Snare (neon knights: shock net, SPEC §7.1): no HP, never blocks or reroutes. While armed, a ground
// enemy on its tile sets it off: every ground enemy on the tile is slowed and one discharge is used;
// it rearms after `rearmMs`. The last discharge fizzles it out and frees the tile (lifecycle.ts
// removes it, with no flow-field rebuild). Discharges persist across waves (it only ticks in combat).
// Also the slow effect: strongest wins, no stacking (§7.1); Brutes and the Colossus take it at half
// strength through `EnemyDef.slowResist` (state.ts applyEffect).
import { circleTouchesTile } from '../geometry';
import { state } from '../internal';
import type { EffectDef, SimCtx, StructureEnt } from '../types';

export const slowEffect: EffectDef = {
  id: 'slow',
  stacking: 'strongest',
  modifier: (strength) => ({
    id: 'effect:slow',
    stats: [{ stat: 'moveSpeed', addPct: -Math.min(1, Math.max(0, strength)) }],
  }),
};

export function snareTick(ctx: SimCtx, st: StructureEnt): void {
  const s = state(ctx);
  if (st.discharges === null || st.discharges <= 0) return;
  const t = s.tick();
  if (st.rearmAt !== null && t < st.rearmAt) return;
  const def = s.cat.structure(st.kind);
  // An enemy is on the net when the inner `triggerFraction` of its body overlaps the tile.
  const inner = def.triggerFraction!;
  const [col, row] = st.tile;
  let fired = false;
  for (const e of s.world.enemies) {
    if (e.hp <= 0 || e.flying) continue;
    if (!circleTouchesTile(e.x, e.y, e.r * inner, col, row)) continue;
    fired = true;
    if (def.slow) s.applyEffect(e.id, def.slow, st.id);
  }
  if (!fired) return;
  st.discharges--;
  st.rearmAt = t + s.cat.steps(def.rearmMs!);
  s.emit({ e: 'snareDischarge', id: st.id, left: st.discharges });
}
