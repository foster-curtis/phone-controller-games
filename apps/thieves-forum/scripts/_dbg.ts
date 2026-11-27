import { quietSim, stepUntil } from '../src/host/sim/__tests__/helpers';
import { npc } from '../src/host/sim/npc';
const seed = Number(process.argv[2] ?? 4);
const sim = quietSim(seed);
const c = npc.spawn(sim.context(), 'lowerLeft');
c.npc.wishList = ['jewelry'];
c.npc.personality.distractibility = 0;
c.npc.personality.browseMs = 2000;
console.log('doubt', c.npc.nav!.doubt);
stepUntil(sim, () => c.npc.state === 'wandering' && c.npc.nav!.path.length > 0, 600);
let last = '';
for (let t = 0; t < 2400; t++) {
  sim.step();
  const n = c.npc.nav!;
  const s = `${c.npc.state} ${n.leg} ${n.moment} ${n.path.length}`;
  if (s !== last) {
    console.log(t, s, c.x.toFixed(1), c.y.toFixed(1));
    last = s;
  }
  if (c.npc.state === 'browsing') break;
}
