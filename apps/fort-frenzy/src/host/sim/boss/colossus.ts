// The Colossus boss module (SPEC §9.2, §15.3 BossBehavior; FF11). A slow walker on the ground field
// that keeps to its path and attacks what's in front of it:
// - slam: a red circle in front of it, landing 1.5 s later (exactly `attack.windupMs`), on players,
//   soldiers and HP builds; a player or soldier in reach or the Citadel (× `baseMult`) draws it;
// - boulder throw (every Mk): at the largest group of players (2+), else one player, with its
//   landing marker up from the wind-up;
// - Charge (Mk II+, RD10): locks on to a knight, a red lane marker shows the path through the tell,
//   then it runs the lane: knights and soldiers are hit once and knocked aside, HP builds it crosses
//   are destroyed, mines trigger as for any ground enemy and the rally flag is left alone;
// - Runner calls from the spires (Mk III);
// - final phase (Mk III below half HP): faster moves and attacks, shockwave rings rolling out from
//   every slam.
// It can't be stunned or knocked back. A hidden stagger meter fills a little with all damage and
// more with a stun (one per lockout, so stuns alone can't lock it down); full = 3 s on one knee
// taking bonus damage, the attack winding up called off, then the meter starts again from 0 and
// stuns don't count for a while after it stands up (FF11-fix-1: no Warden stun-lock).
// Tuning comes from the content's `boss.params` (content/balance.ts). Imports only types, internal,
// geometry and the shared AI steps (registry rule, BUILD_PLAN §8 FF6).
import type { EnemyDef } from '../../../content/types';
import { fieldStep, toBase } from '../ai/field';
import { walkTo } from '../ai/path';
import { buildTargetable } from '../builds/core';
import { dist, rectDist, rectNearest } from '../geometry';
import { state, type SimState } from '../internal';
import {
  BASE_ID,
  type BossAct,
  type BossBehavior,
  type DangerMarker,
  type EnemyEnt,
  type EntityId,
  type Modifier,
  type Unit,
} from '../types';

/** `boss.params` of the Colossus's content (every key required; content.test checks). */
export interface ColossusTuning {
  /** The Citadel takes this × its slams. */
  baseMult: number;
  hpMk2: number;
  hpMk3: number;
  slamOffset: number;
  slamReach: number;
  baseReach: number;
  boulderWindupMs: number;
  boulderMinFlightMs: number;
  boulderCooldownMs: number;
  boulderMinRange: number;
  boulderRange: number;
  boulderRadius: number;
  boulderDamage: number;
  boulderSpeed: number;
  groupRadius: number;
  finalAt: number;
  finalSpeed: number;
  finalCooldown: number;
  ringCount: number;
  ringBand: number;
  ringStepMs: number;
  ringDamage: number;
  callWindupMs: number;
  callCooldownMs: number;
  runners: number;
  staggerPerHp: number;
  staggerStun: number;
  stunLockMs: number;
  stunImmuneMs: number;
  staggerMs: number;
  staggerBonus: number;
  escortGrunts: number;
  escortSwarms: number;
  /** The Charge (Mk II+): the tell, then a run at `chargeSpeed` past the knight it locked on to. */
  chargeWindupMs: number;
  chargeCooldownMs: number;
  chargeMinRange: number;
  chargeRange: number;
  chargeOvershoot: number;
  chargeSpeed: number;
  /** The lane's reach to each side of its center line (what the marker shows is what it hits). */
  chargeHalfWidth: number;
  chargeDamage: number;
  /** How far a knight or soldier it hits is thrown, tiles. */
  chargeKnockback: number;
}

