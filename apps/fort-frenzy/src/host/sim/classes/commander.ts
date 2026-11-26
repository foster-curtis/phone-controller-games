// Commander kit (SPEC §8.2, §7.4, §8.4). The shield bash is his `arc` main (classes/shapes.ts). The
// rally flag is his build (builds/rallyFlag.ts): with the meter not full and a flag out, the build
// button recalls it and his squad follows him again; recall never uses the meter (§15.11 #83).
// Reinforcements is his super: an aimed throw of one soldier, who lands and joins the squad.
import type { KnightDef, Vec2 } from '../../../content/types';
import { landingArea, removeBuild } from '../builds/core';
import { clampLanding, throwLanding } from '../builds/landing';
import type { FullState } from '../state';
import { squadCapOf, squadCount } from '../squad';
import type { AttackEvent, PlayerEnt } from '../types';

/** The build button's recall (§7.4): no-op without a planted flag. */
export function recallFlag(s: FullState, p: PlayerEnt): void {
  if (p.flag === null) return;
  for (const b of s.world.builds.filter((x) => x.owner === p.slot && x.kind === 'rally_flag'))
    removeBuild(s, b, false);
  p.flag = null;
  for (const u of s.world.soldiers) {
    if (u.owner !== p.slot) continue;
    u.mode = 'follow';
    u.target = null;
  }
  s.emit({ e: 'recall', slot: p.slot });
}

/**
 * Reinforcements' throw vector (length ≤ 1 × the throw range, like a thrown build, §7.3). A quick tap
 * (aim 0,0) goes toward his flag, stopping at it if it's closer than the range, or straight ahead
 * with no flag out (§15.11 #106).
 */
export function reinforceAim(p: PlayerEnt, aim: Vec2, range: number): Vec2 {
  if (aim.x !== 0 || aim.y !== 0) return aim;
  if (!p.flag) return { x: Math.cos(p.facing), y: Math.sin(p.facing) };
  const dx = p.flag.x - p.x;
  const dy = p.flag.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const k = Math.min(1, d / Math.max(0.01, range)) / d;
  return { x: dx * k, y: dy * k };
}

/** Reinforcements fires (players.ts `fire`): `atk.count` × the content's soldiers, up to the cap. */
export function reinforce(
  s: FullState,
  p: PlayerEnt,
  sup: KnightDef['super'],
  atk: AttackEvent,
): void {
  const spawn = sup.spawn;
  const squad = s.cat.knight(p.classId).squad;
  if (!spawn || !squad) return;
  const cap = squadCapOf(squad, (b) => s.attackStat(p, b, 'squadCap', 'squad'));
  const count = Math.min(spawn.count * atk.count, cap - squadCount(s.world, p.slot));
  if (count <= 0) return;
  const t = s.world.tick;
  const area = landingArea(s);
  const r = squad.soldier.radius;
  const from = { x: p.x, y: p.y };
  const range = s.attackStat(p, spawn.throwRange, 'throwRange', 'super');
  const speed = Math.max(0.01, s.attackStat(p, spawn.throwSpeed, 'throwSpeed', 'super'));
  const center = throwLanding(from, p.super.aim, range, r, area);
  for (let i = 0; i < count; i++) {
    const off = count > 1 ? (i / (count - 1) - 0.5) * spawn.spread : 0;
    const to = clampLanding(center.x - atk.aim.y * off, center.y + atk.aim.x * off, r, area);
    const steps = Math.ceil((Math.hypot(to.x - from.x, to.y - from.y) / speed) * 60);
    const u = s.addSoldier(p.slot, from.x, from.y);
    u.mode = p.flag ? 'rally' : 'follow';
    u.facing = p.facing;
    u.flight = {
      from,
      to,
      launchedAt: t,
      landsAt: t + Math.max(s.cat.steps(spawn.minFlightMs), steps),
    };
  }
  s.emit({ e: 'reinforce', slot: p.slot, count });
}
