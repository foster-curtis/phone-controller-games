// `siege` AI (SPEC §3.3, §9, §9.6, §15.5): the Bombard walks the ground field until the Citadel is in
// range, then stops and shells it (RD10 adds players and builds: base > players > builds, #108). A
// shot plants and charges (the wind-up, its tell), then lobs a shell: a red danger marker shows where
// it lands, and the landing hits everything inside (players, soldiers, HP builds, the Citadel;
// combat.ts). Rangers outrange it (§8).
import { rectDist, rectNearest } from '../geometry';
import { state, type SimState } from '../internal';
import { BASE_ID, type EnemyEnt, type SimCtx } from '../types';
import { fieldStep, knocked, toBase } from './field';

export function siegeAi(ctx: SimCtx, e: EnemyEnt): void {
  const s = state(ctx);
  const def = s.cat.enemy(e.kind);
  if (e.attack.windupEndsAt !== null) {
    const u = e.target === null ? undefined : s.units.get(e.target);
    if (!u || u.hp <= 0) e.attack.windupEndsAt = null;
    else {
      e.vx = e.vy = 0;
      if (s.tick() >= e.attack.windupEndsAt) {
        e.attack.windupEndsAt = null;
        lob(s, e, e.target!);
      }
      return;
    }
  }
  if (knocked(e)) return;
  const range = def.attack.range;
  const target = pickTarget(s, e, range);
  if (target !== null) {
    e.ai = 'siege';
    shell(s, e, target);
    return;
  }
  e.ai = 'path';
  e.target = null;
  const step = fieldStep(s, e, s.world.fields.ground, e.stats.moveSpeed);
  if (step.kind === 'goal') toBase(s, e, e.stats.moveSpeed);
}

/** The Citadel if in range, else null. */
function pickTarget(s: SimState, e: EnemyEnt, range: number): number | null {
  return rectDist(e.x, e.y, s.baseRect) - e.r <= range ? BASE_ID : null;
}

/** Where a shell at `target` lands: a unit's position, or the Citadel's nearest edge. */
function aimPoint(s: SimState, e: EnemyEnt, target: number): { x: number; y: number } {
  if (target === BASE_ID) return rectNearest(e.x, e.y, s.baseRect);
  const u = s.units.get(target)!;
  return { x: u.x, y: u.y };
}

/** Stand, face the target and plant for a shot once the cooldown allows. */
function shell(s: SimState, e: EnemyEnt, target: number) {
  e.vx = e.vy = 0;
  e.target = target;
  const at = aimPoint(s, e, target);
  e.facing = Math.atan2(at.y - e.y, at.x - e.x);
  const t = s.tick();
  if (t < e.attack.readyAt) return;
  const a = s.cat.enemy(e.kind).attack;
  e.attack.readyAt = t + s.cat.steps(a.cooldownMs / Math.max(0.05, e.stats.attackSpeed || 1));
  s.emit({ e: 'attack', source: e.id, slot: 'attack', x: e.x, y: e.y, angle: e.facing });
  const wind = a.windupMs ? s.cat.steps(a.windupMs) : 0;
  if (wind > 0) e.attack.windupEndsAt = t + wind;
  else lob(s, e, target);
}

/** The shell leaves the barrel: an arcing projectile (drawn) and its landing marker (the damage). */
function lob(s: SimState, e: EnemyEnt, target: number) {
  const w = s.world;
  const def = s.cat.enemy(e.kind);
  const to = aimPoint(s, e, target);
  const dx = to.x - e.x;
  const dy = to.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const t = w.tick;
  // The shell's ground speed (tiles/s) and shortest flight are content (`attack.speed`, `minFlightMs`).
  const speed = def.attack.speed!;
  const flight = Math.max(s.cat.steps(def.attack.minFlightMs!), Math.round((d / speed) * 60));
  const radius = def.attack.radius!;
  w.projectiles.push({
    id: w.nextId++,
    x: e.x,
    y: e.y,
    vx: (dx / Math.max(1e-6, d)) * speed,
    vy: (dy / Math.max(1e-6, d)) * speed,
    r: s.cat.rules.projectileRadius,
    z: 0,
    side: 'theirs',
    source: e.id,
    from: e.kind,
    slot: 'attack',
    damage: e.stats.damage,
    kind: 'shell',
    tags: [],
    effects: [],
    hitsFlyers: false,
    pierce: 0,
    hit: [],
    expiresAt: t + flight,
    arc: { from: { x: e.x, y: e.y }, to, launchedAt: t, landsAt: t + flight, radius },
  });
  const id = w.nextId++;
  w.markers.push({
    id,
    source: e.id,
    shape: 'circle',
    x: to.x,
    y: to.y,
    r: radius,
    createdAt: t,
    landsAt: t + flight,
    payload: { damage: e.stats.damage, kind: 'shell', tags: [], hitsBuilds: true },
  });
  s.emit({ e: 'marker', id, source: e.id, landsAtTick: t + flight });
}
