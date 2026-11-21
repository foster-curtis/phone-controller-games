// Player attack shapes beyond projectiles and circles (SPEC §8): the Commander's sword `arc`, the
// Artificer's super `cone` (heals knights; RD8 replaces it with the heal cone) and the Commander's
// morale `buff` (until RD9). Players' `fire` dispatches here by `AttackDef.shape`.
import type { AttackDef, EffectApply, KnightDef } from '../../../content/types';
import type { FullState } from '../state';
import type { AttackEvent, PlayerEnt } from '../types';
import { sectorHitsBody } from '../body';
import { sectorGeometry } from './hitShape';
import { inSector, type Sector } from './sector';

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

function hitEnemies(
  s: FullState,
  p: PlayerEnt,
  a: AttackDef,
  sec: Sector,
  damage: number,
  kind: 'melee' | 'area',
  atk: AttackEvent,
) {
  // A snapshot: hooks may spawn or kill while we hit.
  for (const e of s.world.enemies.slice()) {
    if (e.hp <= 0 || (e.flying && !a.hitsFlyers)) continue;
    // Enemy bodies (C4, body.ts); knights below by their feet.
    if (!sectorHitsBody(sec, e.x, e.y, s.cat.body(e.kind))) continue;
    s.damage({ source: p.id, target: e.id, amount: damage, kind, tags: [...atk.tags] });
    for (const fx of atk.effects) s.applyEffect(e.id, fx, p.id);
  }
}

/** Sword slash (Commander main): every enemy in a short arc in front of him. */
const arc: ShapeFire = (s, p, a, slot, damage, atk) => {
  hitEnemies(s, p, a, sectorOf(s, p, a, slot), damage, 'melee', atk);
};

/**
 * Nanite cone (Artificer super): heals the knights it reaches (not himself, not builds, §8.2);
 * damages enemies only if it has damage. Nothing blocks it.
 */
const cone: ShapeFire = (s, p, a, slot, damage, atk) => {
  const sup = a as SuperDef;
  const sec = sectorOf(s, p, a, slot);
  if (damage > 0) hitEnemies(s, p, a, sec, damage, 'area', atk);
  const heal = sup.heal ? s.attackStat(p, sup.heal, 'healing', slot) : 0;
  if (heal > 0) {
    for (const q of s.world.players) {
      if (q === p || !s.targetable(q) || !inSector(sec, q.x, q.y, q.r)) continue;
      s.heal(q.id, heal, p.id);
    }
  }
};

/** Morale (Commander super): `effects` on him and his living soldiers, `selfEffects` on him only. */
const buff: ShapeFire = (s, p, a, slot) => {
  const sup = a as SuperDef;
  // Rally Cry (FF12) lengthens them through the `durationMs` stat.
  const k = s.attackStat(p, 1, 'durationMs', slot);
  const longer = (fx: EffectApply) => (k === 1 ? fx : { ...fx, durationMs: fx.durationMs * k });
  for (const fx0 of sup.effects ?? []) {
    const fx = longer(fx0);
    s.applyEffect(p.id, fx, p.id);
    for (const u of s.world.soldiers)
      if (u.owner === p.slot && u.hp > 0) s.applyEffect(u.id, fx, p.id);
  }
  for (const fx of sup.selfEffects ?? []) s.applyEffect(p.id, longer(fx), p.id);
};

export const attackShapes: Partial<Record<AttackDef['shape'], ShapeFire>> = { arc, cone, buff };
