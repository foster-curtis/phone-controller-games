// Git as the record of what changed: the branch's changes against its base, and the changes since
// a snapshot taken at the start of an e2e run (for `pnpm retest`).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './workspace.mjs';

function git(args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** git output, or null when the command fails. */
function tryGit(args) {
  try {
    return git(args).trim();
  } catch {
    return null;
  }
}

const paths = (out) => out.split('\0').filter(Boolean);
const uniqSorted = (list) => [...new Set(list)].sort();

export const head = () => git(['rev-parse', 'HEAD']).trim();
export const isCommit = (ref) =>
  tryGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) !== null;
export const currentBranch = () => tryGit(['symbolic-ref', '--short', 'HEAD']);

/**
 * The commit to diff against: the merge-base of HEAD with `explicit` (CI passes the push's
 * `before`), else with origin/main, else with main. Null when none resolves (callers run
 * everything). An all-zero sha (a new branch's first push) falls back to main.
 */
export function resolveBase(explicit) {
  const candidates = explicit && !/^0+$/.test(explicit) ? [explicit] : ['origin/main', 'main'];
  for (const ref of candidates) {
    if (!isCommit(ref)) continue;
    const sha = tryGit(['merge-base', ref, 'HEAD']);
    if (sha) return { sha, label: ref };
  }
  return null;
}

/**
 * The changed files a CLI works on: `--files a,b` (a "what if these changed" preview) or the diff
 * against `base`. Null when neither is available (callers run everything).
 */
export function changesFor(base, filesArg) {
  if (filesArg) return { label: '--files', files: filesArg.split(',').filter(Boolean).sort() };
  if (!base) return null;
  return { label: `${base.label} (${base.sha.slice(0, 8)})`, files: changedFiles(base.sha) };
}

/** Untracked files that aren't ignored. */
export const untracked = () => paths(git(['ls-files', '--others', '--exclude-standard', '-z']));

/** Every file that differs between `sha` and the working tree (committed, staged, unstaged, new). */
export function changedFiles(sha) {
  return uniqSorted([
    ...paths(git(['diff', '--name-only', '--no-renames', '-z', sha])),
    ...untracked(),
  ]);
}

export function hashFile(rel) {
  try {
    return createHash('sha1')
      .update(readFileSync(join(ROOT, rel)))
      .digest('hex');
  } catch {
    return null; // deleted
  }
}

/** HEAD plus a hash of every file that differs from it, so later edits can be told apart. */
export function takeSnapshot() {
  const dirty = changedFiles('HEAD');
  return { head: head(), dirty: Object.fromEntries(dirty.map((f) => [f, hashFile(f)])) };
}

/** Files changed since a snapshot, or null when there's no usable snapshot. */
export function changedSinceSnapshot(snapshot) {
  if (!snapshot?.head || !isCommit(snapshot.head)) return null;
  const out = new Set();
  // Differs from the snapshot's HEAD and wasn't already dirty then: changed since.
  for (const f of changedFiles(snapshot.head)) if (!(f in snapshot.dirty)) out.add(f);
  // Dirty then: changed since only if its content moved (including back to HEAD's).
  for (const [f, hash] of Object.entries(snapshot.dirty)) if (hashFile(f) !== hash) out.add(f);
  return [...out].sort();
}
