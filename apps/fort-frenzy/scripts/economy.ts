// The economy report (SPEC §6.2; RD11, a tool, never a gate): one autopilot run per team size with a
// team that saves, printing the team's coins at each build phase and what it bought.
//
//   pnpm --filter @pcg/fort-frenzy exec tsx scripts/economy.ts [seed]
import { economyLines, economyRun } from '../src/host/sim/economy';
import type { ClassId } from '../src/shared/ids';

const seed = Number(process.argv[2] ?? 1) || 1;
const teams: ClassId[][] = [
  ['warden'],
  ['ranger', 'artificer'],
  ['warden', 'ranger', 'artificer', 'commander'],
];
for (const classes of teams) {
  const r = economyRun({ seed, classes });
  console.log(`${classes.length}p (${classes.join('+')}): ${r.purchases} purchases, ${r.result}`);
  for (const line of economyLines(r)) console.log(`  ${line}`);
}
