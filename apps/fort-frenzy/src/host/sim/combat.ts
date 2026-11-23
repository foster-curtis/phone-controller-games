// Sentries (step 4, after the enemy AI), projectiles and danger markers (step 7) (SPEC §3.5, §15.3).
// Every hit goes through `applyDamage`. Our shots hit enemy bodies (body.ts, C4); theirs hit feet
// circles. Nothing blocks shots (§15.3).
import { bodyAimY, segmentHitsBody } from './body';
import { buildTargetable } from './builds/core';
import { rectDist } from './geometry';
import type { FullState } from './state';
import {
  BASE_ID,
  type DangerMarker,
  type EnemyEnt,
  type EntityId,
  type PlayerEnt,
  type ProjectileEnt,
  type BuildEnt,
  type Unit,
} from './types';

/** Peak height of an arcing shell, tiles. */
export const ARC_APEX = 2.5;

/** Base archers (§3.5): each shoots the nearest enemy in range, Flyers included. */
export function stepArchers(s: FullState): void {
  const b = s.world.base;
  if (b.hp <= 0) return;
  const def = s.cat.base.archers;
  const atk = def.attack;
  const t = s.world.tick;
  const range = s.attackStat(b, atk.range, 'range');
  for (let i = 0; i < b.archers.count; i++) {
    const a = b.archers.attack[i];
    const at = def.at[i];
    if (!a || !at || t < a.readyAt) continue;
    const target = s.nearestEnemy(at.x, at.y, range, atk.hitsFlyers);
    if (!target) continue;
    // At its body (a Wasp's flies over its shadow, C4).
    const dx = target.x - at.x;
    const dy = bodyAimY(target.y, s.cat.body(target.kind)) - at.y;
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    b.archers.aim[i] = Math.atan2(dy, dx);
    a.readyAt = t + s.cat.steps(atk.cooldownMs / Math.max(0.05, s.attackStat(b, 1, 'attackSpeed')));
    s.emit({
      e: 'attack',
      source: b.id,
      slot: 'attack',
      x: at.x,
      y: at.y,
      angle: b.archers.aim[i]!,
    });
    s.fire({
      source: b,
      from: 'archer',
      slot: 'attack',
      side: 'ours',
      x: at.x,
      y: at.y,
      dx: dx / l,
      dy: dy / l,
      attack: atk,
      damage: s.attackStat(b, atk.damage, 'damage'),
      range: range + target.r,
      speed: atk.speed!,
      kind: 'ranged',
      tags: [],
      effects: [],
      pierce: 0,
    });
  }
}

/** Can this projectile hit unit `id`? */
function hittable(s: FullState, p: ProjectileEnt, id: number): Unit | null {
  const kind = s.kinds.get(id);
  const u = s.units.get(id);
  if (!u || u.hp <= 0) return null;
  if (p.side === 'ours') {
    if (kind !== 'enemy') return null;
    if ((u as EnemyEnt).flying && !p.hitsFlyers) return null;
    return u;
  }
  if (kind === 'player') return s.targetable(u as PlayerEnt) ? u : null;
  // HP builds take enemy shots like a knight (§7.3).
  if (kind === 'build') return buildTargetable(u as BuildEnt) ? u : null;
  return kind === 'soldier' ? u : null;
}

