// `brute` AI (SPEC §7, §9, §15.5): a path walker with the aggro leash on the `breaker` field, where
// walls are cheap, so it heads through walls instead of around them and smashes the one on its next
// tile (2× damage, content `vsStructure`). Off the path too (chasing a player or walking back), a
// wall it walks into is smashed rather than slid along. Every hit winds up (the furnace flares and
// the fist rears back: the Warden's stun window).
import { rectDist, tileRect } from '../geometry';
import { state } from '../internal';
import type { EnemyEnt, SimCtx, StructureEnt } from '../types';
import { pathAi, swing } from './path';

export function bruteAi(ctx: SimCtx, e: EnemyEnt): void {
  const s = state(ctx);
  pathAi(ctx, e);
  if ((e.ai !== 'aggro' && e.ai !== 'return') || e.attack.windupEndsAt !== null) return;
  const v = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
  if (v < 1e-6) return;
  const def = s.cat.enemy(e.kind);
  // The tile just ahead of its body along the way it's walking.
  const ahead = e.r + def.attack.range;
  const col = Math.floor(e.x + (e.vx / v) * ahead);
  const row = Math.floor(e.y + (e.vy / v) * ahead);
  const { cols, rows, occupant } = s.world.grid;
  if (col < 0 || row < 0 || col >= cols || row >= rows) return;
  const occ = occupant[row * cols + col]!;
  if (occ === 0) return;
  const st = s.units.get(occ) as StructureEnt | undefined;
  if (!st || st.kind !== 'wall' || !st.damageable) return;
  if (rectDist(e.x, e.y, tileRect(col, row)) - e.r > def.attack.range) return;
  const keep = e.ai;
  const target = e.target;
  swing(s, e, def, st.id, st.x, st.y);
  // Still chasing or returning once the wall is down; the wind-up targets the wall meanwhile.
  e.ai = keep;
  if (e.attack.windupEndsAt === null) e.target = target;
}
