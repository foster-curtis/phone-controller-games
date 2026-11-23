// Step 3 (SPEC §15.3): players — respawn, movement, attacks and supers (fire on
// release, a release during the cooldown fires when it ends), build presses (§10.1), the meter's
// passive fill (combat) and delayed regen (§5: combat and build phase).
import type { AttackDef, EffectApply, Vec2 } from '../../content/types';
import { AIM_DEAD_ZONE } from '../../shared/messages';
import { bodyAimY, circleHitsBody } from './body';
import { landArc, windupSteps } from './classes/warden';
import { startBlast, stepBlast } from './classes/artificer';
import { recallFlag, reinforceAim } from './classes/commander';
import { placeBuild } from './builds/core';
import { fillMeter } from './builds/meter';
import { attackShapes } from './classes/shapes';
import { cleanVec } from './geometry';
import type { SimState, SlotInput } from './internal';
import { holdRegen } from './regen';
import { superBlocked } from './squad';
import type { FullState } from './state';
import type { AttackEvent, AttackState, EnemyEnt, PlayerEnt } from './types';

export function respawn(s: FullState, p: PlayerEnt): void {
  const at = s.respawnPoint(p.slot);
  p.respawnAt = null;
  p.hp = p.maxHp;
  p.x = at.x;
  p.y = at.y;
  p.vx = p.vy = 0;
  p.push = null;
  p.effects.length = 0;
  s.emit({ e: 'respawn', slot: p.slot });
}

const ATTACK_SLOTS = ['main', 'super'] as const;

/** Drops queued shots and wind-ups: one cut short never lands, and the TV calls off its impact. */
function releaseAttacks(s: Pick<SimState, 'emit'>, p: PlayerEnt): void {
  p.main.queued = p.super.queued = false;
  p.burst = null;
  for (const slot of ATTACK_SLOTS) {
    const st = p[slot];
    if (st.windupEndsAt !== null) s.emit({ e: 'windupCancelled', source: p.id, slot });
    st.windupEndsAt = null;
    st.windupAim = null;
  }
}

/** Clears held gestures and queued shots (death, dazed, phase changes). */
export function releaseAll(s: Pick<SimState, 'emit'>, p: PlayerEnt): void {
  p.mainAim = p.superAim = p.buildAim = null;
  p.main.held = p.super.held = p.build.held = null;
  releaseAttacks(s, p);
  p.vx = p.vy = 0;
}

/**
 * The held aim the TV previews (FF7-fix-5, C4, SPEC §15.7): shown while the aim is outside the center
 * grace zone, hidden while it is back inside (a release there would cancel), shown again when the thumb
 * drags out (a release there fires along it). Fire or cancel is still the phone's rule; its tuple ints
 * land on the same side of the zone as its own test (controller `aimInts`).
 */
function heldAim(st: AttackState, aiming: boolean, raw: Vec2): Vec2 | null {
  if (!aiming) {
    st.held = null;
    return null;
  }
  const v = cleanVec(raw.x, raw.y);
  // The epsilon absorbs float error in ints / 100; the nearest outside int aim is far above it.
  const inside = Math.hypot(v.x, v.y) <= AIM_DEAD_ZONE + 1e-9;
  if (!inside) st.held = 'out';
  else if (st.held === 'out') st.held = 'cancelled';
  return inside ? null : v;
}

