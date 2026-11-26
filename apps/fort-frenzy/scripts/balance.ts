// The balance report (SPEC §2, §15.9; a tool, never a gate): each knight alone against the harness
// wave (`content.harness`), autopilot with its build policy, no cards, meter full, solo scaling.
// Prints each knight's median, min and max clear time and its median's distance from the mean of all
// knights, flagging ±20% (!) and ±25% (!!). Always exits 0 unless the harness itself throws.
//
//   pnpm --filter @pcg/fort-frenzy balance [--quick]     (--quick: the first seed only)
import { content } from '../src/content';
import { runHarness } from '../src/host/sim/balance/harness';

const quick = process.argv.includes('--quick');
const seeds = content.harness?.seeds ?? [];
const t0 = process.hrtime.bigint();
const report = runHarness(content, quick ? seeds.slice(0, 1) : seeds);
const s = (v: number | null) => (v === null ? '   —  ' : `${v.toFixed(1).padStart(5)}s`);
const pct = (v: number | null) =>
  v === null ? '   —  ' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`.padStart(6);
const [b20, b25] = report.bands.map((b) => `±${Math.round(b * 100)}%`);

console.log(
  `balance harness: ${report.seeds.length} seed(s) [${report.seeds.join(', ')}], mean of medians ${s(report.mean)}`,
);
console.log('knight      median    min     max    vs mean  cleared  builds');
for (const r of report.rows) {
  const cleared = `${r.times.filter((t) => t !== null).length}/${r.times.length}`;
  const flag = r.flag === 2 ? `!! outside ${b25}` : r.flag === 1 ? `!  outside ${b20}` : '';
  console.log(
    `${r.knight.padEnd(10)} ${s(r.median)} ${s(r.min)} ${s(r.max)}  ${pct(r.offMean)}   ${cleared.padStart(5)}   ${r.builds ? 'yes' : 'no '}  ${flag}`,
  );
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`(${(ms / 1000).toFixed(1)} s; a report, not a gate)`);
