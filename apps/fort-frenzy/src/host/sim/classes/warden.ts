// Warden (tank, SPEC §8): the ground slam and the stomp are `arc` attacks that wind up and land as a
// sector in front of him (stomp: a longer arc that stuns). Also the stun effect the stomp applies
// (§6.1: an enemy can't move or attack while stunned; the AI skips it, sim.ts).
import type { AttackDef } from '../../../content/types';
import { msToSteps } from '../../systems/effects';
import { sectorHitsBody } from '../body';
import type { SimState } from '../internal';
import { sectorGeometry } from './hitShape';
import {
  SIM_HZ,
  type DamageKind,
  type EffectApply,
  type EffectDef,
  type EnemyEnt,
  type PlayerEnt,
  type Unit,
} from '../types';

export interface ArcHit {
  attack: AttackDef;
  slot: 'main' | 'super';
  /** Unit direction. */
  dx: number;
  dy: number;
  damage: number;
  kind: DamageKind;
  tags: readonly string[];
  effects: readonly EffectApply[];
}

/**
 * A slam or stomp lands: every enemy in the arc (ground only unless the attack hits Flyers) takes the
 * damage, then the attack's effects (the stomp's stun) and a knockback away from the Warden. The
 * main doesn't knock back a target that was already stunned (RC1). Returns the enemies hit.
 */
export function landArc(s: SimState, p: PlayerEnt, h: ArcHit): EnemyEnt[] {
  const a = h.attack;
  // The same geometry as the TV's aim preview (classes/hitShape.ts).
  const g = sectorGeometry(a, (b, st) => s.attackStat(p, b, st, h.slot));
  const reach = g.range;
  const knock = s.attackStat(p, a.knockback ?? 0, 'knockback', h.slot);
  const v0 = knock * 60 * (1 - s.cat.rules.knockbackDecay);
  // The same sector test as the Commander's slash (FF9, classes/sector.ts).
  const sec = {
    x: p.x,
    y: p.y,
    angle: Math.atan2(h.dy, h.dx),
    half: g.half,
    range: reach,
  };
  // It reaches enemy bodies (C4, body.ts), whose feet may stand up to `reach` south of it.
  const m = s.cat.bodyMax;
  const pad = reach + m.r;
  const ids = s.world.spatial
    .queryBox(p.x - pad, p.y - pad, p.x + pad, p.y + reach + m.reach, s.scratch)
    .slice();
  const hit: EnemyEnt[] = [];
  for (const id of ids) {
    if (s.kinds.get(id) !== 'enemy') continue;
    const e = s.units.get(id) as EnemyEnt;
    if (e.hp <= 0 || (e.flying && !a.hitsFlyers)) continue;
    if (!sectorHitsBody(sec, e.x, e.y, s.cat.body(e.kind))) continue;
    hit.push(e);
  }
  for (const e of hit) {
    // Read before this hit's own effects.
    const held = h.slot === 'main' && stunned(e);
    s.damage({ source: p.id, target: e.id, amount: h.damage, kind: h.kind, tags: [...h.tags] });
    for (const fx of h.effects) s.applyEffect(e.id, fx, p.id);
    if (v0 > 0 && e.hp > 0 && !held) {
      let dx = e.x - p.x;
      let dy = e.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1e-6) {
        dx = h.dx;
        dy = h.dy;
      } else {
        dx /= d;
        dy /= d;
      }
      e.push = { x: (e.push?.x ?? 0) + dx * v0, y: (e.push?.y ?? 0) + dy * v0 };
    }
  }
  return hit;
}

/** Stun (§6.1, §8): no movement and no attacks while it lasts; re-stunning refreshes the timer. */
export const stunEffect: EffectDef = {
  id: 'stun',
  stacking: 'refresh',
  modifier: () => ({ id: 'effect:stun', stats: [{ stat: 'moveSpeed', addPct: -1 }] }),
};

export function stunned(u: Unit): boolean {
  for (const e of u.effects) if (e.def === 'stun') return true;
  return false;
}

/** Whole steps of a wind-up. */
export const windupSteps = (a: AttackDef) => (a.windupMs ? msToSteps(a.windupMs, SIM_HZ) : 0);