export function stepPlayers(s: FullState): void {
  const w = s.world;
  const fighting = w.phase === 'combat';
  const acting = fighting || w.phase === 'build';
  for (const p of w.players) {
    if (p.respawnAt !== null) {
      if (w.tick >= p.respawnAt) respawn(s, p);
      else continue;
    }
    if (!p.connected) {
      releaseAll(s, p);
      continue;
    }
    const inp = s.inputs.get(p.slot)!;
    move(p, inp, acting);
    p.mainAim = heldAim(p.main, inp.input.mainAiming, inp.input.mainAim);
    p.superAim = heldAim(p.super, inp.input.superAiming, inp.input.superAim);
    // Builds are placed only in combat (§7.1): the preview shows only then.
    p.buildAim = fighting ? heldAim(p.build, inp.input.buildAiming, inp.input.buildAim) : null;

    if (fighting) {
      attacks(s, p, inp);
      fillMeter(s, p);
      // In the air he can't throw his build (§8.2): the press is lost, the meter stays full.
      if (inp.build && p.super.windupEndsAt === null) buildPress(s, p, inp);
    } else releaseAttacks(s, p);
    if (acting) regen(s, p);
  }
}

/**
 * Delayed regen (§5): from `regen.quietUntil` (`regen.delayMs` after the last damage taken, main
 * attack or super) the knight heals `regen.pct` of max HP every `regen.everyMs` until full. Not a
 * heal: HP is set directly, with no hooks, charge, stats or event (§15.11 #98). Down or dazed knights
 * don't get here.
 */
function regen(s: FullState, p: PlayerEnt) {
  if (p.hp <= 0 || p.hp >= p.maxHp) return;
  const t = s.world.tick;
  const r = p.regen;
  if (t < r.quietUntil || t < r.nextRegen) return;
  const rule = s.cat.rules.regen;
  p.hp = Math.min(p.maxHp, p.hp + p.maxHp * rule.pct);
  r.nextRegen = t + s.cat.steps(rule.everyMs);
}

function move(p: PlayerEnt, inp: SlotInput, acting: boolean) {
  const m = acting ? cleanVec(inp.input.move.x, inp.input.move.y) : { x: 0, y: 0 };
  const speed = p.stats.moveSpeed;
  p.vx = m.x * speed;
  p.vy = m.y * speed;
  if (m.x !== 0 || m.y !== 0) {
    // The jump slam keeps the facing it left the ground with (§8.2): it lands along that aim.
    if (p.super.windupEndsAt === null) p.facing = Math.atan2(m.y, m.x);
    p.stillTicks = 0;
  } else {
    p.stillTicks++;
  }
}

function attacks(s: FullState, p: PlayerEnt, inp: SlotInput) {
  const def = s.cat.knight(p.classId);
  const t = s.world.tick;
  // Committed to the jump slam (§8.2): a main press in the air is lost, not fired on the landing.
  if (inp.main && p.super.windupEndsAt === null) {
    p.main.queued = true;
    p.main.aim = cleanVec(inp.input.mainAim.x, inp.input.mainAim.y);
  }
  // A wind-up in progress roots the player until it lands; a super released meanwhile is lost.
  if (landWindups(s, p)) {
    p.vx = p.vy = 0;
    return;
  }
  stepBlast(s, p);
  if (p.main.queued && t >= p.main.readyAt) {
    p.main.queued = false;
    fire(s, p, 'main', def.main, p.main.aim);
    const as = Math.max(0.05, s.attackStat(p, 1, 'attackSpeed', 'main'));
    // A blast never overlaps the next one, however fast he attacks (§8.2).
    p.main.readyAt = t + s.cat.steps(Math.max(def.main.burstMs ?? 0, def.main.cooldownMs / as));
  }
  // Supers fire on release when full; a release while charging does nothing.
  // Not on the step a main wind-up starts: he can't slam and leave the ground at once.
  // A Commander at his squad cap can't: the charge is held (§8.4).
  if (
    inp.super &&
    p.superCharge >= 1 &&
    t >= p.super.readyAt &&
    p.main.windupEndsAt === null &&
    !superBlocked(s, p)
  ) {
    let aim = cleanVec(inp.input.superAim.x, inp.input.superAim.y);
    // Reinforcements' quick tap aims at his flag or straight ahead, never at an enemy (§10.1).
    if (def.super.spawn) {
      const range = s.attackStat(p, def.super.spawn.throwRange, 'throwRange', 'super');
      aim = reinforceAim(p, aim, range);
      p.super.aim = aim;
    }
    fire(s, p, 'super', def.super, aim);
    p.superCharge = 0;
    p.super.readyAt = t + s.cat.steps(def.super.cooldownMs);
    if (p.super.windupEndsAt !== null) p.main.queued = false;
  }
}