export const COLOSSUS_TUNING_KEYS = [
  'baseMult',
  'hpMk2',
  'hpMk3',
  'slamOffset',
  'slamReach',
  'baseReach',
  'boulderWindupMs',
  'boulderMinFlightMs',
  'boulderCooldownMs',
  'boulderMinRange',
  'boulderRange',
  'boulderRadius',
  'boulderDamage',
  'boulderSpeed',
  'groupRadius',
  'finalAt',
  'finalSpeed',
  'finalCooldown',
  'ringCount',
  'ringBand',
  'ringStepMs',
  'ringDamage',
  'callWindupMs',
  'callCooldownMs',
  'runners',
  'staggerPerHp',
  'staggerStun',
  'stunLockMs',
  'stunImmuneMs',
  'staggerMs',
  'staggerBonus',
  'escortGrunts',
  'escortSwarms',
  'chargeWindupMs',
  'chargeCooldownMs',
  'chargeMinRange',
  'chargeRange',
  'chargeOvershoot',
  'chargeSpeed',
  'chargeHalfWidth',
  'chargeDamage',
  'chargeKnockback',
] as const satisfies readonly (keyof ColossusTuning)[];

/** Attack kinds (`BossAct.kind`); render picks the clip by these. */
export type ColossusAct = 'slam' | 'boulder' | 'charge' | 'chargeRun' | 'call';

export function tuning(def: EnemyDef): ColossusTuning {
  return (def.boss?.params ?? {}) as unknown as ColossusTuning;
}

function face(e: EnemyEnt, x: number, y: number) {
  if (Math.abs(x - e.x) + Math.abs(y - e.y) > 1e-6) e.facing = Math.atan2(y - e.y, x - e.x);
}

function stop(e: EnemyEnt) {
  e.vx = e.vy = 0;
}

/** Ticks of a cooldown, shortened in the final phase. */
function cooldown(s: SimState, e: EnemyEnt, T: ColossusTuning, ms: number): number {
  return s.cat.steps(ms * (e.boss!.finalPhase ? T.finalCooldown : 1));
}

/**
 * `base` damage with what's baked into its slam at spawn (difficulty × the wave's multiplier, §9.3),
 * so the boulder, rings and Charge scale like the slam.
 */
function scaled(s: SimState, e: EnemyEnt, base: number): number {
  return base * (e.stats.damage / s.cat.enemy(e.kind).attack.damage);
}

function ready(e: EnemyEnt, key: string, t: number): boolean {
  return t >= (e.boss!.ready?.[key] ?? 0);
}

function setReady(e: EnemyEnt, key: string, at: number) {
  const b = e.boss!;
  b.ready ??= {};
  b.ready[key] = at;
}

// ---- stagger -------------------------------------------------------------------------------------

function staggered(e: EnemyEnt): boolean {
  return e.boss !== undefined && e.boss.staggeredUntil !== null;
}

function fill(s: SimState, e: EnemyEnt, amount: number) {
  const b = e.boss!;
  if (b.staggeredUntil !== null || amount <= 0) return;
  b.stagger = Math.min(1, b.stagger + amount);
  if (b.stagger < 1) return;
  const T = tuning(s.cat.enemy(e.kind));
  b.stagger = 0;
  b.staggeredUntil = s.tick() + s.cat.steps(T.staggerMs);
  cancel(s, e);
  stop(e);
  s.emit({ e: 'stagger', id: e.id, on: true });
}

/** Calls off the attack winding up and its marker (a boulder already thrown still lands). */
function cancel(s: SimState, e: EnemyEnt) {
  const act = e.boss!.act;
  if (!act) return;
  e.boss!.act = null;
  if (act.marker !== null) {
    const w = s.world;
    const i = w.markers.findIndex((m) => m.id === act.marker);
    if (i >= 0) w.markers.splice(i, 1);
  }
}

/**
 * The Colossus's own hooks (on its `mods`): stuns refused but counted into the meter (not while
 * staggered or for `stunImmuneMs` after), bonus damage taken while staggered, and its multiplier
 * against the Citadel (pipeline stage 2).
 */
