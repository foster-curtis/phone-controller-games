// Warden card modules (SPEC §6.1): Aftershock, Giant Slayer, Unshakable, Challenger (his passive card)
// and Fault Line (the combo). Heavy Slam, Earthshaker, Wide Field and Reinforced Generator are plain
// stat cards (content/balance.ts). A slam or jump slam's `onAttack` runs when its wind-up lands
// (players.ts), so these hooks fire on the impact.
import { state } from '../internal';
import type { Modifier, ModuleDef, PlayerEnt } from '../types';
import { num, stacksOf, vsEnemies } from './common';

/** Enemies the jump slam hits are slowed for `slowMs` (RC1: the super, not the main). */
export const aftershock: ModuleDef = {
  id: 'aftershock',
  make(p) {
    const strength = Math.min(num(p, 'maxSlow'), num(p, 'slow') * stacksOf(p));
    const durationMs = num(p, 'slowMs');
    return {
      id: 'card:aftershock',
      hooks: {
        onAttack(_ctx, _self, atk) {
          if (atk.slot === 'super') atk.effects.push({ effect: 'slow', strength, durationMs });
        },
      },
    };
  },
};

export const giantSlayer = vsEnemies('giant_slayer', ['brute', 'colossus']);

/** Immune to slows and knockback. */
export const unshakable: ModuleDef = {
  id: 'unshakable',
  make: () => ({
    id: 'card:unshakable',
    hooks: {
      beforeEffect: (_ctx, _self, e) => e.effect !== 'slow',
      onTick(_ctx, self) {
        self.push = null;
      },
    },
  }),
};

/**
 * Challenger, his passive card: in combat, while he can be targeted, he carries `taunt` (re-applied
 * each step for `auraMs`), and aggro-leash enemies pick a taunting knight in their aggro radius
 * before anything nearer (ai/path.ts `leash`).
 */
export const challenger: ModuleDef = {
  id: 'challenger',
  make(p) {
    const durationMs = num(p, 'auraMs');
    return {
      id: 'card:challenger',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          if (s.world.phase !== 'combat' || !s.targetable(self as PlayerEnt)) return;
          ctx.applyEffect(self.id, { effect: 'taunt', strength: 1, durationMs }, self.id);
        },
      },
    };
  },
};

/** One fissure: a segment on the ground, until a tick. */
export interface Fissure {
  x: number;
  y: number;
  x2: number;
  y2: number;
  until: number;
}

/** Distance from (px, py) to the segment (ax, ay)–(bx, by). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/**
 * Fault Line (Aftershock + Earthshaker): the jump slam leaves a fissure from his feet along its aim,
 * `lengthPct` of the jump slam's reach and `width` wide, for `fissureMs` (combat only). Ground
 * enemies whose feet touch it are slowed by `slow`, lasting `lingerMs` after they step off.
 */
export const faultLine: ModuleDef = {
  id: 'fault_line',
  make(p) {
    const slow = num(p, 'slow');
    const lingerMs = num(p, 'lingerMs');
    const fissureMs = num(p, 'fissureMs');
    const half = num(p, 'width') / 2;
    const lengthPct = num(p, 'lengthPct');
    // Fissures live on the modifier (not a closure), so the state hash sees them.
    const m: Modifier & { fissures: Fissure[] } = {
      id: 'card:fault_line',
      fissures: [],
      hooks: {
        onAttack(ctx, self, atk) {
          if (atk.slot !== 'super') return;
          const s = state(ctx);
          const pl = self as PlayerEnt;
          const reach =
            s.attackStat(pl, s.cat.knight(pl.classId).super.range, 'range', 'super') * lengthPct;
          const len = Math.hypot(atk.aim.x, atk.aim.y);
          const ax = len > 0 ? atk.aim.x / len : Math.cos(pl.facing);
          const ay = len > 0 ? atk.aim.y / len : Math.sin(pl.facing);
          m.fissures.push({
            x: pl.x,
            y: pl.y,
            x2: pl.x + ax * reach,
            y2: pl.y + ay * reach,
            until: s.tick() + s.cat.steps(fissureMs),
          });
        },
        onTick(ctx, self) {
          if (m.fissures.length === 0) return;
          const s = state(ctx);
          const t = s.tick();
          m.fissures = m.fissures.filter((f) => f.until > t && s.world.phase === 'combat');
          for (const f of m.fissures)
            for (const e of s.world.enemies) {
              if (e.hp <= 0 || e.flying) continue;
              if (segDist(e.x, e.y, f.x, f.y, f.x2, f.y2) - e.r > half) continue;
              ctx.applyEffect(
                e.id,
                { effect: 'slow', strength: slow, durationMs: lingerMs },
                self.id,
              );
            }
        },
      },
    };
    return m;
  },
};

/** The fissures a Fault Line holder has open now (the TV draws them; tests read them). */
export function fissuresOf(p: { mods: readonly Modifier[] }): readonly Fissure[] {
  const m = p.mods.find((x) => x.id === 'card:fault_line') as
    (Modifier & { fissures?: Fissure[] }) | undefined;
  return m?.fissures ?? [];
}
