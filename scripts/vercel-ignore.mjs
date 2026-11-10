// Vercel "Ignored Build Step" for a game: every game's vercel.json runs
// `node ../../scripts/vercel-ignore.mjs <app>` (Vercel runs it in the app's Root Directory).
// Vercel's contract: exit 1 builds, exit 0 skips.
// - Production (main): build only when the app's package.json version changed since the last
//   production deployment. Merging the Version Packages PR is the deploy (PLATFORM §5, decision
//   #8); every shipped change carries a note and shared-package bumps patch-bump their dependents,
//   so "version changed" means "something shipped changed".
// - Preview: build when the app, packages/ or the lockfile changed.
// The previous commit is VERCEL_GIT_PREVIOUS_SHA (the branch's last successful deployment; empty on
// a branch's first deploy and reportedly sometimes), else HEAD^. Anything unreadable builds.
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const versionOf = (json) => {
  try {
    return JSON.parse(json).version ?? null;
  } catch {
    return null;
  }
};

/**
 * @param {{ app: string, env: Record<string, string | undefined>,
 *   show: (sha: string, path: string) => string | null,
 *   changed: (from: string, paths: string[]) => boolean | null }} io
 *   `show` reads a file at a commit (null if it can't); `changed` diffs `from`..HEAD (null if it can't).
 * @returns {{ build: boolean, why: string }}
 */
export function decide({ app, env, show, changed }) {
  const prev = env.VERCEL_GIT_PREVIOUS_SHA || 'HEAD^';
  if (env.VERCEL_ENV === 'production') {
    const pkg = `apps/${app}/package.json`;
    const before = versionOf(show(prev, pkg));
    const now = versionOf(show('HEAD', pkg));
    if (before === null || now === null) {
      return { build: true, why: `can't read ${pkg} at ${prev}; building to be safe` };
    }
    return before !== now
      ? { build: true, why: `version ${before} → ${now}` }
      : { build: false, why: `version ${now} unchanged since ${prev} (no release)` };
  }
  const paths = [`apps/${app}`, 'packages', 'pnpm-lock.yaml'];
  const diff = changed(prev, paths);
  if (diff === null) return { build: true, why: `can't diff against ${prev}; building to be safe` };
  return diff
    ? { build: true, why: `${paths.join(', ')} changed since ${prev}` }
    : { build: false, why: `nothing in ${paths.join(', ')} changed since ${prev}` };
}

function show(sha, path) {
  try {
    return execFileSync('git', ['show', `${sha}:${path}`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function changed(from, paths) {
  try {
    execFileSync('git', ['diff', '--quiet', from, 'HEAD', '--', ...paths], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return false;
  } catch (err) {
    return err.status === 1 ? true : null; // 1: differences; anything else: git couldn't diff
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = process.argv[2];
  if (!app) {
    console.error('usage: node scripts/vercel-ignore.mjs <app>');
    process.exit(1); // build: never skip on a broken setup
  }
  const { build, why } = decide({ app, env: process.env, show, changed });
  console.log(
    `vercel-ignore ${app} (${process.env.VERCEL_ENV ?? 'no VERCEL_ENV'}): ${build ? 'build' : 'skip'}: ${why}`,
  );
  process.exit(build ? 1 : 0);
}
