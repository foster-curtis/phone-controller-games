// E2E runner (PLATFORM §4). Suites run side by side, each on its own ports (package.json
// `pcg.e2e`); a suite marked `exclusive` (CPU- or timing-sensitive) runs afterwards with nothing
// alongside. Every suite runs to the end even when another fails.
//   node scripts/e2e.mjs --all          every app's whole suite (`pnpm e2e`)
//   node scripts/e2e.mjs <app>...       those apps' whole suites
//   node scripts/e2e.mjs --affected     specs this branch's changes reach (`pnpm e2e:affected`)
//   node scripts/e2e.mjs --retest       failed tests, plus specs reached by changes since the
//                                       app's last run (`pnpm retest`)
//   --base <ref>  diff base for --affected   --files a,b  --affected on exactly these files
//   --dry-run     print the plan only
// Spec selection is coverage-based (scripts/lib/impact.mjs); last-run state lives in
// `.pcg-cache/` (gitignored).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  changedFiles,
  changedSinceSnapshot,
  changesFor,
  resolveBase,
  takeSnapshot,
} from './lib/git.mjs';
import {
  listSpecs,
  loadMap,
  mergeMap,
  parseReport,
  rawDir,
  readRaw,
  reportPath,
  saveMap,
  selectSpecs,
} from './lib/impact.mjs';
import { run, seconds } from './lib/run.mjs';
import { CACHE, ROOT, computeAffected, explain, loadWorkspace } from './lib/workspace.mjs';

const STATE_FILE = join(CACHE, 'e2e-last-run.json');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : undefined;
const filesArg = args.includes('--files') ? args[args.indexOf('--files') + 1] : undefined;
const names = args.filter(
  (a, i) => !a.startsWith('--') && args[i - 1] !== '--base' && args[i - 1] !== '--files',
);
const mode = flag('--retest') ? 'retest' : flag('--affected') ? 'affected' : 'full';

const workspace = loadWorkspace();
const apps = workspace.filter((p) => p.scripts.e2e);
const short = (app) => app.dir.split('/').pop();

// Each app needs its own ports so suites can run side by side.
const problems = [];
const seen = new Map();
for (const app of apps) {
  if (!app.e2e?.relayPort || !app.e2e?.webPort) {
    problems.push(`${app.dir}/package.json: add pcg.e2e { relayPort, webPort }`);
    continue;
  }
  for (const port of [app.e2e.relayPort, app.e2e.webPort]) {
    if (seen.has(port)) problems.push(`port ${port}: both ${seen.get(port)} and ${short(app)}`);
    seen.set(port, short(app));
  }
}
for (const name of names) {
  if (!apps.some((a) => short(a) === name)) problems.push(`unknown app with e2e: ${name}`);
}
if (problems.length) {
  console.error(`e2e: ${problems.join('\n  ')}`);
  process.exit(1);
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { apps: {} };
  }
}
const state = loadState();
const snapshot = takeSnapshot();

/**
 * @typedef {{ app: import('./lib/workspace.mjs').Pkg, full: boolean, targets: string[],
 *   why: string[] }} Plan
 */

/** Specs (or the whole suite) `files` reach in `app`, plus the app's recorded failures. */
function planFor(app, files, affected, extraWhy) {
  const prev = state.apps[short(app)];
  const why = [...extraWhy];
  if (prev?.full) return { app, full: true, targets: [], why: [...why, 'last run did not finish'] };
  const targets = new Set(prev?.failed ?? []);
  if (targets.size) why.push(`${targets.size} test(s) failed last run`);
  if (affected.all) return { app, full: true, targets: [], why: [...why, 'shared config changed'] };
  if (affected.affected.has(app.name)) {
    const pick = selectSpecs({ app, files, workspace, map: loadMap(app), specs: listSpecs(app) });
    if (pick.full) return { app, full: true, targets: [], why: [...why, pick.why] };
    for (const [spec, reason] of pick.specs) {
      targets.add(spec);
      why.push(`${spec}: ${reason}`);
    }
  }
  // A whole spec covers its own `spec:line` failures.
  const list = [...targets].filter(
    (t) => !t.includes(':') || !targets.has(t.slice(0, t.lastIndexOf(':'))),
  );
  return { app, full: false, targets: list.sort(), why };
}

/** @type {Plan[]} */
let plans;
const pool = names.length ? apps.filter((a) => names.includes(short(a))) : apps;
if (mode === 'full') {
  plans = pool.map((app) => ({ app, full: true, targets: [], why: ['whole suite requested'] }));
} else {
  const changes = mode === 'affected' ? changesFor(resolveBase(baseArg), filesArg) : null;
  const branchFiles = changes?.files ?? null;
  if (mode === 'affected') {
    console.log(
      changes
        ? `Changes since ${changes.label}: ${branchFiles.length} file(s)`
        : 'No base commit found: running everything.',
    );
    if (branchFiles)
      console.log(explain(computeAffected(branchFiles, workspace), workspace).join('\n'));
  }
  plans = pool.map((app) => {
    if (mode === 'affected') {
      if (!branchFiles) return { app, full: true, targets: [], why: ['no base commit'] };
      return planFor(app, branchFiles, computeAffected(branchFiles, workspace), []);
    }
    // retest: changes since this app's last run; an app never run falls back to the branch diff.
    const since = changedSinceSnapshot(state.apps[short(app)]?.snapshot);
    if (since)
      return planFor(
        app,
        since,
        computeAffected(since, workspace),
        since.length ? [`${since.length} file(s) changed since its last run`] : [],
      );
    const fallback = resolveBase(baseArg);
    if (!fallback) return { app, full: true, targets: [], why: ['no last run and no base commit'] };
    const files = changedFiles(fallback.sha);
    return planFor(app, files, computeAffected(files, workspace), [
      'no last run: using the branch diff',
    ]);
  });
}