function colossusModifier(): Modifier {
  return {
    id: 'boss:colossus',
    hooks: {
      beforeEffect(ctx, self, ev) {
        if (ev.effect !== 'stun') return true;
        const s = state(ctx);
        const e = self as EnemyEnt;
        const b = e.boss;
        if (!b || b.staggeredUntil !== null) return false;
        const T = tuning(s.cat.enemy(e.kind));
        const t = s.tick();
        // Just back on its feet: stuns don't count (`ready.stun`, set as the stagger ends).
        if (!ready(e, 'stun', t)) return false;
        if (
          b.stunAt === null ||
          b.stunAt === undefined ||
          t - b.stunAt >= s.cat.steps(T.stunLockMs)
        ) {
          b.stunAt = t;
          fill(s, e, T.staggerStun);
        }
        return false;
      },
      modifyIncoming(ctx, self, d) {
        const e = self as EnemyEnt;
        if (!staggered(e)) return;
        d.amount *= 1 + tuning(state(ctx).cat.enemy(e.kind)).staggerBonus;
      },
      modifyOutgoing(ctx, self, d) {
        const s = state(ctx);
        if (s.kinds.get(d.target) !== 'base') return;
        d.amount *= tuning(s.cat.enemy((self as EnemyEnt).kind)).baseMult;
      },
    },
  };
}

// ---- attacks -------------------------------------------------------------------------------------

function addMarker(s: SimState, m: Omit<DangerMarker, 'id'>, announce: boolean): EntityId {
  const w = s.world;
  const id = w.nextId++;
  w.markers.push({ id, ...m });
  if (announce) s.emit({ e: 'marker', id, source: m.source, landsAtTick: m.landsAt });
  return id;
}

function begin(s: SimState, e: EnemyEnt, act: BossAct) {
  e.boss!.act = act;
  stop(e);
  face(e, act.x, act.y);
  s.emit({ e: 'attack', source: e.id, slot: 'attack', x: e.x, y: e.y, angle: e.facing });
}

/**
 * A slam toward (tx, ty): in front of its body for a unit, on the point itself for the
 * Citadel (`atPoint`). The marker lands exactly `attack.windupMs` later (90 steps).
 */
function slam(
  s: SimState,
  e: EnemyEnt,
  kind: 'slam',
  target: EntityId,
  tx: number,
  ty: number,
  atPoint: boolean,
) {
  const def = s.cat.enemy(e.kind);
  const T = tuning(def);
  const t = s.tick();
  let x = tx;
  let y = ty;
  if (!atPoint) {
    const d = dist(e.x, e.y, tx, ty);
    const dx = d > 1e-6 ? (tx - e.x) / d : Math.cos(e.facing);
    const dy = d > 1e-6 ? (ty - e.y) / d : Math.sin(e.facing);
    x = e.x + dx * (e.r + T.slamOffset);
    y = e.y + dy * (e.r + T.slamOffset);
  }
  const lands = t + s.cat.steps(def.attack.windupMs!);
  const marker = addMarker(
    s,
    {
      source: e.id,
      shape: 'circle',
      x,
      y,
      r: def.attack.radius!,
      createdAt: t,
      landsAt: lands,
      payload: { damage: e.stats.damage, kind: 'area', tags: ['boss', kind], hitsBuilds: true },
    },
    true,
  );
  begin(s, e, { kind, startedAt: t, at: lands, x, y, target, marker });
}

/** The nearest targetable player or soldier the slam can reach (ties by id). */
function slamTarget(s: SimState, e: EnemyEnt, T: ColossusTuning): Unit | null {
  const def = s.cat.enemy(e.kind);
  const reach = e.r + T.slamOffset + def.attack.radius! * T.slamReach;
  let best: Unit | null = null;
  let bestD = Infinity;
  const consider = (u: Unit) => {
    const d = dist(e.x, e.y, u.x, u.y) - u.r;
    if (d > reach) return;
    if (d < bestD || (d === bestD && best !== null && u.id < best.id)) {
      best = u;
      bestD = d;
    }
  };
  for (const p of s.world.players) if (s.targetable(p)) consider(p);
  for (const u of s.world.soldiers) if (u.hp > 0 && !u.flight) consider(u);
  return best;
}

/**
 * Where a boulder goes: the centroid of the largest group of targetable players (2 or more within
 * `groupRadius` of one of them), else the nearest single player; all within
 * [min, max] range. Ties go to the nearer, then the lower slot or id.
 */
