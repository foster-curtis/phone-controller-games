// BROWSE on the main button (SPEC §6.6, §6.17): a free character within reach of an open selling
// stall's customer line (the same test the merchants step applies to the `browse` tap). The
// pawnbroker's tap is SELL (TF13's `context/sell.ts`).
import type { StallSlotDef } from '../../../content/types';
import { MERCHANT_TUNING } from '../../sim/merchants/tuning';
import type { Character } from '../../sim/types';
import type { ContextProvider } from '../types';

function toCustomerLine(d: StallSlotDef, c: Character): number {
  const dx = Math.max(d.customer.x0 - c.x, 0, c.x - d.customer.x1);
  return Math.hypot(dx, c.y - d.customer.y);
}

const browse: ContextProvider = {
  action: 'browse',
  available({ world, character, content }) {
    if (world.phase !== 'play' || character.activity.k !== 'free') return false;
    return world.stalls.some(
      (s) =>
        s.open &&
        content.shops[s.shop].sells &&
        toCustomerLine(content.layout.stalls[s.id]!, character) <= MERCHANT_TUNING.browseReach,
    );
  },
};

export default browse;