const runnable = plans.filter((p) => p.full || p.targets.length);
console.log('\nE2E plan:');
for (const p of plans) {
  const what = p.full ? 'whole suite' : p.targets.length ? p.targets.join(' ') : 'nothing to run';
  console.log(`  ${short(p.app).padEnd(12)} ${p.app.e2e.exclusive ? '(alone) ' : ''}${what}`);
  for (const w of p.why) console.log(`  ${''.padEnd(12)}   · ${w}`);
}
if (flag('--dry-run')) process.exit(0);
if (runnable.length === 0) {
  console.log('\nNothing to run.');
  process.exit(0);
}

/** Runs one app's selection, then folds its outcome into the impact map and the run state. */
async function runApp(plan, prefixed) {
  const { app } = plan;
  rmSync(rawDir(app), { recursive: true, force: true });
  rmSync(reportPath(app), { force: true });
  mkdirSync(dirname(reportPath(app)), { recursive: true });
  // These override the configs' reporters: list to read, json for the runner. CI adds an HTML
  // report (apps/<app>/playwright-report/) for the failure artifact.
  const reporters = process.env.CI ? 'list,json,html' : 'list,json';
  const { code, ms } = await run(
    'pnpm',
    ['run', 'e2e', `--reporter=${reporters}`, ...plan.targets],
    {
      cwd: join(ROOT, app.dir),
      env: {
        PCG_E2E_IMPACT_DIR: rawDir(app),
        PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath(app),
        PLAYWRIGHT_HTML_OPEN: 'never',
      },
      prefix: prefixed ? `[${short(app)}]` : undefined,
    },
  );

  const appAbs = join(ROOT, app.dir);
  const outcomes = existsSync(reportPath(app))
    ? parseReport(JSON.parse(readFileSync(reportPath(app), 'utf8')), appAbs)
    : [];
  const failed = [...new Set(outcomes.filter((o) => o.ok === false).map((o) => o.key))].sort();
  const passed = new Set(outcomes.filter((o) => o.ok === true).map((o) => o.key));
  // Exit code without a failed test: the run broke (web server, config); rerun all of it next time.
  const broke = code !== 0 && failed.length === 0;

  const specs = listSpecs(app);
  const replace = new Set();
  if (plan.full && !broke) {
    for (const spec of specs) {
      const mine = outcomes.filter((o) => o.spec === spec);
      if (mine.length && mine.every((o) => o.ok === true)) replace.add(spec);
    }
  }
  saveMap(app, mergeMap(loadMap(app), readRaw(app, app.e2e.webPort), { replace, specs }));

  const prev = state.apps[short(app)];
  const keep = plan.full
    ? []
    : (prev?.failed ?? []).filter(
        (k) => !passed.has(k) && !plan.targets.includes(k.slice(0, k.lastIndexOf(':'))),
      );
  state.apps[short(app)] = {
    snapshot,
    full: broke || (Boolean(prev?.full) && !plan.full),
    failed: [...new Set([...keep, ...failed])].sort(),
  };
  return { app, code, ms, failed, broke, ran: outcomes.filter((o) => o.ok !== null).length };
}

const together = runnable.filter((p) => !p.app.e2e.exclusive);
const alone = runnable.filter((p) => p.app.e2e.exclusive);
const results = [];
if (together.length) {
  console.log(
    `\n▶ ${together.map((p) => short(p.app)).join(', ')}${together.length > 1 ? ' (side by side)' : ''}`,
  );
  results.push(...(await Promise.all(together.map((p) => runApp(p, together.length > 1)))));
}
for (const p of alone) {
  console.log(`\n▶ ${short(p.app)} (alone)`);
  results.push(await runApp(p, false));
}

mkdirSync(CACHE, { recursive: true });
writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 1)}\n`);

console.log('\nE2E summary:');
for (const r of results) {
  const status =
    r.code === 0
      ? 'passed'
      : r.broke
        ? 'BROKE (no test failed; check the output)'
        : `FAILED ${r.failed.length}`;
  console.log(
    `  ${short(r.app).padEnd(12)} ${status.padEnd(12)} ${String(r.ran).padStart(4)} test(s)  ${seconds(r.ms)}`,
  );
  for (const k of r.failed) console.log(`  ${''.padEnd(12)}   ✗ ${k}`);
}
const bad = results.some((r) => r.code !== 0);
if (bad)
  console.log(
    '\nAfter a fix, `pnpm retest` reruns the failed tests plus any spec the fix reaches.',
  );
process.exit(bad ? 1 : 0);