export function boulderTarget(
  s: SimState,
  e: EnemyEnt,
  T: ColossusTuning,
): { x: number; y: number; target: EntityId | null } | null {
  const inRange = (x: number, y: number) => {
    const d = dist(e.x, e.y, x, y);
    return d >= T.boulderMinRange && d <= T.boulderRange;
  };
  const up = s.world.players.filter((p) => s.targetable(p));
  let group: { n: number; x: number; y: number; d: number; id: EntityId } | null = null;
  for (const p of up) {
    let n = 0;
    let x = 0;
    let y = 0;
    for (const q of up) {
      if (dist(p.x, p.y, q.x, q.y) > T.groupRadius) continue;
      n++;
      x += q.x;
      y += q.y;
    }
    x /= n;
    y /= n;
    if (!inRange(x, y)) continue;
    const d = dist(e.x, e.y, x, y);
    if (!group || n > group.n || (n === group.n && d < group.d)) group = { n, x, y, d, id: p.id };
  }
  if (group && group.n >= 2) return { x: group.x, y: group.y, target: group.id };
  if (group) return { x: group.x, y: group.y, target: group.id };
  return null;
}

function boulder(s: SimState, e: EnemyEnt, to: { x: number; y: number; target: EntityId | null }) {
  const T = tuning(s.cat.enemy(e.kind));
  const t = s.tick();
  const windup = s.cat.steps(T.boulderWindupMs);
  const d = dist(e.x, e.y, to.x, to.y);
  const flight = Math.max(s.cat.steps(T.boulderMinFlightMs), Math.round((d / T.boulderSpeed) * 60));
  const marker = addMarker(
    s,
    {
      source: e.id,
      shape: 'circle',
      x: to.x,
      y: to.y,
      r: T.boulderRadius,
      createdAt: t,
      landsAt: t + windup + flight,
      payload: {
        damage: scaled(s, e, T.boulderDamage),
        kind: 'shell',
        tags: ['boss', 'boulder'],
        hitsBuilds: true,
      },
    },
    true,
  );
  begin(s, e, { kind: 'boulder', startedAt: t, at: t + windup, ...to, marker });
}

/** The boulder leaves the near fist: an arcing projectile (drawn) landing with its marker. */
function launch(s: SimState, e: EnemyEnt, act: BossAct) {
  const w = s.world;
  const t = w.tick;
  const m = w.markers.find((x) => x.id === act.marker);
  if (!m) return;
  const dx = act.x - e.x;
  const dy = act.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const v = tuning(s.cat.enemy(e.kind)).boulderSpeed;
  w.projectiles.push({
    id: w.nextId++,
    x: e.x,
    y: e.y,
    vx: (dx / Math.max(1e-6, d)) * v,
    vy: (dy / Math.max(1e-6, d)) * v,
    r: 0.3,
    z: 0,
    side: 'theirs',
    source: e.id,
    from: e.kind,
    slot: 'attack',
    damage: m.payload.damage,
    kind: 'shell',
    tags: ['boss', 'boulder'],
    effects: [],
    hitsFlyers: false,
    pierce: 0,
    hit: [],
    expiresAt: m.landsAt,
    arc: {
      from: { x: e.x, y: e.y },
      to: { x: act.x, y: act.y },
      launchedAt: t,
      landsAt: m.landsAt,
      radius: m.r,
    },
  });
}

/** Final phase: rings rolling out from a slam's circle, one band per `ringStepMs` (dodge them). */
function rings(s: SimState, e: EnemyEnt, x: number, y: number) {
  const def = s.cat.enemy(e.kind);
  const T = tuning(def);
  const t = s.tick();
  const step = s.cat.steps(T.ringStepMs);
  const r0 = def.attack.radius!;
  for (let k = 1; k <= T.ringCount; k++) {
    const inner = r0 + (k - 1) * T.ringBand;
    addMarker(
      s,
      {
        source: e.id,
        shape: 'ring',
        x,
        y,
        r: inner + T.ringBand,
        inner,
        createdAt: t,
        landsAt: t + k * step,
        payload: {
          damage: scaled(s, e, T.ringDamage),
          kind: 'area',
          tags: ['boss', 'shockwave'],
          hitsBuilds: false,
        },
      },
      false,
    );
  }
}

// ---- the Charge -----------------------------------------------------------------------------------

