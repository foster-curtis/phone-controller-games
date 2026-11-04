// Engineer card modules (SPEC §6.1): Fire Arrows, Piercing Shot, Skyhunter, Volley and the Wildfire
// combo. Quick Draw, Blast Radius and Deadeye are plain stat cards (content/cards.ts). Wildfire's
// spread lives on the burn effect (cards/effects.ts); its module marks the card on the Engineer.
import type { Modifier, ModuleDef } from '../types';
import { num, stacksOf, vsEnemies } from './common';

/** Main shots apply burn: `dps` per tick (×stacks) for `durationMs`. */
export const fireArrows: ModuleDef = {
  id: 'fire_arrows',
  make(p) {
    const strength = num(p, 'tick', 3) * stacksOf(p);
    const durationMs = num(p, 'durationMs', 3000);
    return {
      id: 'card:fire_arrows',
      hooks: {
        onAttack(_ctx, _self, atk) {
          if (atk.slot === 'main') atk.effects.push({ effect: 'burn', strength, durationMs });
        },
      },
    };
  },
};

/** Main shots pass through the first enemy (one more per stack). */
export const piercingShot: ModuleDef = {
  id: 'piercing_shot',
  make(p) {
    const pierce = num(p, 'pierce', 1) * stacksOf(p);
    return {
      id: 'card:piercing_shot',
      hooks: {
        onAttack(_ctx, _self, atk) {
          if (atk.slot === 'main') atk.pierce += pierce;
        },
      },
    };
  },
};

export const skyhunter = vsEnemies('skyhunter', ['flyer']);

/** Every `every`th main shot (one sooner per extra stack, at least every 2nd) fires `arrows` in a spread. */
export const volley: ModuleDef = {
  id: 'volley',
  make(p) {
    const every = Math.max(2, num(p, 'every', 4) - (stacksOf(p) - 1));
    const arrows = num(p, 'arrows', 3);
    const spreadDeg = num(p, 'spreadDeg', 14);
    // Kept on the modifier (not a closure) so the state hash sees it.
    const m: Modifier & { shots: number } = {
      id: 'card:volley',
      shots: 0,
      hooks: {
        onAttack(_ctx, _self, atk) {
          if (atk.slot !== 'main') return;
          m.shots++;
          if (m.shots % every !== 0) return;
          atk.count = Math.max(atk.count, arrows);
          atk.spreadDeg = Math.max(atk.spreadDeg, spreadDeg);
        },
      },
    };
    return m;
  },
};

/** Marks Wildfire: burning enemies that die ignite their neighbors (the burn effect checks the card). */
export const wildfire: ModuleDef = {
  id: 'wildfire',
  make: () => ({ id: 'card:wildfire' }),
};
