// `pnpm affected`: what this branch's changes affect and why, without running anything
// (PLATFORM §4). Prints the packages, each one's unit test selection, then the e2e plan.
//   --base <ref>  diff against the merge-base with <ref>      --all  treat everything as affected
//   --files a,b   preview: treat exactly these repo-relative files as changed
//   --json        machine-readable: packages, plus `e2eApps` (affected apps with an e2e script,
//                 by folder name) for CI's e2e matrix
import { changesFor, resolveBase } from './lib/git.mjs';
import { run } from './lib/run.mjs';
import { diskReadingTests, selectUnit } from './lib/unit.mjs';
import { computeAffected, explain, loadWorkspace } from './lib/workspace.mjs';

const args = process.argv.slice(2);
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : undefined;
const workspace = loadWorkspace();
const filesArg = args.includes('--files') ? args[args.indexOf('--files') + 1] : undefined;
const base = resolveBase(baseArg);
const changes = changesFor(base, filesArg);
const files = changes?.files ?? [];
const result = changes ? computeAffected(files, workspace) : null;
const all = args.includes('--all') || !result || result.all;

if (args.includes('--json')) {
  const packages = all ? workspace.map((p) => p.name) : [...result.affected.keys()];
  const e2eApps = workspace
    .filter((p) => p.scripts.e2e && packages.includes(p.name))
    .map((p) => p.dir.split('/').pop());
  console.log(JSON.stringify({ base: base?.sha ?? null, all, files, packages, e2eApps }, null, 2));
  process.exit(0);
}

console.log(
  changes
    ? `Changes since ${changes.label}: ${files.length} file(s)`
    : 'No base commit found: everything runs.',
);
for (const f of files) console.log(`  ${f}`);
console.log(`\nAffected:\n${(result ? explain(result, workspace) : ['  everything']).join('\n')}`);

if (!all) {
  console.log('\nUnit tests:');
  for (const pkg of workspace.filter((p) => result.affected.has(p.name))) {
    const pick = selectUnit({ pkg, files, workspace, diskTests: diskReadingTests(pkg) });
    const name = pkg.name.padEnd(22);
    if (pick.kind === 'skip') console.log(`  ${name} none`);
    else if (pick.kind === 'full') console.log(`  ${name} whole suite (${pick.why})`);
    else console.log(`  ${name} vitest related on ${pick.files.length} file(s)`);
  }
}

const e2eArgs = [
  'scripts/e2e.mjs',
  args.includes('--all') ? '--all' : '--affected',
  '--dry-run',
  ...(baseArg ? ['--base', baseArg] : []),
  ...(filesArg ? ['--files', filesArg] : []),
];
const { code } = await run(process.execPath, e2eArgs);
process.exit(code);
