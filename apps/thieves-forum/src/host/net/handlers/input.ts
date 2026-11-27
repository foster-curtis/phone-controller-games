// `input { x, y, bits }` (SPEC §3, §12.5): stick and button bits, stamped on receipt; the input store
// applies staleness when the sim samples it each step.
import { defineHandler } from '../types';

export default defineHandler({
  t: 'input',
  handle(msg, from, ctx) {
    ctx.inputs.set(from, msg.x, msg.y, msg.bits, ctx.now());
  },
});
