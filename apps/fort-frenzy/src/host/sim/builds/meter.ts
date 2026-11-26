// The build meter's fill (SPEC §7.2): a slow passive fill per knight in combat, plus action fill from
// the knight's own damage (main and super) and, for knights whose sources say so, healing (Field
// Medic). A build's own damage and healing never charge the meter (they charge the super, state.ts);
// squad damage never does either. No fill in the build phase, or while the knight is down or dazed.
// Tinkerer raises both rates through the `buildCharge` stat. Leaf module: types and `internal` only.
import type { ChargeSource } from '../../../content/types';
import type { SimState } from '../internal';
import type { PlayerEnt } from '../types';

/** Can this knight's meter fill now? Combat only, alive and connected (§7.2). */
function filling(s: SimState, p: PlayerEnt): boolean {
  return p.meter < 1 && s.world.phase === 'combat' && s.targetable(p);
}

/** One step of passive fill (`meter.perSec`, step 3). */
export function fillMeter(s: SimState, p: PlayerEnt): void {
  if (!filling(s, p)) return;
  const perSec = s.cat.knight(p.classId).meter.perSec;
  if (perSec <= 0) return;
  p.meter = Math.min(1, p.meter + s.attackStat(p, perSec, 'buildCharge') / 60);
}

/** Action fill: `points` of the knight's own damage or healing (never a build's or a squad's). */
export function chargeMeter(s: SimState, p: PlayerEnt, points: number, source: ChargeSource): void {
  if (points <= 0 || !filling(s, p)) return;
  const m = s.cat.knight(p.classId).meter;
  if (m.perPoint <= 0 || !m.sources.includes(source)) return;
  p.meter = Math.min(1, p.meter + points * s.attackStat(p, m.perPoint, 'buildCharge'));
}
