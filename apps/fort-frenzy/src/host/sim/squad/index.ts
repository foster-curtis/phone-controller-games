// The Commander's squad (SPEC §8.4, step 4 of §15.3): automaton footmen that follow him in a loose
// formation, or hold the rally flag while it's out, and in combat attack enemies near their post. A
// Commander gets `squad.start` soldiers once per run; after that Reinforcements is the only source,
// up to the cap, and the fallen don't come back. Steering is straight toward the goal, with the usual
// collision (BUILD_PLAN §8 FF9: no flow field needed). Engage range, leash, hurry and formation are
// content (`KnightDef.squad`). Squad cards read through the Commander's `squad*` stats.
import type { KnightDef } from '../../../content/types';
import { dist } from '../geometry';
import type { SimState } from '../internal';
import type { FullState } from '../state';
import type { DamageResult, EnemyEnt, PlayerEnt, SoldierEnt, World } from '../types';

/** Close enough to the formation slot to stand still (tiles). */
const ARRIVED = 0.12;

type SquadDef = NonNullable<KnightDef['squad']>;

function squadOf(s: Pick<SimState, 'cat'>, p: PlayerEnt): SquadDef | undefined {
  return s.cat.knight(p.classId).squad;
}

/** Soldiers this Commander has now, the ones in the air included. */
export function squadCount(w: Pick<World, 'soldiers'>, slot: number): number {
  let n = 0;
  for (const u of w.soldiers) if (u.owner === slot && u.hp > 0) n++;
  return n;
}

/** The squad cap: content plus Reinforced Ranks (the `squadCap` stat). */
export function squadCapOf(squad: Pick<SquadDef, 'cap'>, stat: (base: number) => number): number {
  return Math.floor(stat(squad.cap));
}

/** At the squad cap the super can't fire and its charge is held (§8.4). */
export function superBlocked(s: SimState, p: PlayerEnt): boolean {
  const def = squadOf(s, p);
  if (!def) return false;
  const cap = squadCapOf(def, (b) => s.attackStat(p, b, 'squadCap', 'squad'));
  return squadCount(s.world, p.slot) >= cap;
}

/** A Commander's starting soldiers appear at the base, once per run (§8.4). */
export function seedSquads(s: FullState): void {
  for (const p of s.world.players) {
    const def = squadOf(s, p);
    if (!def || p.squadSeeded) continue;
    p.squadSeeded = true;
    const at = s.respawnPoint(p.slot);
    for (let i = 0; i < def.start; i++) {
      const u = s.addSoldier(p.slot, at.x + (i - (def.start - 1) / 2) * 0.45, at.y + 0.6, i);
      u.mode = p.flag ? 'rally' : 'follow';
    }
  }
}

/** A soldier's base max HP under this Commander's cards (Drillmaster). */
function soldierHp(s: SimState, c: PlayerEnt): number {
  return s.attackStat(c, squadOf(s, c)?.soldier.hp ?? 0, 'squadHp', 'squad');
}

/** What his cards do to every soldier this step: read once per Commander. */
interface SquadMods {
  hp: number;
  /** × the soldier's own speed (Forced March). */
  speed: number;
  /** × the soldier's own damage (Drillmaster). */
  damage: number;
}

function modsOf(s: SimState, c: PlayerEnt): SquadMods {
  return {
    hp: soldierHp(s, c),
    speed: s.attackStat(c, 1, 'squadSpeed', 'squad'),
    damage: s.attackStat(c, 1, 'squadDamage', 'squad'),
  };
}

/**
 * Drillmaster's HP (the Commander's `squadHp`) as this soldier's base max HP. A raise heals in with
 * it, like Vitality; the soldier otherwise keeps its HP between waves (§8.4).
 */
export function refitSoldier(
  s: FullState,
  c: PlayerEnt,
  u: SoldierEnt,
  hp = soldierHp(s, c),
): void {
  const base = s.baseStats.get(u.id);
  if (!base || base.maxHp === hp) return;
  const gain = hp - base.maxHp;
  base.maxHp = hp;
  s.refreshUnit(u);
  if (gain > 0) u.hp = Math.min(u.maxHp, u.hp + gain);
}

/** A soldier's hit (§8.3): the Commander's squad stats, his run total, his super at the reduced rate. */
export function creditSquadDamage(s: SimState, u: SoldierEnt, r: DamageResult): void {
  const c = s.player(u.owner);
  if (!c) return;
  c.run.damageDealt += r.dealt;
  const rate = s.cat.knight(c.classId).superCharge.perSquadDamage ?? 0;
  if (rate <= 0 || c.superCharge >= 1) return;
  c.superCharge = Math.min(1, c.superCharge + r.dealt * s.attackStat(c, rate, 'superCharge'));
  if (c.superCharge >= 1 && !superBlocked(s, c)) s.emit({ e: 'superReady', slot: c.slot });
}

/** Where soldier `k` of `n` stands: around the flag, or behind the Commander; null = hold. */
export function postOf(
  c: PlayerEnt | undefined,
  def: SquadDef,
  mode: SoldierEnt['mode'],
  k: number,
  n: number,
): { x: number; y: number; anchor: { x: number; y: number } } | null {
  if (mode === 'rally' && c?.flag) {
    const a = (2 * Math.PI * k) / Math.max(1, n) - Math.PI / 2;
    return {
      x: c.flag.x + Math.cos(a) * def.formation.flagRing,
      y: c.flag.y + Math.sin(a) * def.formation.flagRing,
      anchor: c.flag,
    };
  }
  if (!c || c.respawnAt !== null || !c.connected) return null;
  const a = c.facing + Math.PI + (k - (n - 1) / 2) * def.formation.followSpread;
  return {
    x: c.x + Math.cos(a) * def.followRadius,
    y: c.y + Math.sin(a) * def.followRadius,
    anchor: c,
  };
}

