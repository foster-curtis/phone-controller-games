// `pnpm check:affected`: the `pnpm check` gate over only what this branch's changes affect
// (PLATFORM §4). Changed files come from git against the merge-base with main (`--base <ref>`
// overrides; CI passes the PR's base or the push's `before`). Shared config outside any package
// runs the full `pnpm check`. Unit tests run per package through `vitest related`
// (scripts/lib/unit.mjs).
//   --base <ref>   diff against the merge-base with <ref>
//   --files a,b    treat exactly these repo-relative files as changed
//   --all          run the full gate regardless
//   --only <step>  run one step: typecheck, lint, format, test, build, bundle, routes (CI runs
//                  each as its own Actions step; `pnpm retest` uses `--only test`). With
//                  everything affected, the step runs its full root script (`pnpm typecheck`, …).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { changesFor, resolveBase } from './lib/git.mjs';
import { run, seconds } from './lib/run.mjs';
import { diskReadingTests, selectUnit } from './lib/unit.mjs';
import { ROOT, computeAffected, explain, loadWorkspace } from './lib/workspace.mjs';

const STEPS = ['typecheck', 'lint', 'format', 'test', 'build', 'bundle', 'routes'];
/** The root script each step runs when everything is affected (together they are `pnpm check`). */
const FULL_SCRIPT = {
  typecheck: 'typecheck',
  lint: 'lint',
  format: 'format:check',
  test: 'test',
  build: 'build',
  bundle: 'check:bundle',
  routes: 'check:routes',
};

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const only = opt('--only');
if (only !== undefined && !STEPS.includes(only)) {
  console.error(`check:affected: --only takes one of ${STEPS.join(', ')}`);
  process.exit(2);
}

const workspace = loadWorkspace();
const base = resolveBase(opt('--base'));
const changes = changesFor(base, opt('--files'));
const files = changes?.files ?? [];
const result = changes ? computeAffected(files, workspace) : null;
const all = args.includes('--all') || !result || result.all;

if (args.includes('--all')) console.log('--all: running everything.');
else if (!changes) console.log('No base commit found: running everything.');
else {
  console.log(`Changes since ${changes.label}: ${files.length} file(s)`);
  // Every CI step would repeat it; the plan/affected step prints it once.
  if (!only) console.log(explain(result, workspace).join('\n'));
}

const pkgs = all ? workspace : workspace.filter((p) => result.affected.has(p.name));
const withScript = (script) => pkgs.filter((p) => p.scripts[script]);
const filters = (list) => list.flatMap((p) => ['--filter', p.name]);
const games = pkgs.filter((p) => p.hasPlay).map((p) => p.dir.split('/').pop());
const dirs = pkgs.map((p) => p.dir);
const nothing = (what) => async () => {
  console.log(`Nothing to ${what}: no affected package needs it.`);
  return 0;
};

async function unitTests() {
  const jobs = [];
  for (const pkg of withScript('test')) {
    const pick = selectUnit({ pkg, files, workspace, diskTests: diskReadingTests(pkg) });
    if (pick.kind === 'skip') continue;
    const prefix = `[${pkg.name.replace('@pcg/', '')}]`;
    const cwd = join(ROOT, pkg.dir);
    if (pick.kind === 'full') {
      console.log(`${prefix} whole suite: ${pick.why}`);
      jobs.push(run('pnpm', ['run', 'test'], { cwd, prefix }));
    } else {
      console.log(`${prefix} vitest related: ${pick.files.length} file(s)`);
      const vitest = join(
        dirname(createRequire(join(cwd, 'package.json')).resolve('vitest/package.json')),
        'vitest.mjs',
      );
      const abs = pick.files.map((f) => join(ROOT, f));
      jobs.push(
        run(process.execPath, [vitest, 'related', '--run', '--passWithNoTests', ...abs], {
          cwd,
          prefix,
        }),
      );
    }
  }
  if (jobs.length === 0) console.log('No unit tests affected.');
  const results = await Promise.all(jobs);
  return results.some((r) => r.code !== 0) ? 1 : 0;
}

/** The affected-only version of each step. */
function affectedStep(step) {
  switch (step) {
    case 'typecheck': {
      const list = withScript('typecheck');
      if (!list.length) return nothing('typecheck');
      return async () => (await run('pnpm', ['-r', ...filters(list), 'run', 'typecheck'])).code;
    }
    case 'lint':
      if (!dirs.length) return nothing('lint');
      return async () => (await run('pnpm', ['exec', 'eslint', ...dirs])).code;
    case 'format': {
      const toFormat = [...dirs, ...result.rootDocs.filter((f) => existsSync(join(ROOT, f)))];
      if (!toFormat.length) return nothing('format-check');
      return async () =>
        (await run('pnpm', ['exec', 'prettier', '--check', '--ignore-unknown', ...toFormat])).code;
    }
    case 'test':
      return unitTests;
    case 'build': {
      const list = withScript('build');
      if (!list.length) return nothing('build');
      return async () => (await run('pnpm', ['-r', ...filters(list), 'run', 'build'])).code;
    }
    case 'bundle':
      if (!games.length) return nothing('bundle-check');
      return async () => (await run(process.execPath, ['scripts/check-bundle.mjs', ...games])).code;
    case 'routes':
      if (!games.length) return nothing('route-check');
      return async () => (await run(process.execPath, ['scripts/check-routes.mjs', ...games])).code;
  }
  throw new Error(step);
}

const fullStep = (step) => async () => (await run('pnpm', [FULL_SCRIPT[step]])).code;

/** @type {[string, () => Promise<number>][]} */
let steps;
if (only) {
  steps = [[only, all ? fullStep(only) : affectedStep(only)]];
} else if (all) {
  steps = [['pnpm check', async () => (await run('pnpm', ['check'])).code]];
} else {
  steps = STEPS.map((step) => [step, affectedStep(step)]);
}
// CI checks notes in its own PR step; on main, merged version commits have used them up (PLATFORM §5).
if (!only && !process.env.CI && base && !opt('--files')) {
  steps.push([
    'changeset',
    async () => (await run('pnpm', ['exec', 'changeset', 'status', `--since=${base.sha}`])).code,
  ]);
}

for (const [name, step] of steps) {
  console.log(`\n▶ ${name}`);
  const started = Date.now();
  const code = await step();
  if (code !== 0) {
    console.error(`\n✗ ${name} failed (${seconds(Date.now() - started)})`);
    process.exit(code);
  }
}
console.log(`\n✓ check:affected${only ? ` --only ${only}` : ''} passed`);
