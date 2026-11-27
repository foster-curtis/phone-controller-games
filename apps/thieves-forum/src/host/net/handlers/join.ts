// `join { name, proto }` (SPEC §6.18, §12.5): the name step and the rejoin handshake. A protocol
// mismatch gets `outdated`; otherwise `joined`, the match places the phone (lobby, waiting or its round
// screen) and a reconnecting phone gets its private state again, so a reconnect heals itself.
import { cleanName, PROTOCOL_VERSION } from '../../../shared/messages';
import { defineHandler } from '../types';

export default defineHandler({
  t: 'join',
  handle(msg, from, ctx) {
    if ((msg.proto ?? PROTOCOL_VERSION) !== PROTOCOL_VERSION) {
      ctx.send({ t: 'outdated', proto: PROTOCOL_VERSION }, from);
      return;
    }
    const name = cleanName(msg.name);
    if (!name) return;
    ctx.send({ t: 'joined', name }, from);
    ctx.match({ type: 'join', id: from, name });
    ctx.resync(from);
  },
});