/** Lands the wind-ups that end this step; true while one is still winding. */
function landWindups(s: FullState, p: PlayerEnt): boolean {
  const def = s.cat.knight(p.classId);
  for (const slot of ['main', 'super'] as const) {
    const st = p[slot];
    if (st.windupEndsAt === null) continue;
    if (s.world.tick < st.windupEndsAt) return true;
    st.windupEndsAt = null;
    const aim = st.windupAim ?? st.aim;
    st.windupAim = null;
    fire(s, p, slot, def[slot], aim, true);
  }
  return false;
}

/**
 * One attack from a player's button: `projectile` (aimed or auto-aimed), `circle` around them, or
 * `arc` in front of them (FF8).
 */
function fire(
  s: FullState,
  p: PlayerEnt,
  slot: 'main' | 'super',
  a: AttackDef,
  aim: { x: number; y: number },
  /** A wound-up attack landing: no new event, no new wind-up. */
  landing = false,
) {
  // Attacking holds regen off like damage does (§5, RC1): at the press and when a wind-up lands.
  holdRegen(s, p);
  const range = s.attackStat(p, a.range, 'range', slot);
  let dx = aim.x;
  let dy = aim.y;
  if (dx === 0 && dy === 0) {
    // Auto-aim: the nearest valid enemy in range, else straight ahead.
    const target: EnemyEnt | null = s.nearestEnemy(p.x, p.y, range, a.hitsFlyers);
    if (target) {
      // At its body: a Wasp's flies over its shadow (C4, body.ts).
      dx = target.x - p.x;
      dy = bodyAimY(target.y, s.cat.body(target.kind)) - p.y;
    } else {
      dx = Math.cos(p.facing);
      dy = Math.sin(p.facing);
    }
  }
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= l;
  dy /= l;
  // Wound-up arcs (the Warden's slam and stomp, FF8): the attack event goes out now so the clip
  // starts; the hit lands when the wind-up ends (`landWindups`), in this direction.
  const st = slot === 'main' ? p.main : p.super;
  const wind = a.shape === 'arc' ? windupSteps(a) : 0;
  if (wind > 0 && !landing) {
    p.facing = Math.atan2(dy, dx);
    s.emit({ e: 'attack', source: p.id, slot, x: p.x, y: p.y, angle: p.facing });
    st.windupEndsAt = s.world.tick + wind;
    st.windupAim = { x: dx, y: dy };
    return;
  }
  const atk: AttackEvent = {
    attacker: p.id,
    slot,
    aim: { x: dx, y: dy },
    count: a.count ?? 1,
    spreadDeg: a.spreadDeg ?? 0,
    pierce: 0,
    effects: [],
    tags: [slot],
  };
  for (const f of s.hooks(p, 'onAttack')) f(s, p, atk);
  p.facing = Math.atan2(dy, dx);
  if (!landing) s.emit({ e: 'attack', source: p.id, slot, x: p.x, y: p.y, angle: p.facing });
  // The class's damage band multiplies the knight's main and super (§8.1), under the cards.
  const band = s.cat.role(s.cat.knight(p.classId).role).damage;
  const damage = s.attackStat(p, a.damage * band, 'damage', slot);

  if (a.shape === 'circle') {
    circle(s, p, a, slot, damage, atk);
    return;
  }
  // A wound-up arc landing (the Warden's slam and stomp, FF8): its effects (stun) and knockback.
  if (a.shape === 'arc' && landing) {
    // Cards lengthen the attack's own effects (FF12: Earthshaker's `stunMs`, others' `durationMs`).
    const extra = ((a as { effects?: readonly EffectApply[] }).effects ?? []).map((fx) => ({
      ...fx,
      durationMs:
        fx.durationMs * s.attackStat(p, 1, fx.effect === 'stun' ? 'stunMs' : 'durationMs', slot),
    }));
    landArc(s, p, {
      attack: a,
      slot,
      dx,
      dy,
      damage,
      kind: slot === 'main' ? 'melee' : 'area',
      tags: atk.tags,
      effects: [...atk.effects, ...extra],
    });
    return;
  }
  // Arcs, cones and buffs (FF9: classes/shapes.ts).
  const shaped = attackShapes[a.shape];
  if (shaped) {
    shaped(s, p, a, slot, damage, atk);
    return;
  }
  const speed = s.attackStat(p, a.speed!, 'projectileSpeed', slot);
  if (a.burstMs) {
    startBlast(s, p, a, damage, range, speed, atk);
    return;
  }
  const spread = (atk.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < atk.count; i++) {
    const off = atk.count > 1 ? spread * (i / (atk.count - 1) - 0.5) : 0;
    const ang = p.facing + off;
    s.fire({
      source: p,
      from: p.classId,
      slot,
      side: 'ours',
      x: p.x,
      y: p.y,
      dx: Math.cos(ang),
      dy: Math.sin(ang),
      attack: a,
      damage,
      range,
      speed,
      kind: 'ranged',
      tags: atk.tags,
      effects: atk.effects,
      pierce: atk.pierce,
    });
  }
}

