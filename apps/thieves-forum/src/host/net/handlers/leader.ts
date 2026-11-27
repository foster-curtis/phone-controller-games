// `leader { action }` (SPEC §6.16, §6.18, §6.19): the leader phone's Start, How to play, Next, Skip and
// Play again; the match ignores anyone but the leader.
import { defineHandler } from '../types';

export default defineHandler({
  t: 'leader',
  handle(msg, from, ctx) {
    ctx.match({ type: 'leader', id: from, action: msg.action });
  },
});
