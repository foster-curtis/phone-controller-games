// `grab { stall, slot }` (SPEC §6.7, §11 #26, §12.3): arms GRAB on a stall-view tile; the `hold` bit
// times it on the host (the merchants step validates the tile, the hold machine times it).
import { defineHandler } from '../types';

export default defineHandler({
  t: 'grab',
  handle(msg, from, ctx) {
    if (!ctx.playing() || !ctx.character(from)) return;
    ctx.command({ k: 'grab', player: from, stall: msg.stall, slot: msg.slot });
  },
});
