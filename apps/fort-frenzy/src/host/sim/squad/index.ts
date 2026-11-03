// The Commander's squad (SPEC §8, step 4 of §15.3): automaton footmen that follow him in a loose
// formation, or hold the rally flag's position while it's planted, and in combat attack enemies near
// their post. Size 3, then one more after each boss wave (wave data's `boss`, waves 5 and 10 in v1).
// The fallen respawn at the base at the start of each build phase. Steering is straight toward the
// goal, with the usual structure collision (BUILD_PLAN §8 FF9: no flow field needed).
import type { CharacterDef, WaveDef } from '../../../content/types';
import { dist } from '../geometry';
import type { FullState } from '../state';
import type { EnemyEnt, PlayerEnt, SoldierEnt } from '../types';

/** A soldier engages enemies this close to it (tiles)… */
export const SQUAD_AGGRO = 3;
/** …and never chases further than this from its post (the flag, or the Commander). */
export const SQUAD_LEASH = 5;
/** Far from their slot, soldiers hurry (tiles, speed factor). */
const HURRY_AT = 3;
const HURRY = 1.3;
/** Close enough to the formation slot to stand still (tiles). */
const ARRIVED = 0.12;
/** Formation: radius around a planted flag; spread between follow slots (radians). */
const FLAG_RING = 0.8;
const FOLLOW_SPREAD = 0.6;

type SquadDef = NonNullable<CharacterDef['squad']>;

/** Squad size before wave `wave`: one step per boss wave already cleared (waves before it). */
export function squadSize(waves: readonly WaveDef[], sizes: readonly number[], wave: number): number {
  const bosses = waves.filter((w) => w.boss !== undefined && w.n < wave).length;
  return sizes[Math.min(bosses, sizes.length - 1)] ?? 0;
}

function squadOf(s: FullState, p: PlayerEnt): SquadDef | undefined {
  return s.cat.character(p.classId).squad;
}

/** Build start: every Commander's missing soldiers (dead, or newly earned) appear at the base. */
export function fillSquads(s: FullState): void {
  const w = s.world;
  for (const p of w.players) {
    const def = squadOf(s, p);
    if (!def) continue;
    const size = squadSize(s.cat.waves, def.size, w.wave);
    const have = new Set(w.soldiers.filter((u) => u.owner === p.slot).map((u) => u.index));
    const at = s.respawnPoint(p.slot);
    for (let i = 0; i < size; i++) {
      if (have.has(i)) continue;
      const u = s.addSoldier(p.slot, at.x + (i - (size - 1) / 2) * 0.45, at.y + 0.6, i);
      u.mode = p.flag ? 'rally' : 'follow';
    }
  }
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
      x: c.flag.x + Math.cos(a) * FLAG_RING,
      y: c.flag.y + Math.sin(a) * FLAG_RING,
      anchor: c.flag,
    };
  }
  if (!c || c.respawnAt !== null || !c.connected) return null;
  const a = c.facing + Math.PI + (k - (n - 1) / 2) * FOLLOW_SPREAD;
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

/** Nearest enemy this soldier may engage: near it, and within the leash of its post. */
function pick(
  s: FullState,
  u: SoldierEnt,
  def: SquadDef,
  anchor: { x: number; y: number },
): EnemyEnt | null {
  const cur = u.target === null ? undefined : s.units.get(u.target);
  if (cur && cur.hp > 0 && s.kinds.get(cur.id) === 'enemy') {
    if (dist(anchor.x, anchor.y, cur.x, cur.y) <= SQUAD_LEASH) return cur as EnemyEnt;
  }
  let best: EnemyEnt | null = null;
  let bestD = Infinity;
  for (const e of s.world.enemies) {
    if (e.hp <= 0 || (e.flying && !def.soldier.attack.hitsFlyers)) continue;
    if (dist(anchor.x, anchor.y, e.x, e.y) > SQUAD_LEASH) continue;
    const d = dist(u.x, u.y, e.x, e.y) - e.r;
    if (d <= SQUAD_AGGRO && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Step 4: soldiers move to their post and, in combat, fight near it. */
export function stepSquads(s: FullState): void {
  const w = s.world;
  if (w.soldiers.length === 0) return;
  const fighting = w.phase === 'combat';
  const t = w.tick;
  // Formation slots in index order per Commander.
  const counts = new Map<number, number>();
  const rank = new Map<number, number>();
  for (const u of [...w.soldiers].sort((a, b) => a.index - b.index || a.id - b.id)) {
    if (u.hp <= 0) continue;
    const k = counts.get(u.owner) ?? 0;
    rank.set(u.id, k);
    counts.set(u.owner, k + 1);
  }
  for (const u of w.soldiers) {
    if (u.hp <= 0) continue;
    const c = s.player(u.owner);
    const def = c ? squadOf(s, c) : undefined;
    if (!def) {
      u.vx = u.vy = 0;
      continue;
    }
    if (u.push && Math.abs(u.push.x) + Math.abs(u.push.y) > 1) {
      u.vx = u.vy = 0;
      continue;
    }
    const post = postOf(c, def, u.mode, rank.get(u.id) ?? 0, counts.get(u.owner) ?? 1);
    const anchor = post?.anchor ?? { x: u.x, y: u.y };
    const speed = u.stats.moveSpeed;
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
        amount: s.attackStat(u, a.damage, 'damage'),
        kind: 'melee',
        tags: [],
      });
      continue;
    }
    if (!post) {
      u.vx = u.vy = 0;
      continue;
    }
    const far = dist(u.x, u.y, post.x, post.y) > HURRY_AT;
    walkTo(u, post.x, post.y, speed * (far ? HURRY : 1), ARRIVED);
  }
}
