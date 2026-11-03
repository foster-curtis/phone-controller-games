// Bomb tower (neon knights: mortar tower, SPEC §7.2, §8): short range, area damage. Lobs an arcing
// shell at the nearest ground enemy's position (no lead); combat.ts flies it and bursts it on landing
// over the attack's `radius`. Shells start at the muzzle's height (the tube's end, not the plate) and
// arc high; `shellAt` is the one flight curve, shared by the sim and the renderer.
import type { Vec2 } from '../../../content/types';
import { state } from '../internal';
import type { ProjectileEnt, SimCtx, StructureEnt } from '../types';

/** Muzzle height (tiles): the mortar rig's tube tip above its foot (≈ 66 units × 0.6 px / 48 px). */
export const SHELL_LAUNCH_Z = 0.8;
/** Shortest flight, ms: a close lob still arcs high enough to read. */
export const SHELL_MIN_FLIGHT_MS = 700;

/** Apex height above the straight launch-to-ground line, tiles. */
export const shellApex = (dist: number) => 1.4 + 0.3 * dist;

/** Where a shell is at fraction `u` (0..1) of its flight: ground point and height. */
export function shellAt(
  arc: { from: Vec2; to: Vec2 },
  u: number,
): { x: number; y: number; z: number } {
  const k = Math.min(1, Math.max(0, u));
  const dx = arc.to.x - arc.from.x;
  const dy = arc.to.y - arc.from.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  return {
    x: arc.from.x + dx * k,
    y: arc.from.y + dy * k,
    z: SHELL_LAUNCH_Z * (1 - k) + 4 * shellApex(d) * k * (1 - k),
  };
}

export function mortarTick(ctx: SimCtx, st: StructureEnt): void {
  const s = state(ctx);
  const a = st.attack;
  const atk = s.cat.structure(st.kind).attack;
  if (!a || !atk) return;
  const t = s.tick();
  if (t < a.readyAt) return;
  const range = s.attackStat(st, atk.range, 'range');
  const target = s.nearestEnemy(st.x, st.y, range, atk.hitsFlyers);
  if (!target) return;
  const dx = target.x - st.x;
  const dy = target.y - st.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  st.facing = Math.atan2(dy, dx);
  const speedUp = Math.max(0.05, s.attackStat(st, 1, 'attackSpeed'));
  a.readyAt = t + s.cat.steps(atk.cooldownMs / speedUp);
  const speed = Math.max(0.1, atk.speed ?? 6);
  const flight = s.cat.steps(Math.max(SHELL_MIN_FLIGHT_MS, (d / speed) * 1000));
  const l = d || 1;
  s.emit({ e: 'attack', source: st.id, slot: 'attack', x: st.x, y: st.y, angle: st.facing });
  const shell: ProjectileEnt = {
    id: s.world.nextId++,
    x: st.x,
    y: st.y,
    z: SHELL_LAUNCH_Z,
    vx: (dx / l) * (d / (flight / 60)),
    vy: (dy / l) * (d / (flight / 60)),
    r: 0.12,
    side: 'ours',
    source: st.id,
    from: st.kind,
    slot: 'attack',
    damage: s.attackStat(st, atk.damage, 'damage'),
    kind: 'shell',
    tags: [],
    effects: [],
    hitsFlyers: atk.hitsFlyers,
    blockedBy: [],
    pierce: 0,
    hit: [],
    expiresAt: t + flight,
    arc: {
      from: { x: st.x, y: st.y },
      to: { x: target.x, y: target.y },
      launchedAt: t,
      landsAt: t + flight,
      radius: s.attackStat(st, atk.radius ?? 1, 'radius'),
    },
  };
  s.world.projectiles.push(shell);
}
