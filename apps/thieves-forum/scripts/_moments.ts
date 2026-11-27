import { createSim } from '../src/host/sim/world';
const ids = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
const sim = createSim({
  seed: 1,
  round: 1,
  players: ids.map((id) => ({ id, side: { kind: 'player' as const, id } })),
  openStalls: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  guards: 1,
});
const last = new Map<number, string>();
const cnt: Record<string, number> = {};
let walkTicks = 0;
let ticks = 0;
for (let t = 0; t < 60 * 274; t++) {
  sim.step();
  for (const c of sim.world.characters) {
    if (c.control.k !== 'npc') continue;
    ticks++;
    const nav = c.npc.nav!;
    if (
      c.npc.state === 'wandering' &&
      (nav.leg === 'stall' || nav.leg === 'roam') &&
      Math.hypot(c.vx, c.vy) > 0.7
    )
      walkTicks++;
    const m = nav.moment;
    if (last.get(c.id) !== m) {
      cnt[m] = (cnt[m] ?? 0) + 1;
      last.set(c.id, m);
    }
  }
}
const wm = walkTicks / 3600;
const tm = ticks / 3600;
console.log({
  walkMin: wm.toFixed(1),
  npcMin: tm.toFixed(1),
  perWalkMin: Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, +(v / wm).toFixed(2)])),
});