/** Straight shots: move, hit the first unit along the step's segment. Arcing shells fly over. */
export function stepProjectiles(s: FullState): void {
  const w = s.world;
  const t = w.tick;
  let write = 0;
  for (let i = 0; i < w.projectiles.length; i++) {
    const p = w.projectiles[i]!;
    let alive = true;
    // Arcing shells (Siege, FF10) fly over everything; their danger marker does the damage on landing.
    if (p.arc) {
      const a = p.arc;
      const u = Math.min(1, (t + 1 - a.launchedAt) / Math.max(1, a.landsAt - a.launchedAt));
      p.x = a.from.x + (a.to.x - a.from.x) * u;
      p.y = a.from.y + (a.to.y - a.from.y) * u;
      p.z = ARC_APEX * 4 * u * (1 - u);
      if (t + 1 < a.landsAt) w.projectiles[write++] = p;
      continue;
    }
    const x0 = p.x;
    const y0 = p.y;
    const sx = p.vx / 60;
    const sy = p.vy / 60;
    const x1 = x0 + sx;
    const y1 = y0 + sy;

    if (alive) {
      const len2 = sx * sx + sy * sy;
      const ours = p.side === 'ours';
      let ids: EntityId[];
      if (ours) {
        // Ours hit enemy bodies (C4, body.ts): the feet of a body this step crosses stand up to
        // `reach` south of it.
        const m = s.cat.bodyMax;
        const pad = p.r + m.r;
        ids = w.spatial.queryBox(
          (sx < 0 ? x1 : x0) - pad,
          (sy < 0 ? y1 : y0) - pad,
          (sx < 0 ? x0 : x1) + pad,
          (sy < 0 ? y0 : y1) + p.r + m.reach,
          s.scratch,
        );
      } else {
        const half = Math.sqrt(len2) / 2;
        ids = w.spatial.query(x0 + sx / 2, y0 + sy / 2, half + p.r + 1, s.scratch);
      }
      let best: Unit | null = null;
      let bestT = Infinity;
      for (const id of ids) {
        if (p.hit.includes(id)) continue;
        const u = hittable(s, p, id);
        if (!u) continue;
        let tc: number;
        if (ours) {
          const b = s.cat.body((u as EnemyEnt).kind);
          tc = segmentHitsBody(x0, y0, sx, sy, u.x, u.y, b, p.r);
          if (tc < 0) continue;
        } else {
          tc = len2 > 0 ? Math.min(1, Math.max(0, ((u.x - x0) * sx + (u.y - y0) * sy) / len2)) : 0;
          const dx = x0 + sx * tc - u.x;
          const dy = y0 + sy * tc - u.y;
          const rr = u.r + p.r;
          if (dx * dx + dy * dy > rr * rr) continue;
        }
        if (tc < bestT) {
          best = u;
          bestT = tc;
        }
      }
      if (best) {
        s.damage({
          source: p.source,
          target: best.id,
          amount: p.damage,
          kind: p.kind,
          tags: [...p.tags],
        });
        for (const fx of p.effects) s.applyEffect(best.id, fx, p.source);
        p.hit.push(best.id);
        if (p.pierce > 0) p.pierce--;
        else alive = false;
      } else if (p.side === 'theirs' && rectDist(x1, y1, s.baseRect) <= p.r) {
        // Enemy shots (the Wasp's stinger) also hit the Citadel (FF10).
        s.damage({ source: p.source, target: BASE_ID, amount: p.damage, kind: p.kind, tags: [] });
        alive = false;
      }
    }
    p.x = x1;
    p.y = y1;
    if (t >= p.expiresAt) alive = false;
    if (alive) w.projectiles[write++] = p;
  }
  w.projectiles.length = write;
}

function insideMarker(m: DangerMarker, u: Unit): boolean {
  const dx = u.x - m.x;
  const dy = u.y - m.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > m.r + u.r) return false;
  if (m.shape === 'ring') return d + u.r >= (m.inner ?? 0);
  if (m.shape === 'arc') {
    if (d < 1e-9) return true;
    let diff = Math.atan2(dy, dx) - (m.angle ?? 0);
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) <= (((m.arcDeg ?? 360) / 2) * Math.PI) / 180;
  }
  return true;
}

/** Telegraphed attacks land on their tick and hit everything inside (players, soldiers, HP builds). */
export function stepMarkers(s: FullState): void {
  const w = s.world;
  if (w.markers.length === 0) return;
  let write = 0;
  for (const m of w.markers) {
    if (w.tick < m.landsAt) {
      w.markers[write++] = m;
      continue;
    }
    const hit = (u: Unit) =>
      s.damage({
        source: m.source,
        target: u.id,
        amount: m.payload.damage,
        kind: m.payload.kind,
        tags: [...m.payload.tags],
      });
    const victims: Unit[] = [];
    for (const p of w.players) if (s.targetable(p) && insideMarker(m, p)) victims.push(p);
    for (const u of w.soldiers) if (u.hp > 0 && !u.flight && insideMarker(m, u)) victims.push(u);
    if (m.payload.hitsBuilds) {
      for (const b of w.builds)
        if (b.targetable && b.state !== 'flight' && b.hp > 0 && insideMarker(m, b)) victims.push(b);
      // The Citadel too (Siege shells, FF10), when the marker reaches its footprint.
      if (w.base.hp > 0 && rectDist(m.x, m.y, s.baseRect) <= m.r) victims.push(w.base);
    }
    for (const u of victims) {
      hit(u);
      for (const fx of m.payload.effects ?? []) s.applyEffect(u.id, fx, m.source);
    }
  }
  w.markers.length = write;
}
