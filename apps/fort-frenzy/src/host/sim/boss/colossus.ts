// The Colossus boss module (SPEC §9.2, §15.3 BossBehavior; FF11). A slow walker on the breaker field
// (walls slow it, never stop it) that keeps to its path and attacks what's in front of it:
// - slam: a red circle in front of it, landing 1.5 s later (exactly `attack.windupMs`), on players,
//   soldiers and structures; a player or soldier in reach, a blocking tower or the Citadel draws it;
// - wall breaker (`breaker`): the same slam on a wall in its way, which takes 3× (`vsStructure`);
// - boulder throw (Mk II+): at the largest group of players (2+), else a tower, else one player, with
//   its landing marker up from the wind-up;
// - final phase (Mk III below half HP): faster moves and attacks, shockwave rings rolling out from
//   every slam, and Runner calls from the spires.
// It can't be stunned or knocked back. A hidden stagger meter fills a little with all damage and
// more with a stun (one per lockout, so stuns alone can't lock it down); full = 3 s on one knee
// taking bonus damage, the attack winding up called off, then the meter starts again from 0.
// Tuning comes from the content's `boss.params` (content/balance.ts). Imports only types, internal,
// geometry and the shared AI steps (registry rule, BUILD_PLAN §8 FF6).
import type { EnemyDef } from '../../../content/types';
import { fieldStep, toBase } from '../ai/field';
import { walkTo } from '../ai/path';
import { dist, rectDist, rectNearest, tileRect } from '../geometry';
import { state, type SimState } from '../internal';
import {
  BASE_ID,
  type BossAct,
  type BossBehavior,
  type DangerMarker,
  type EnemyEnt,
  type EntityId,
  type Modifier,
  type StructureEnt,
  type Unit,
} from '../types';

/** `boss.params` of the Colossus's content (every key required; content.test checks). */
export interface ColossusTuning {
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
  staggerMs: number;
  staggerBonus: number;
  escortGrunts: number;
  escortSwarms: number;
}

export const COLOSSUS_TUNING_KEYS = [
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
  'staggerMs',
  'staggerBonus',
  'escortGrunts',
  'escortSwarms',
] as const satisfies readonly (keyof ColossusTuning)[];

/** Attack kinds (`BossAct.kind`); render picks the clip by these. */
export type ColossusAct = 'slam' | 'breaker' | 'boulder' | 'call';

const TOWERS = new Set(['arrow_tower', 'bomb_tower']);

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
 * The Colossus's own hooks (on its `mods`): stuns refused but counted into the meter, bonus damage
 * taken while staggered, and its multipliers against walls and the Citadel (pipeline stage 2).
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
        const vs = s.cat.enemy((self as EnemyEnt).kind).vsStructure;
        if (!vs) return;
        const kind = s.kinds.get(d.target);
        if (kind === 'base') d.amount *= vs.base ?? 1;
        else if (kind === 'structure') {
          const st = s.units.get(d.target) as StructureEnt | undefined;
          if (st) d.amount *= vs[st.kind] ?? 1;
        }
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
 * A slam toward (tx, ty): in front of its body for a unit, on the point itself for a structure or the
 * Citadel (`atPoint`). The marker lands exactly `attack.windupMs` later (90 steps).
 */
function slam(
  s: SimState,
  e: EnemyEnt,
  kind: 'slam' | 'breaker',
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
      payload: { damage: e.stats.damage, kind: 'area', tags: ['boss', kind], hitsStructures: true },
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
  for (const u of s.world.soldiers) if (u.hp > 0) consider(u);
  return best;
}

/**
 * Where a boulder goes: the centroid of the largest group of targetable players (2 or more within
 * `groupRadius` of one of them), else the nearest tower, else the nearest single player; all within
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
  let tower: StructureEnt | null = null;
  let towerD = Infinity;
  for (const st of s.world.structures) {
    if (!st.damageable || st.hp <= 0 || !TOWERS.has(st.kind) || !inRange(st.x, st.y)) continue;
    const d = dist(e.x, e.y, st.x, st.y);
    if (d < towerD) {
      tower = st;
      towerD = d;
    }
  }
  if (tower) return { x: tower.x, y: tower.y, target: tower.id };
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
        damage: T.boulderDamage * s.cat.difficulty.enemyDamage,
        kind: 'shell',
        tags: ['boss', 'boulder'],
        hitsStructures: true,
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
    blockedBy: [],
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
          damage: T.ringDamage * s.cat.difficulty.enemyDamage,
          kind: 'area',
          tags: ['boss', 'shockwave'],
          hitsStructures: false,
        },
      },
      false,
    );
  }
}

/** Final phase: Skitters launch from the spires, fanned out behind it. */
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
      e.lane,
    );
  }
}

