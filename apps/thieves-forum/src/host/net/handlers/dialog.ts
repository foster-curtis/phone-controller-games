// `dialog { pick }` (SPEC §6.6): Just browsing (suspicion), Ask about… (he fetches it, his back to
// the counter) or Leave. Buy… is the phone's list; the purchase is `buy` (TF13).
import type { SimCommand } from '../../sim/types';
import { defineHandler } from '../types';

export default defineHandler({
  t: 'dialog',
  handle(msg, from, ctx) {
    if (!ctx.playing() || !ctx.character(from)) return;
    const cmd: SimCommand =
      msg.pick === 'ask'
        ? { k: 'dialog', player: from, pick: 'ask', slot: msg.slot }
        : { k: 'dialog', player: from, pick: msg.pick };
    ctx.command(cmd);
  },
});
