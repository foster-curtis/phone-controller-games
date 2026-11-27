// `ready { ready }` (SPEC §6.18): the lobby Ready toggle; Start needs enough ready players (TF10).
import { defineHandler } from '../types';

export default defineHandler({
  t: 'ready',
  handle(msg, from, ctx) {
    ctx.match({ type: 'ready', id: from, ready: msg.ready });
  },
});
