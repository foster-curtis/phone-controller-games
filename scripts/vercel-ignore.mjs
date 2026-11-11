// Vercel "Ignored Build Step" for an app: every app's vercel.json runs
// `node ../../scripts/vercel-ignore.mjs <app> [--catalog]` (Vercel runs it in the app's Root
// Directory). Vercel's contract: exit 1 builds, exit 0 skips.
// - Production (main): build only when the app's package.json version changed since the last
//   production deployment. Merging the Version Packages PR is the deploy (PLATFORM §5, decision
//   #8); every shipped change carries a note and shared-package bumps patch-bump their dependents,
//   so "version changed" means "something shipped changed".
// - Preview: build when the app, packages/ or the lockfile changed.
// - `--catalog` (the gallery, PLATFORM decision #10): the gallery shows every game's game.meta.ts and
//   card art, but a change to those bumps that game, not the gallery (the gallery doesn't depend on
//   the games). So production also builds when any game's version changed, and previews also build
//   when any apps/<game>/game.meta.ts or apps/<game>/catalog/ changed. A game is any apps/* folder
//   with a game.meta.ts. Catalog bumps already reach the gallery: it depends on @pcg/catalog.
// The previous commit is VERCEL_GIT_PREVIOUS_SHA (the branch's last successful deployment; empty on
// a branch's first deploy and reportedly sometimes), else HEAD^. Anything unreadable builds.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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
 *   changed: (from: string, paths: string[]) => boolean | null,
 *   alsoVersions?: string[], alsoPaths?: string[] }} io
 *   `show` reads a file at a commit (null if it can't); `changed` diffs `from`..HEAD (null if it can't).
 *   `alsoVersions`: more package dirs whose version change builds production. `alsoPaths`: more
 *   paths whose change builds a preview.
 * @returns {{ build: boolean, why: string }}
 */
export function decide({ app, env, show, changed, alsoVersions = [], alsoPaths = [] }) {
  const prev = env.VERCEL_GIT_PREVIOUS_SHA || 'HEAD^';
  if (env.VERCEL_ENV === 'production') {
    const bumped = [];
    for (const dir of [`apps/${app}`, ...alsoVersions]) {
      const pkg = `${dir}/package.json`;
      const before = versionOf(show(prev, pkg));
      const now = versionOf(show('HEAD', pkg));
      if (before === null || now === null) {
        return { build: true, why: `can't read ${pkg} at ${prev}; building to be safe` };
      }
      if (before !== now) bumped.push(`${dir} ${before} → ${now}`);
    }
    return bumped.length > 0
      ? { build: true, why: `version ${bumped.join(', ')}` }
      : { build: false, why: `no version changed since ${prev} (no release)` };
  }
  const paths = [`apps/${app}`, 'packages', 'pnpm-lock.yaml', ...alsoPaths];
  const diff = changed(prev, paths);
  if (diff === null) return { build: true, why: `can't diff against ${prev}; building to be safe` };
  return diff
    ? { build: true, why: `${paths.join(', ')} changed since ${prev}` }
    : { build: false, why: `nothing in ${paths.join(', ')} changed since ${prev}` };
}

/** `--catalog`: every game (an apps/* folder with a game.meta.ts), as `decide()` options. */
export function catalogOptions(root = ROOT) {
  const games = readdirSync(join(root, 'apps')).filter((dir) =>
    existsSync(join(root, 'apps', dir, 'game.meta.ts')),
  );
  return {
    alsoVersions: games.map((g) => `apps/${g}`),
    alsoPaths: games.flatMap((g) => [`apps/${g}/game.meta.ts`, `apps/${g}/catalog`]),
  };
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
  const args = process.argv.slice(2);
  const app = args.find((a) => !a.startsWith('--'));
  if (!app) {
    console.error('usage: node scripts/vercel-ignore.mjs <app> [--catalog]');
    process.exit(1); // build: never skip on a broken setup
  }
  const extra = args.includes('--catalog') ? catalogOptions() : {};
  const { build, why } = decide({ app, env: process.env, show, changed, ...extra });
  console.log(
    `vercel-ignore ${app} (${process.env.VERCEL_ENV ?? 'no VERCEL_ENV'}): ${build ? 'build' : 'skip'}: ${why}`,
  );
  process.exit(build ? 1 : 0);
}
