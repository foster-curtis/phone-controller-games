// `color { color }` (SPEC §6.18): a lobby color pick; the match refuses a taken one.
import { defineHandler } from '../types';

export default defineHandler({
  t: 'color',
  handle(msg, from, ctx) {
    ctx.match({ type: 'color', id: from, color: msg.color });
  },
});