/** How far it can run toward (tx, ty) plus the overshoot before the map edge or the Citadel. */
function laneEnd(
  s: SimState,
  e: EnemyEnt,
  tx: number,
  ty: number,
  T: ColossusTuning,
): { x: number; y: number; len: number } | null {
  const d = dist(e.x, e.y, tx, ty);
  if (d < 1e-6) return null;
  const dx = (tx - e.x) / d;
  const dy = (ty - e.y) / d;
  const { cols, rows } = s.world.grid;
  const want = d + T.chargeOvershoot;
  const inc = 0.25;
  let len = 0;
  while (len + inc <= want) {
    const x = e.x + dx * (len + inc);
    const y = e.y + dy * (len + inc);
    if (x < e.r || y < e.r || x > cols - e.r || y > rows - e.r) break;
    if (rectDist(x, y, s.baseRect) < e.r) break;
    len += inc;
  }
  // It must at least reach the knight's side of the lane.
  if (len < Math.min(d, T.chargeMinRange)) return null;
  return { x: e.x + dx * len, y: e.y + dy * len, len };
}

/** The nearest knight in Charge range with a lane to run (ties by id). */
function chargeTarget(s: SimState, e: EnemyEnt, T: ColossusTuning) {
  let best: { x: number; y: number; len: number; target: EntityId } | null = null;
  let bestD = Infinity;
  for (const p of s.world.players) {
    if (!s.targetable(p)) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    if (d < T.chargeMinRange || d > T.chargeRange || d >= bestD) continue;
    const end = laneEnd(s, e, p.x, p.y, T);
    if (!end) continue;
    best = { ...end, target: p.id };
    bestD = d;
  }
  return best;
}

/** The tell: rooted, the lane marker up until the run ends. */
function charge(
  s: SimState,
  e: EnemyEnt,
  to: { x: number; y: number; len: number; target: EntityId },
  T: ColossusTuning,
) {
  const t = s.tick();
  const windup = s.cat.steps(T.chargeWindupMs);
  const run = Math.max(1, Math.ceil((to.len / T.chargeSpeed) * 60));
  const marker = addMarker(
    s,
    {
      source: e.id,
      shape: 'lane',
      x: e.x,
      y: e.y,
      x2: to.x,
      y2: to.y,
      r: T.chargeHalfWidth,
      createdAt: t,
      landsAt: t + windup + run,
      payload: { damage: 0, kind: 'contact', tags: ['boss', 'charge'], hitsBuilds: false },
    },
    true,
  );
  // Counted from the end of the run; a stagger that cuts it short keeps the cooldown.
  setReady(e, 'charge', t + windup + run + cooldown(s, e, T, T.chargeCooldownMs));
  begin(s, e, {
    kind: 'charge',
    startedAt: t,
    at: t + windup,
    x: to.x,
    y: to.y,
    target: to.target,
    marker,
  });
}

/** One step of the run: on down the lane, hitting what it crosses. */
function runStep(s: SimState, e: EnemyEnt, act: BossAct, T: ColossusTuning) {
  walkTo(e, act.x, act.y, T.chargeSpeed);
  const hit = (act.hit ??= []);
  const reach = (u: Unit) => dist(e.x, e.y, u.x, u.y) <= T.chargeHalfWidth + u.r;
  const blow = (u: Unit) => {
    hit.push(u.id);
    s.damage({
      source: e.id,
      target: u.id,
      amount: scaled(s, e, T.chargeDamage),
      kind: 'contact',
      tags: ['boss', 'charge'],
    });
    knockAside(s, e, u, act, T);
  };
  for (const p of s.world.players) if (s.targetable(p) && !hit.includes(p.id) && reach(p)) blow(p);
  // A soldier in the air (Reinforcements) flies over it, as over every ground attack.
  for (const u of s.world.soldiers)
    if (u.hp > 0 && !u.flight && !hit.includes(u.id) && reach(u)) blow(u);
  // HP builds it crosses are destroyed; mines and the flag aren't targetable (§9.2).
  for (const b of s.world.builds) {
    if (!buildTargetable(b) || !reach(b)) continue;
    s.damage({
      source: e.id,
      target: b.id,
      amount: b.hp,
      kind: 'contact',
      tags: ['boss', 'charge'],
    });
  }
}

