// Warden card modules (SPEC §6.1): Aftershock, Giant Slayer, Bodyguard, Unshakable and the Fault Line
// combo. Heavy Slam, Earthshaker and Master Mason are plain stat cards (content/balance.ts). A slam or
// stomp's `onAttack` runs when its wind-up lands (players.ts), so these hooks fire on the impact.
import { circleTouchesTile, dist } from '../geometry';
import { state } from '../internal';
import type { Modifier, ModuleDef, PlayerEnt } from '../types';
import { num, stacksOf, vsEnemies } from './common';

interface Zone {
  x: number;
  y: number;
  until: number;
}

/** The slam leaves a slowing zone `reachPct` of its reach in front of the Warden for `zoneMs`. */
export const aftershock: ModuleDef = {
  id: 'aftershock',
  make(p) {
    const radius = num(p, 'radius');
    const slow = Math.min(num(p, 'maxSlow'), num(p, 'slow') * stacksOf(p));
    const slowMs = num(p, 'slowMs');
    const zoneMs = num(p, 'zoneMs');
    const reachPct = num(p, 'reachPct');
    // Zones live on the modifier (not a closure) so the state hash sees them.
    const m: Modifier & { zones: Zone[] } = {
      id: 'card:aftershock',
      zones: [],
      hooks: {
        onAttack(ctx, self, atk) {
          if (atk.slot !== 'main') return;
          const s = state(ctx);
          const pl = self as PlayerEnt;
          const reach = s.attackStat(pl, s.cat.character(pl.classId).main.range, 'range', 'main');
          m.zones.push({
            x: pl.x + atk.aim.x * reach * reachPct,
            y: pl.y + atk.aim.y * reach * reachPct,
            until: s.tick() + s.cat.steps(zoneMs),
          });
        },
        onTick(ctx, self) {
          if (m.zones.length === 0) return;
          const s = state(ctx);
          const t = s.tick();
          m.zones = m.zones.filter((z) => z.until > t && s.world.phase === 'combat');
          for (const z of m.zones) {
            for (const e of s.world.enemies) {
              if (e.hp <= 0 || e.flying || dist(z.x, z.y, e.x, e.y) - e.r > radius) continue;
              ctx.applyEffect(
                e.id,
                { effect: 'slow', strength: slow, durationMs: slowMs },
                self.id,
              );
            }
          }
        },
      },
    };
    return m;
  },
};

export const giantSlayer = vsEnemies('giant_slayer', ['brute', 'colossus']);

/** Allies (other players) within `radius` take `reduction` × stacks less damage (an aura, capped). */
export const bodyguard: ModuleDef = {
  id: 'bodyguard',
  make(p) {
    const radius = num(p, 'radius');
    const strength = num(p, 'reduction') * stacksOf(p);
    const auraMs = num(p, 'auraMs');
    return {
      id: 'card:bodyguard',
      hooks: {
        onTick(ctx, self) {
          const s = state(ctx);
          const me = self as PlayerEnt;
          if (!s.targetable(me)) return;
          for (const q of s.world.players) {
            if (q === me || !s.targetable(q) || dist(me.x, me.y, q.x, q.y) > radius) continue;
            ctx.applyEffect(
              q.id,
              { effect: 'aura_bodyguard', strength, durationMs: auraMs },
              me.id,
            );
          }
        },
      },
    };
  },
};

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
 * The stomp also shocks every wall on the map: every enemy touching a wall takes the stomp's damage
 * once and is slowed; the TV flashes every wall (`faultLine` event).
 */
export const faultLine: ModuleDef = {
  id: 'fault_line',
  make(p) {
    const slow = num(p, 'slow');
    const slowMs = num(p, 'slowMs');
    const touch = num(p, 'touch');
    return {
      id: 'card:fault_line',
      hooks: {
        onAttack(ctx, self, atk) {
          if (atk.slot !== 'super') return;
          const s = state(ctx);
          const pl = self as PlayerEnt;
          const walls = s.world.structures.filter((st) => st.kind === 'wall' && st.hp > 0);
          if (walls.length === 0) return;
          const def = s.cat.character(pl.classId).super;
          const damage = s.attackStat(pl, def.damage, 'damage', 'super');
          for (const e of s.world.enemies.slice()) {
            if (e.hp <= 0 || e.flying) continue;
            const on = walls.some((w) =>
              circleTouchesTile(e.x, e.y, e.r + touch, w.tile[0], w.tile[1]),
            );
            if (!on) continue;
            ctx.damage({
              source: pl.id,
              target: e.id,
              amount: damage,
              kind: 'area',
              tags: ['super', 'fault_line'],
            });
            ctx.applyEffect(e.id, { effect: 'slow', strength: slow, durationMs: slowMs }, pl.id);
          }
          ctx.emit({ e: 'faultLine', slot: pl.slot });
        },
      },
    };
  },
};