/** A circle around the player: area damage and knockback (Ranger super, §8). */
function circle(
  s: FullState,
  p: PlayerEnt,
  a: AttackDef,
  slot: 'main' | 'super',
  damage: number,
  atk: AttackEvent,
) {
  const radius = s.attackStat(p, a.radius ?? a.range, 'radius', slot);
  const knock = s.attackStat(p, a.knockback ?? 0, 'knockback', slot);
  // Velocity that travels `knock` tiles under the per-step decay.
  const v0 = knock * 60 * (1 - s.cat.rules.knockbackDecay);
  // It reaches enemy bodies (C4, body.ts), whose feet may stand up to `reach` south of it.
  const m = s.cat.bodyMax;
  const pad = radius + m.r;
  const ids = s.world.spatial
    .queryBox(p.x - pad, p.y - pad, p.x + pad, p.y + radius + m.reach, s.scratch)
    .slice();
  for (const id of ids) {
    if (s.kinds.get(id) !== 'enemy') continue;
    const e = s.units.get(id) as EnemyEnt;
    if (e.hp <= 0 || (e.flying && !a.hitsFlyers)) continue;
    if (!circleHitsBody(p.x, p.y, radius, e.x, e.y, s.cat.body(e.kind))) continue;
    let dx = e.x - p.x;
    let dy = e.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    s.damage({ source: p.id, target: e.id, amount: damage, kind: 'area', tags: [...atk.tags] });
    for (const fx of atk.effects) s.applyEffect(e.id, fx, p.id);
    if (v0 > 0) {
      if (d < 1e-6) {
        dx = Math.cos(p.facing);
        dy = Math.sin(p.facing);
      } else {
        dx /= d;
        dy /= d;
      }
      e.push = { x: (e.push?.x ?? 0) + dx * v0, y: (e.push?.y ?? 0) + dy * v0 };
    }
  }
}

/**
 * A build press (§15.3, §15.11 #97), resolved from the state at this step: with the meter full the
 * knight places or throws its build toward the build aim (0,0 = at his feet; builds/core.ts); else a
 * Commander with a flag out recalls it; else nothing.
 */
function buildPress(s: FullState, p: PlayerEnt, inp: SlotInput) {
  if (p.meter >= 1 && placeBuild(s, p, inp.input.buildAim)) return;
  if (p.classId === 'commander' && p.flag !== null && p.meter < 1) recallFlag(s, p);
}
