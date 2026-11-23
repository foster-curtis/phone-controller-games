// Warden card modules (SPEC §6.1): Aftershock, Giant Slayer and Unshakable. Heavy Slam and Earthshaker
// are plain stat cards (content/balance.ts). A slam or jump slam's `onAttack` runs when its wind-up
// lands (players.ts), so these hooks fire on the impact.
import type { ModuleDef } from '../types';
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
