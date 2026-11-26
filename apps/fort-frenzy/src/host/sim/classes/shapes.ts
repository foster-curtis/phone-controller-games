// Player attack shapes beyond projectiles and circles (SPEC §8): the Commander's shield bash `rect`
// (RD9-fix-1; an unwound `arc` is still served), the Artificer's super `cone` (his heal cone, RD8)
// and Reinforcements' `spawn` (RD9). Players' `fire` dispatches here by `AttackDef.shape`.
import type { AttackDef, KnightDef } from '../../../content/types';
import type { FullState } from '../state';
import type { AttackEvent, EnemyEnt, PlayerEnt } from '../types';
import { sectorHitsBody, stripHitsBody, type GroundBody } from '../body';
import { reinforce } from './commander';
import { rectGeometry, sectorGeometry } from './hitShape';
import { inSector, type Sector, type Strip } from './sector';

export type ShapeFire = (
  s: FullState,
  p: PlayerEnt,
  a: AttackDef,
  slot: 'main' | 'super',
  damage: number,
  atk: AttackEvent,
) => void;

type SuperDef = KnightDef['super'];

/** The attack's sector from the player's facing (already turned to the aim). */
export function sectorOf(s: FullState, p: PlayerEnt, a: AttackDef, slot: 'main' | 'super'): Sector {
  // The same geometry as the TV's aim preview (classes/hitShape.ts).
  const g = sectorGeometry(a, (b, st) => s.attackStat(p, b, st, slot));
  return { x: p.x, y: p.y, angle: p.facing, half: g.half, range: g.range };
}

/** A `rect` attack's rectangle from the player's facing (already turned to the aim). */
export function stripOf(s: FullState, p: PlayerEnt, a: AttackDef, slot: 'main' | 'super'): Strip {
  // The same geometry as the TV's aim preview (classes/hitShape.ts).
  const g = rectGeometry(a, (b, st) => s.attackStat(p, b, st, slot));
  return { x: p.x, y: p.y, angle: p.facing, range: g.range, half: g.width / 2 };
}

function hitEnemies(
  s: FullState,
  p: PlayerEnt,
  a: AttackDef,
  reaches: (e: EnemyEnt, body: GroundBody) => boolean,
  damage: number,
  kind: 'melee' | 'area',
  atk: AttackEvent,
): EnemyEnt[] {
  const hit: EnemyEnt[] = [];
  // A snapshot: hooks may spawn or kill while we hit.
  for (const e of s.world.enemies.slice()) {
    if (e.hp <= 0 || (e.flying && !a.hitsFlyers)) continue;
    // Enemy bodies (C4, body.ts); knights below by their feet.
    if (!reaches(e, s.cat.body(e.kind))) continue;
    s.damage({ source: p.id, target: e.id, amount: damage, kind, tags: [...atk.tags] });
    for (const fx of atk.effects) s.applyEffect(e.id, fx, p.id);
    hit.push(e);
  }
  return hit;
}

const inSectorOf = (sec: Sector) => (e: EnemyEnt, b: GroundBody) =>
  sectorHitsBody(sec, e.x, e.y, b);

/** The bash's knockback: each enemy hit is pushed away from him (Heavy Bash: further). */
function knockBack(
  s: FullState,
  p: PlayerEnt,
  a: AttackDef,
  slot: 'main' | 'super',
  hit: EnemyEnt[],
) {
  const knock = s.attackStat(p, a.knockback ?? 0, 'knockback', slot);
  if (knock <= 0) return;
  const v0 = knock * 60 * (1 - s.cat.rules.knockbackDecay);
  for (const e of hit) {
    if (e.hp <= 0) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    const ux = d < 1e-6 ? Math.cos(p.facing) : dx / d;
    const uy = d < 1e-6 ? Math.sin(p.facing) : dy / d;
    e.push = { x: (e.push?.x ?? 0) + ux * v0, y: (e.push?.y ?? 0) + uy * v0 };
  }
}

/**
 * Shield bash (Commander main, RD9-fix-1): every enemy whose body overlaps the solid rectangle in
 * front of him takes the hit and is knocked back (Heavy Bash: wider, further). No wind-up: the bash
 * lands on the press.
 */
const rect: ShapeFire = (s, p, a, slot, damage, atk) => {
  const st = stripOf(s, p, a, slot);
  const hit = hitEnemies(s, p, a, (e, b) => stripHitsBody(st, e.x, e.y, b), damage, 'melee', atk);
  knockBack(s, p, a, slot, hit);
};

/** An arc with no wind-up (the bash before RC2): every enemy in it is hit and knocked back. */
const arc: ShapeFire = (s, p, a, slot, damage, atk) => {
  const hit = hitEnemies(s, p, a, inSectorOf(sectorOf(s, p, a, slot)), damage, 'melee', atk);
  knockBack(s, p, a, slot, hit);
};

/**
 * Heal cone (Artificer super): heals him and the knights it reaches (not soldiers, not builds,
 * §8.2); damages enemies only if it has damage. Nothing blocks it. Its healing charges neither his
 * super nor his meter (§7.2). Regen restarts in `fire`, like any super.
 */
const cone: ShapeFire = (s, p, a, slot, damage, atk) => {
  const sup = a as SuperDef;
  const sec = sectorOf(s, p, a, slot);
  if (damage > 0) hitEnemies(s, p, a, inSectorOf(sec), damage, 'area', atk);
  const heal = sup.heal ? s.attackStat(p, sup.heal, 'healing', slot) : 0;
  if (heal > 0) {
    for (const q of s.world.players) {
      if (!s.targetable(q) || !inSector(sec, q.x, q.y, q.r)) continue;
      s.heal(q.id, heal, p.id);
    }
  }
};

/** Reinforcements (Commander super): throws soldiers; it hits nothing (classes/commander.ts). */
const spawn: ShapeFire = (s, p, a, _slot, _damage, atk) => {
  reinforce(s, p, a as SuperDef, atk);
};

export const attackShapes: Partial<Record<AttackDef['shape'], ShapeFire>> = {
  arc,
  rect,
  cone,
  spawn,
};