function walkTo(u: SoldierEnt, x: number, y: number, speed: number, stopAt: number) {
  const dx = x - u.x;
  const dy = y - u.y;
  const l = Math.sqrt(dx * dx + dy * dy);
  if (l <= stopAt) {
    u.vx = u.vy = 0;
    return;
  }
  const v = Math.min(speed, (l - stopAt) * 60);
  u.vx = (dx / l) * v;
  u.vy = (dy / l) * v;
  u.facing = Math.atan2(dy, dx);
}

/**
 * Nearest enemy this soldier may engage: near it, and within the leash of its post (the flag, or the
 * Commander).
 */
function pick(
  s: FullState,
  u: SoldierEnt,
  def: SquadDef,
  anchor: { x: number; y: number },
): EnemyEnt | null {
  const { radius, leash } = def.aggro;
  const cur = u.target === null ? undefined : s.units.get(u.target);
  if (cur && cur.hp > 0 && s.kinds.get(cur.id) === 'enemy') {
    if (dist(anchor.x, anchor.y, cur.x, cur.y) <= leash) return cur as EnemyEnt;
  }
  let best: EnemyEnt | null = null;
  let bestD = Infinity;
  for (const e of s.world.enemies) {
    if (e.hp <= 0 || (e.flying && !def.soldier.attack.hitsFlyers)) continue;
    if (dist(anchor.x, anchor.y, e.x, e.y) > leash) continue;
    const d = dist(u.x, u.y, e.x, e.y) - e.r;
    if (d <= radius && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** A thrown soldier flies along its arc and joins the squad where it lands (§2.4). */
function fly(u: SoldierEnt, t: number): void {
  const f = u.flight!;
  u.vx = u.vy = 0;
  if (t >= f.landsAt) {
    u.x = f.to.x;
    u.y = f.to.y;
    u.flight = null;
    return;
  }
  const k = (t - f.launchedAt) / Math.max(1, f.landsAt - f.launchedAt);
  u.x = f.from.x + (f.to.x - f.from.x) * k;
  u.y = f.from.y + (f.to.y - f.from.y) * k;
}

/** Step 4: soldiers move to their post and, in combat, fight near it. */
export function stepSquads(s: FullState): void {
  const w = s.world;
  if (w.soldiers.length === 0) return;
  const fighting = w.phase === 'combat';
  const t = w.tick;
  // Formation slots in index order per Commander; soldiers in the air take theirs on landing.
  const counts = new Map<number, number>();
  const rank = new Map<number, number>();
  for (const u of [...w.soldiers].sort((a, b) => a.index - b.index || a.id - b.id)) {
    if (u.hp <= 0 || u.flight) continue;
    const k = counts.get(u.owner) ?? 0;
    rank.set(u.id, k);
    counts.set(u.owner, k + 1);
  }
  const read = new Map<number, SquadMods>();
  for (const u of w.soldiers) {
    if (u.hp <= 0) continue;
    const c = s.player(u.owner);
    const def = c ? squadOf(s, c) : undefined;
    if (!c || !def) {
      u.vx = u.vy = 0;
      continue;
    }
    let mods = read.get(c.slot);
    if (!mods) read.set(c.slot, (mods = modsOf(s, c)));
    refitSoldier(s, c, u, mods.hp);
    if (u.flight) {
      fly(u, t);
      continue;
    }
    if (u.push && Math.abs(u.push.x) + Math.abs(u.push.y) > 1) {
      u.vx = u.vy = 0;
      continue;
    }
    const post = postOf(c, def, u.mode, rank.get(u.id) ?? 0, counts.get(u.owner) ?? 1);
    const anchor = post?.anchor ?? { x: u.x, y: u.y };
    // Forced March goes through the Commander's `squadSpeed`, over the soldier's own speed (morale).
    const speed = u.stats.moveSpeed * mods.speed;
    const target = fighting ? pick(s, u, def, anchor) : null;
    u.target = target?.id ?? null;
    if (target) {
      const a = def.soldier.attack;
      const reach = dist(u.x, u.y, target.x, target.y) - target.r - u.r;
      if (reach > a.range) {
        walkTo(u, target.x, target.y, speed, 0);
        continue;
      }
      u.vx = u.vy = 0;
      u.facing = Math.atan2(target.y - u.y, target.x - u.x);
      if (t < u.attack.readyAt) continue;
      const as = Math.max(0.05, s.attackStat(u, 1, 'attackSpeed'));
      u.attack.readyAt = t + s.cat.steps(a.cooldownMs / as);
      s.emit({ e: 'attack', source: u.id, slot: 'attack', x: u.x, y: u.y, angle: u.facing });
      s.damage({
        source: u.id,
        target: target.id,
        // Drillmaster (the Commander's `squadDamage`) over the soldier's own damage.
        amount: s.attackStat(u, a.damage, 'damage') * mods.damage,
        kind: 'melee',
        tags: ['squad'],
      });
      continue;
    }
    if (!post) {
      u.vx = u.vy = 0;
      continue;
    }
    // Far from their slot, soldiers hurry.
    const far = dist(u.x, u.y, post.x, post.y) > def.hurry!.at;
    walkTo(u, post.x, post.y, speed * (far ? def.hurry!.factor : 1), ARRIVED);
  }
}
