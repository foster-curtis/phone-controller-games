// Warden card modules (SPEC §6.1): Aftershock, Giant Slayer and Unshakable. Heavy Slam and Earthshaker
// are plain stat cards (content/balance.ts). A slam or
// stomp's `onAttack` runs when its wind-up lands (players.ts), so these hooks fire on the impact.
import { dist } from '../geometry';
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
          const reach = s.attackStat(pl, s.cat.knight(pl.classId).main.range, 'range', 'main');
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
