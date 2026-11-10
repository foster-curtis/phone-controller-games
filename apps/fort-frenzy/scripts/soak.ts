// The full soak (SPEC §15.9, FF15): the content's whole run headless (waves 1–15), autopilot and
// invincible, the Citadel held, for two seeds × (2 players in every class pair, 6 players in every
// class rotation), each run twice. Fails on an exception, a run that doesn't end in victory at wave
// 15, or a rerun whose state hashes differ. Prints one fingerprint per run, so perf work can show the
// hashes didn't move.
//
//   pnpm --filter @pcg/fort-frenzy soak [--quick]     (--quick: first seed, first mix of each count)
import { soakMixes, soakRun, type SoakResult } from '../src/host/sim/soak';

const SEEDS = [1, 2];
const COUNTS = [2, 6];

/** FNV-1a over the run's hashes: one number to compare across builds. */
function fingerprint(r: SoakResult): string {
  let h = 0x811c9dc5;
  for (const x of r.hashes) {
    for (let k = 0; k < 4; k++) {
      h ^= (x >>> (k * 8)) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

const quick = process.argv.includes('--quick');
const t0 = process.hrtime.bigint();
let failed = 0;
let runs = 0;
for (const seed of quick ? SEEDS.slice(0, 1) : SEEDS) {
  for (const players of COUNTS) {
    const mixes = soakMixes(players);
    for (const classes of quick ? mixes.slice(0, 1) : mixes) {
      const t1 = process.hrtime.bigint();
      let a: SoakResult;
      let b: SoakResult;
      try {
        a = soakRun({ seed, classes });
        b = soakRun({ seed, classes });
      } catch (err) {
        failed++;
        console.log(`soak seed ${seed} ${classes.join('/')}: threw`, err);
        continue;
      }
      runs++;
      const s = Number(process.hrtime.bigint() - t1) / 1e9;
      const same =
        a.hashes.length === b.hashes.length && a.hashes.every((x, i) => x === b.hashes[i]);
      const ok = same && a.phase === 'summary' && a.result === 'victory' && a.wave === 15;
      if (!ok) failed++;
      console.log(
        `soak seed ${seed} ${classes.join('/').padEnd(52)} ${a.steps} steps, wave ${a.wave} ` +
          `${a.result}, peak ${a.maxEnemies} enemies, ${a.cardsPicked} cards, ${a.purchases} buys, ` +
          `${a.hashes.length} hashes ${fingerprint(a)} ` +
          `${same ? 'rerun identical' : 'RERUN DIFFERS'} (${s.toFixed(1)} s for both)` +
          (ok ? '' : '  FAIL'),
      );
    }
  }
}
const total = Number(process.hrtime.bigint() - t0) / 1e9;
console.log(`soak: ${runs} runs ×2, ${failed} failed, ${total.toFixed(1)} s`);
if (failed > 0) process.exit(1);