/** Throws `u` out of the lane: to its nearer side and a little forward, `chargeKnockback` tiles. */
function knockAside(s: SimState, e: EnemyEnt, u: Unit, act: BossAct, T: ColossusTuning) {
  const l = dist(e.x, e.y, act.x, act.y);
  const fx = l > 1e-6 ? (act.x - e.x) / l : Math.cos(e.facing);
  const fy = l > 1e-6 ? (act.y - e.y) / l : Math.sin(e.facing);
  const side = fx * (u.y - e.y) - fy * (u.x - e.x) >= 0 ? 1 : -1;
  let dx = fx * 0.5 - fy * side;
  let dy = fy * 0.5 + fx * side;
  const n = Math.sqrt(dx * dx + dy * dy);
  dx /= n;
  dy /= n;
  const v0 = T.chargeKnockback * 60 * (1 - s.cat.rules.knockbackDecay);
  u.push = { x: (u.push?.x ?? 0) + dx * v0, y: (u.push?.y ?? 0) + dy * v0 };
}

/** Skitters launch from the spires, fanned out behind it. */
function callRunners(s: SimState, e: EnemyEnt) {
  const n = tuning(s.cat.enemy(e.kind)).runners;
  const bx = -Math.cos(e.facing);
  const by = -Math.sin(e.facing);
  for (let i = 0; i < n; i++) {
    const side = (i - (n - 1) / 2) * 0.5;
    s.spawnEnemy(
      'runner',
      e.x + bx * e.r * 0.6 - by * side,
      e.y + by * e.r * 0.6 + bx * side,
      e.portal,
    );
  }
}

/** Grunt and Swarm escorts walking in beside it (Mk II and III). */
function escorts(s: SimState, e: EnemyEnt, T: ColossusTuning) {
  const rng = s.rng(`combat:${s.world.wave}`);
  for (let i = 0; i < T.escortGrunts; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const off = e.r + 0.5 + Math.floor(i / 2) * 0.7;
    s.spawnEnemy('grunt', e.x + side * off, e.y + 0.3, e.portal);
  }
  const size = s.cat.enemy('swarm').groupSize ?? 1;
  for (let g = 0; g < T.escortSwarms; g++) {
    let group: number | undefined;
    const cx = e.x + (g % 2 === 0 ? -1 : 1) * 0.6;
    const cy = e.y + e.r + 0.8;
    for (let i = 0; i < size; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = 0.9 * Math.sqrt(rng.next());
      const m = s.spawnEnemy('swarm', cx + Math.cos(a) * d, cy + Math.sin(a) * d, e.portal, group);
      group ??= m.id;
    }
  }
}

// ---- walking -------------------------------------------------------------------------------------

/** Walk the ground field to the Citadel. */
function advance(s: SimState, e: EnemyEnt, T: ColossusTuning) {
  const t = s.tick();
  const reach = T.slamOffset + T.baseReach;
  if (rectDist(e.x, e.y, s.baseRect) - e.r <= reach) {
    // At the Citadel: heavy hits on it (§9.2), never instant.
    stop(e);
    const n = rectNearest(e.x, e.y, s.baseRect);
    face(e, n.x, n.y);
    if (ready(e, 'slam', t)) slam(s, e, 'slam', BASE_ID, n.x, n.y, true);
    return;
  }
  const speed = e.stats.moveSpeed * (e.boss!.finalPhase ? T.finalSpeed : 1);
  const step = fieldStep(s, e, s.world.fields.ground, speed);
  if (step.kind === 'goal') toBase(s, e, speed);
}

// ---- the module ----------------------------------------------------------------------------------

