// Step 3 (SPEC §15.3): players — respawn, movement with carry slowdown, attacks and supers (fire on
// release, a release during the cooldown fires when it ends), the action button (§10.1 rows 1–5), the
// build arc and Give.
import type { AttackDef, EffectApply } from '../../content/types';
import { bodyAimY, circleHitsBody } from './body';
import { buildAtFeet } from './building';
import { landArc, windupSteps } from './classes/warden';
import {
  buyCrate,
  canDeliver,
  carryCap,
  carrySpeed,
  deliver,
  give,
  inZone,
  pickUp,
} from './crates';
import { toggleFlag } from './classes/commander';
import { canUseKit, throwCrate, throwTarget, useKit } from './classes/quartermaster';
import { attackShapes } from './classes/shapes';
import { cleanVec } from './geometry';
import type { SlotInput } from './internal';
import type { FullState } from './state';
import type { AttackEvent, EnemyEnt, PlayerEnt } from './types';

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

/** Drops queued shots and wind-ups (a wind-up cut short never lands). */
function releaseAttacks(p: PlayerEnt): void {
  p.main.queued = p.super.queued = false;
  p.main.windupEndsAt = p.super.windupEndsAt = null;
  p.main.windupAim = p.super.windupAim = null;
}

/** Clears held gestures and queued shots (death, dazed, phase changes). */
export function releaseAll(p: PlayerEnt): void {
  p.mainAim = p.superAim = null;
  p.radialOpen = false;
  p.radialSlot = -1;
  releaseAttacks(p);
  p.vx = p.vy = 0;
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
      releaseAll(p);
      continue;
    }
    const inp = s.inputs.get(p.slot)!;
    move(s, p, inp, acting);
    p.mainAim = inp.input.mainAiming ? cleanVec(inp.input.mainAim.x, inp.input.mainAim.y) : null;
    p.superAim = inp.input.superAiming
      ? cleanVec(inp.input.superAim.x, inp.input.superAim.y)
      : null;
    p.radialOpen = inp.input.radialOpen;
    p.radialSlot = inp.input.radialOpen ? inp.input.radialSlot : -1;

    if (fighting) attacks(s, p, inp);
    else releaseAttacks(p);
    if (!acting) continue;
    if (inp.action) action(s, p);
    if (inp.radial) radial(s, p, inp.input.radialSlot);
  }
}

function move(s: FullState, p: PlayerEnt, inp: SlotInput, acting: boolean) {
  const m = acting ? cleanVec(inp.input.move.x, inp.input.move.y) : { x: 0, y: 0 };
  const speed = p.stats.moveSpeed * carrySpeed(s, p);
  p.vx = m.x * speed;
  p.vy = m.y * speed;
  if (m.x !== 0 || m.y !== 0) {
    p.facing = Math.atan2(m.y, m.x);
    p.stillTicks = 0;
  } else {
    p.stillTicks++;
  }
}

function attacks(s: FullState, p: PlayerEnt, inp: SlotInput) {
  const def = s.cat.character(p.classId);
  const t = s.world.tick;
  if (inp.main) {
    p.main.queued = true;
    p.main.aim = cleanVec(inp.input.mainAim.x, inp.input.mainAim.y);
  }
  // A wind-up in progress roots the player until it lands; a super released meanwhile is lost.
  if (landWindups(s, p)) {
    p.vx = p.vy = 0;
    return;
  }
  if (p.main.queued && t >= p.main.readyAt) {
    p.main.queued = false;
    fire(s, p, 'main', def.main, p.main.aim);
    const as = Math.max(0.05, s.attackStat(p, 1, 'attackSpeed', 'main'));
    p.main.readyAt = t + s.cat.steps(def.main.cooldownMs / as);
  }
  // Supers fire on release when full; a release while charging does nothing.
  if (inp.super && p.superCharge >= 1 && t >= p.super.readyAt) {
    fire(s, p, 'super', def.super, cleanVec(inp.input.superAim.x, inp.input.superAim.y));
    p.superCharge = 0;
    p.super.readyAt = t + s.cat.steps(def.super.cooldownMs);
  }
}

/** Lands the wind-ups that end this step; true while one is still winding. */
function landWindups(s: FullState, p: PlayerEnt): boolean {
  const def = s.cat.character(p.classId);
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
  const damage = s.attackStat(p, a.damage, 'damage', slot);

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

/** A circle around the player: area damage and knockback (Engineer super, §8). */
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

/** The action button (§10.1): the first matching row wins; build phase uses rows 1–4 (§10.2). */
function action(s: FullState, p: PlayerEnt) {
  const cap = carryCap(s, p);
  if (p.crates < cap && pickUp(s, p)) return;
  if (canDeliver(s, p)) {
    deliver(s, p);
    return;
  }
  // Row 3: the Quartermaster's emergency kit (FF9).
  if (canUseKit(s, p)) {
    useKit(s, p);
    return;
  }
  if (inZone(s, p, 'armory') && p.crates < cap) {
    buyCrate(s, p);
    return;
  }
  const kit = s.cat.character(p.classId).build;
  if (s.world.phase !== 'combat') return;
  if (kit.length > 0 && p.crates > 0) {
    buildAtFeet(s, p, p.lastBuilt ?? kit[0]!);
    return;
  }
  // Row 6: a Quartermaster throws a crate; row 7: the Commander's rally flag (FF9).
  const to = throwTarget(s.world, p, (q) => carryCap(s, q));
  if (to) {
    throwCrate(s, p, to);
    return;
  }
  if (p.classId === 'commander') toggleFlag(s, p);
}

/** A build-arc commit: left/up/right build that structure (combat), down (3) gives a crate. */
function radial(s: FullState, p: PlayerEnt, slot: number) {
  if (slot === 3) {
    give(s, p);
    return;
  }
  if (s.world.phase !== 'combat' || slot < 0 || slot > 2) return;
  const kind = s.cat.character(p.classId).build[slot];
  if (kind) buildAtFeet(s, p, kind);
}
