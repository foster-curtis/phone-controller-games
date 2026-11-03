// Warden (tank, SPEC §8): the ground slam and the stomp are `arc` attacks that wind up and land as a
// sector in front of him (stomp: a longer arc that stuns); Mason repairs walls near him, combat only
// (§5, §8, §15.3 step 7). Also the stun effect the stomp applies (§6.1: an enemy can't move or attack
// while stunned; the AI skips it, sim.ts).
import type { AttackDef } from '../../../content/types';
import { msToSteps } from '../../systems/effects';
import { state, type SimState } from '../internal';
import { inSector } from './sector';
import {
  SIM_HZ,
  type DamageKind,
  type EffectApply,
  type EffectDef,
  type EnemyEnt,
  type Modifier,
  type ModuleDef,
  type PlayerEnt,
  type Unit,
} from '../types';

const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);

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
 * damage, then the attack's effects (the stomp's stun) and a knockback away from the Warden.
 * Returns the enemies hit.
 */
export function landArc(s: SimState, p: PlayerEnt, h: ArcHit): EnemyEnt[] {
  const a = h.attack;
  const reach = s.attackStat(p, a.range, 'range', h.slot);
  const width = s.attackStat(p, a.arcDeg ?? 90, 'arcDeg', h.slot);
  const knock = s.attackStat(p, a.knockback ?? 0, 'knockback', h.slot);
  const v0 = knock * 60 * (1 - s.cat.rules.knockbackDecay);
  // The same sector test as the Commander's slash (FF9, classes/sector.ts).
  const sec = {
    x: p.x,
    y: p.y,
    angle: Math.atan2(h.dy, h.dx),
    half: (width * Math.PI) / 360,
    range: reach,
  };
  const ids = s.world.spatial.query(p.x, p.y, reach + 1, s.scratch).slice();
  const hit: EnemyEnt[] = [];
  for (const id of ids) {
    if (s.kinds.get(id) !== 'enemy') continue;
    const e = s.units.get(id) as EnemyEnt;
    if (e.hp <= 0 || (e.flying && !a.hitsFlyers)) continue;
    if (!inSector(sec, e.x, e.y, e.r)) continue;
    hit.push(e);
  }
  for (const e of hit) {
    s.damage({ source: p.id, target: e.id, amount: h.damage, kind: h.kind, tags: [...h.tags] });
    for (const fx of h.effects) s.applyEffect(e.id, fx, p.id);
    if (v0 > 0 && e.hp > 0) {
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

/**
 * Mason (§8): walls within `radius` tiles of the Warden repair `hpPerSec` each, in combat only (off in
 * the build phase, §5) and only while he is up. Master Mason (FF12) raises the `repairRate` and
 * `auraRadius` stats. Repairs aren't heals: no events, no healing stats (render shows the sparks).
 */
export const mason: ModuleDef = {
  id: 'mason',
  make(params) {
    const radius = num(params.radius, 2.5);
    const perSec = num(params.hpPerSec, 10);
    const m: Modifier = {
      id: 'passive:mason',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const w = s.world;
          const p = self as PlayerEnt;
          if (w.phase !== 'combat' || p.respawnAt !== null || !p.connected || p.hp <= 0) return;
          const r = s.attackStat(p, radius, 'auraRadius', 'passive');
          const perStep = s.attackStat(p, perSec, 'repairRate', 'passive') / SIM_HZ;
          for (const st of w.structures) {
            if (st.kind !== 'wall' || st.hp <= 0 || st.hp >= st.maxHp) continue;
            const dx = st.x - p.x;
            const dy = st.y - p.y;
            if (dx * dx + dy * dy > r * r) continue;
            st.hp = Math.min(st.maxHp, st.hp + perStep);
          }
        },
      },
    };
    return m;
  },
};

/** Whole steps of a wind-up. */
export const windupSteps = (a: AttackDef) => (a.windupMs ? msToSteps(a.windupMs, SIM_HZ) : 0);
