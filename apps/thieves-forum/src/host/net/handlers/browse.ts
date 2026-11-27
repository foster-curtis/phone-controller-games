// `browse` (SPEC §6.6, §6.17, §12.5): the main-button tap. BROWSE opens the stall view (the merchants
// step picks the nearest open stall); SELL and the pawnbroker sheet are TF13's, on the same tap.
import { defineHandler } from '../types';

export default defineHandler({
  t: 'browse',
  handle(_msg, from, ctx) {
    if (ctx.playing() && ctx.character(from)) ctx.command({ k: 'browse', player: from });
  },
});