/** The attack that just reached its tick: the slam lands (stepMarkers), the boulder leaves, Runners. */
function finish(s: SimState, e: EnemyEnt, act: BossAct, T: ColossusTuning) {
  const t = s.tick();
  const def = s.cat.enemy(e.kind);
  switch (act.kind as ColossusAct) {
    case 'slam':
      setReady(e, 'slam', t + cooldown(s, e, T, def.attack.cooldownMs));
      if (e.boss!.finalPhase) rings(s, e, act.x, act.y);
      return;
    case 'boulder':
      launch(s, e, act);
      setReady(e, 'boulder', t + cooldown(s, e, T, T.boulderCooldownMs));
      return;
    case 'charge': {
      // The tell is over: the run starts now and ends as the lane marker does.
      const m = s.world.markers.find((x) => x.id === act.marker);
      const run: BossAct = {
        ...act,
        kind: 'chargeRun',
        startedAt: t,
        at: m ? m.landsAt : t + 1,
        hit: [],
      };
      e.boss!.act = run;
      runStep(s, e, run, T);
      return;
    }
    case 'call':
      callRunners(s, e);
      setReady(e, 'call', t + cooldown(s, e, T, T.callCooldownMs));
      return;
  }
}

export const colossus: BossBehavior = {
  id: 'colossus',

  init(ctx, e, variant) {
    const s = state(ctx);
    const T = tuning(s.cat.enemy(e.kind));
    const mult = variant.mk === 3 ? T.hpMk3 : variant.mk === 2 ? T.hpMk2 : 1;
    e.maxHp *= mult;
    e.hp = e.maxHp;
    e.ai = 'boss';
    const t = s.tick();
    e.boss = {
      mk: variant.mk,
      stagger: 0,
      staggeredUntil: null,
      finalPhase: false,
      act: null,
      // The first boulder, Charge and Runner call wait half a cooldown, so it walks in first.
      ready: {
        slam: t,
        boulder: t + s.cat.steps(T.boulderCooldownMs / 2),
        charge: t + s.cat.steps(T.chargeCooldownMs / 2),
        call: t + s.cat.steps(T.callCooldownMs / 2),
      },
      stunAt: null,
    };
    e.mods.push(colossusModifier());
    if (variant.mk >= 2) escorts(s, e, T);
  },

  tick(ctx, e) {
    const s = state(ctx);
    const b = e.boss;
    if (!b) return;
    const T = tuning(s.cat.enemy(e.kind));
    const t = s.tick();
    // Too heavy for knockback.
    e.push = null;
    if (b.staggeredUntil !== null) {
      if (t < b.staggeredUntil) {
        stop(e);
        return;
      }
      b.staggeredUntil = null;
      setReady(e, 'stun', t + s.cat.steps(T.stunImmuneMs));
      s.emit({ e: 'stagger', id: e.id, on: false });
    }
    if (b.mk >= 3 && !b.finalPhase && e.hp < e.maxHp * T.finalAt) {
      b.finalPhase = true;
    }
    const act = b.act ?? null;
    if (act?.kind === 'chargeRun') {
      if (t < act.at) {
        runStep(s, e, act, T);
        return;
      }
      b.act = null;
      stop(e);
    } else if (act) {
      stop(e);
      if (t < act.at) return;
      b.act = null;
      finish(s, e, act, T);
      if (b.act) return; // the Charge's tell became its run
    }
    if (b.mk >= 3 && ready(e, 'call', t)) {
      begin(s, e, {
        kind: 'call',
        startedAt: t,
        at: t + s.cat.steps(T.callWindupMs),
        x: e.x + Math.cos(e.facing),
        y: e.y + Math.sin(e.facing),
        target: null,
        marker: null,
      });
      return;
    }
    if (ready(e, 'slam', t)) {
      const u = slamTarget(s, e, T);
      if (u) {
        slam(s, e, 'slam', u.id, u.x, u.y, false);
        return;
      }
    }
    if (b.mk >= 2 && ready(e, 'charge', t)) {
      const to = chargeTarget(s, e, T);
      if (to) {
        charge(s, e, to, T);
        return;
      }
    }
    if (ready(e, 'boulder', t)) {
      const to = boulderTarget(s, e, T);
      if (to) {
        boulder(s, e, to);
        return;
      }
    }
    advance(s, e, T);
  },

  onDamage(ctx, e, r) {
    if (r.dealt <= 0 || e.hp <= 0 || !e.boss) return;
    const s = state(ctx);
    fill(s, e, (r.dealt / Math.max(1, e.maxHp)) * tuning(s.cat.enemy(e.kind)).staggerPerHp);
  },
};
