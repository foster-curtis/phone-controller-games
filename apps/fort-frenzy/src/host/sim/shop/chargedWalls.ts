// Charged walls (SPEC §6.2 "Spiked walls", §7.2): an enemy that attacks a wall takes `damage` back
// from it (the TV draws a forked bolt from the post to the attacker on the wall's damage event). A
// shop module (`shop:spiked_walls` on every wall, built ones included). Leaf module: no registry.
import { state } from '../internal';
import type { ModuleDef } from '../types';

export const chargedWalls: ModuleDef = {
  id: 'charged_walls',
  make(p) {
    const damage = typeof p.damage === 'number' ? p.damage : 10;
    return {
      id: 'shop:spiked_walls',
      hooks: {
        onDamageTaken(ctx, self, r) {
          const src = r.source;
          if (src === null || src === self.id || r.kind === 'dot') return;
          if (state(ctx).kinds.get(src) !== 'enemy') return;
          ctx.damage({
            source: self.id,
            target: src,
            amount: damage,
            kind: 'contact',
            tags: ['charged'],
          });
        },
      },
    };
  },
};