/** Grunt and Swarm escorts walking in beside it (Mk II and III). */
function escorts(s: SimState, e: EnemyEnt, T: ColossusTuning) {
  const rng = s.rng(`combat:${s.world.wave}`);
  for (let i = 0; i < T.escortGrunts; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const off = e.r + 0.5 + Math.floor(i / 2) * 0.7;
    s.spawnEnemy('grunt', e.x + side * off, e.y + 0.3, e.lane);
  }
  const size = s.cat.enemy('swarm').groupSize ?? 1;
  for (let g = 0; g < T.escortSwarms; g++) {
    let group: number | undefined;
    const cx = e.x + (g % 2 === 0 ? -1 : 1) * 0.6;
    const cy = e.y + e.r + 0.8;
    for (let i = 0; i < size; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = 0.9 * Math.sqrt(rng.next());
      const m = s.spawnEnemy('swarm', cx + Math.cos(a) * d, cy + Math.sin(a) * d, e.lane, group);
      group ??= m.id;
    }
  }
}

// ---- walking -------------------------------------------------------------------------------------

/**
 * A wall or tower its body is about to walk into along its velocity (its radius spans more than one
 * tile, so the field's next tile alone misses blockers beside its center line). Nearest, ties by id.
 */
function blockerAhead(s: SimState, e: EnemyEnt): StructureEnt | null {
  const v = Math.sqrt(e.vx * e.vx + e.vy * e.vy);
  if (v < 1e-6) return null;
  const dx = e.vx / v;
  const dy = e.vy / v;
  const cx = e.x + dx * 0.25;
  const cy = e.y + dy * 0.25;
  const { cols, rows, occupant } = s.world.grid;
  let best: StructureEnt | null = null;
  let bestD = Infinity;
  for (let row = Math.floor(cy - e.r); row <= Math.floor(cy + e.r); row++) {
    for (let col = Math.floor(cx - e.r); col <= Math.floor(cx + e.r); col++) {
      if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
      const occ = occupant[row * cols + col]!;
      if (occ === 0) continue;
      const st = s.units.get(occ) as StructureEnt | undefined;
      if (!st || !st.damageable || st.hp <= 0 || s.cat.structure(st.kind).pathCost <= 1) continue;
      const rect = tileRect(col, row);
      if (rectDist(cx, cy, rect) >= e.r) continue;
      if ((col + 0.5 - e.x) * dx + (row + 0.5 - e.y) * dy <= 0) continue;
      const d = rectDist(e.x, e.y, rect);
      if (d < bestD || (d === bestD && best !== null && st.id < best.id)) {
        best = st;
        bestD = d;
      }
    }
  }
  return best;
}

/** Walk the breaker field to the Citadel; slam what blocks it (walls get the wall breaker). */
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
  const step = fieldStep(s, e, s.world.fields.breaker, speed);
  if (step.kind === 'goal') toBase(s, e, speed);
  const block = step.kind === 'blocked' ? step.st : blockerAhead(s, e);
  if (!block) return;
  if (rectDist(e.x, e.y, tileRect(block.tile[0], block.tile[1])) - e.r > reach) {
    walkTo(e, block.x, block.y, speed);
    return;
  }
  stop(e);
  face(e, block.x, block.y);
  if (ready(e, 'slam', t)) {
    slam(s, e, block.kind === 'wall' ? 'breaker' : 'slam', block.id, block.x, block.y, true);
  }
}

// ---- the module ----------------------------------------------------------------------------------

/** The attack that just reached its tick: the slam lands (stepMarkers), the boulder leaves, Runners. */
function finish(s: SimState, e: EnemyEnt, act: BossAct, T: ColossusTuning) {
  const t = s.tick();
  const def = s.cat.enemy(e.kind);
  switch (act.kind as ColossusAct) {
    case 'slam':
    case 'breaker':
      setReady(e, 'slam', t + cooldown(s, e, T, def.attack.cooldownMs));
      if (e.boss!.finalPhase) rings(s, e, act.x, act.y);
      return;
    case 'boulder':
      launch(s, e, act);
      setReady(e, 'boulder', t + cooldown(s, e, T, T.boulderCooldownMs));
      return;
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
      // The first boulder waits half a cooldown, so it walks in before throwing.
      ready: { slam: t, boulder: t + s.cat.steps(T.boulderCooldownMs / 2), call: t },
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
      s.emit({ e: 'stagger', id: e.id, on: false });
    }
    if (b.mk >= 3 && !b.finalPhase && e.hp < e.maxHp * T.finalAt) {
      b.finalPhase = true;
      setReady(e, 'call', t + s.cat.steps(T.callWindupMs));
    }
    const act = b.act ?? null;
    if (act) {
      stop(e);
      if (t < act.at) return;
      b.act = null;
      finish(s, e, act, T);
    }
    if (b.finalPhase && ready(e, 'call', t)) {
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
    if (b.mk >= 2 && ready(e, 'boulder', t)) {
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
