// The economy report (SPEC §6.2; RD11, RD11-fix-1, a tool, never a gate): one autopilot run per team
// size with a team that saves, printing the team's coins at each build phase and what it bought.
//
//   pnpm --filter @pcg/fort-frenzy exec tsx scripts/economy.ts [seed]
import { economyLines, economyRun, ECONOMY_TEAMS } from '../src/host/sim/economy';

const seed = Number(process.argv[2] ?? 1) || 1;
for (const classes of Object.values(ECONOMY_TEAMS)) {
  const r = economyRun({ seed, classes });
  console.log(`${classes.length}p (${classes.join('+')}): ${r.purchases} purchases, ${r.result}`);
  for (const line of economyLines(r)) console.log(`  ${line}`);
}
