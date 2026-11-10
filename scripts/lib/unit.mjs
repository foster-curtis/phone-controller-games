// Unit test selection per package (PLATFORM §4): `vitest related` runs the test files whose
// imports reach a changed file. Tests that read files from disk can't be traced that way, so they
// always run with any code change in their package. A changed file imports can't explain (CSS,
// SVG, JSON, config) runs the package's whole suite.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, scopeDirs } from './workspace.mjs';

const CODE = /\.[cm]?[jt]sx?$/;
const CONFIG =
  /(^|\/)(package\.json|tsconfig[^/]*\.json|vite\.config\.[cm]?[jt]s|vitest\.config\.[cm]?[jt]s)$/;
const TEST_FILE = /(\.test\.[cm]?[jt]sx?$)|(^|\/)(__tests__|__fixtures__|test)\//;
const READS_DISK = /\b(readFileSync|readdirSync|existsSync|statSync|readFile|readdir)\b/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'generated', 'e2e', 'public', 'brand', 'art']);

/** The package's test files that read from disk (repo-relative). */
export function diskReadingTests(pkg, root = ROOT) {
  const out = [];
  const walk = (rel) => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(child);
      } else if (/\.test\.[cm]?[jt]sx?$/.test(entry.name)) {
        if (READS_DISK.test(readFileSync(join(root, child), 'utf8'))) out.push(child);
      }
    }
  };
  walk(pkg.dir);
  return out.sort();
}

/**
 * @returns {{ kind: 'skip' } | { kind: 'full', why: string } | { kind: 'related', files: string[] }}
 */
export function selectUnit({ pkg, files, workspace, diskTests = [], exists }) {
  if (!pkg.scripts.test) return { kind: 'skip' };
  const has = exists ?? ((rel) => existsSync(join(ROOT, rel)));
  const dirs = scopeDirs(pkg.name, workspace);
  const relevant = files.filter((f) => {
    if (!dirs.some((d) => f.startsWith(`${d}/`))) return false;
    if (/\.md$/i.test(f) || f.includes('/e2e/') || f.endsWith('playwright.config.ts')) return false;
    // Another package's tests never run here.
    return (
      f.startsWith(`${pkg.dir}/`) || !TEST_FILE.test(f.slice(f.indexOf('/', f.indexOf('/') + 1)))
    );
  });
  if (relevant.length === 0) return { kind: 'skip' };
  const untraceable = relevant.find((f) => !CODE.test(f) || CONFIG.test(f));
  if (untraceable) return { kind: 'full', why: `${untraceable} isn't traceable by imports` };
  const present = relevant.filter(has);
  if (present.length === 0) return { kind: 'full', why: 'only deletions (nothing to trace from)' };
  return { kind: 'related', files: [...new Set([...present, ...diskTests])].sort() };
}
