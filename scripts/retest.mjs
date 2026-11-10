// `pnpm retest`: after a fix, rerun what's needed rather than whole suites (PLATFORM §4). Unit
// tests: the branch's affected selection again (cheap). E2E: each app's failed tests plus the
// specs that changes since its last run reach. Both run even if the first fails.
import { run } from './lib/run.mjs';

const passthrough = process.argv.slice(2);
const unit = await run(process.execPath, [
  'scripts/check-affected.mjs',
  '--only',
  'test',
  ...passthrough,
]);
const e2e = await run(process.execPath, ['scripts/e2e.mjs', '--retest', ...passthrough]);
if (unit.code !== 0) console.error('\n✗ unit tests failed (output above)');
process.exit(unit.code || e2e.code);
