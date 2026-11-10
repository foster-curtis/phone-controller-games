// The pnpm workspace as plain data (every apps/* and packages/* package.json), and what a set of
// changed files affects: the packages they belong to plus every package that depends on those.
// Shared config outside any package affects everything (PLATFORM §4).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = join(ROOT, '.pcg-cache');

/**
 * @typedef {{ name: string, dir: string, deps: string[], scripts: Record<string, string>,
 *   e2e: { relayPort: number, webPort: number, exclusive?: boolean } | null, hasPlay: boolean }} Pkg
 */

/** @returns {Pkg[]} */
export function loadWorkspace(root = ROOT) {
  const pkgs = [];
  for (const group of ['apps', 'packages']) {
    for (const name of readdirSync(join(root, group)).sort()) {
      const file = join(root, group, name, 'package.json');
      if (!existsSync(file)) continue;
      const pkg = JSON.parse(readFileSync(file, 'utf8'));
      pkgs.push({
        name: pkg.name,
        dir: `${group}/${name}`,
        deps: Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
          .filter(([, version]) => String(version).startsWith('workspace:'))
          .map(([dep]) => dep),
        scripts: pkg.scripts ?? {},
        e2e: pkg.pcg?.e2e ?? null,
        hasPlay: existsSync(join(root, group, name, 'play.html')),
      });
    }
  }
  return pkgs;
}

/** Root files that change no package and no tooling: they only get a format check. */
const ROOT_DOCS = [/^[^/]+\.md$/i, /^\.changeset\//, /^\.claude\//, /^\.vscode\//];

/** The package a repo-relative file belongs to, or null. */
export function packageOf(file, workspace) {
  return workspace.find((p) => file.startsWith(`${p.dir}/`)) ?? null;
}

/** Names of a package and everything it depends on in the workspace, transitively. */
export function depsClosure(name, workspace) {
  const byName = new Map(workspace.map((p) => [p.name, p]));
  const seen = new Set([name]);
  const queue = [name];
  while (queue.length) {
    for (const dep of byName.get(queue.shift())?.deps ?? []) {
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  return seen;
}

/** Directories (`apps/x`) of a package and its transitive workspace deps. */
export function scopeDirs(name, workspace) {
  const names = depsClosure(name, workspace);
  return workspace.filter((p) => names.has(p.name)).map((p) => p.dir);
}

/**
 * What a set of changed files affects. Unknown files outside every package count as shared config
 * and affect everything: a mistake runs too much, never too little.
 * @param {string[]} files repo-relative, forward slashes
 * @param {Pkg[]} workspace
 */
export function computeAffected(files, workspace) {
  /** @type {Map<string, string[]>} */
  const changed = new Map();
  const rootDocs = [];
  const shared = [];
  for (const file of files) {
    const pkg = packageOf(file, workspace);
    if (pkg) changed.set(pkg.name, [...(changed.get(pkg.name) ?? []), file]);
    else if (ROOT_DOCS.some((re) => re.test(file))) rootDocs.push(file);
    else shared.push(file);
  }

  /** @type {Map<string, string>} package name → why it is affected */
  const affected = new Map();
  if (shared.length) {
    for (const p of workspace) affected.set(p.name, 'shared config changed');
  } else {
    const dependents = new Map(workspace.map((p) => [p.name, []]));
    for (const p of workspace) for (const dep of p.deps) dependents.get(dep)?.push(p.name);
    const queue = [];
    for (const name of changed.keys()) {
      affected.set(name, 'changed');
      queue.push(name);
    }
    while (queue.length) {
      const name = queue.shift();
      for (const dependent of dependents.get(name) ?? []) {
        if (affected.has(dependent)) continue;
        affected.set(dependent, `depends on ${name}`);
        queue.push(dependent);
      }
    }
  }
  return { all: shared.length > 0, shared, rootDocs, changed, affected };
}

/** Human-readable lines explaining an affected result. */
export function explain(result, workspace) {
  const lines = [];
  if (result.all) {
    lines.push(
      `Everything: shared config changed (${result.shared.slice(0, 5).join(', ')}${result.shared.length > 5 ? ', …' : ''})`,
    );
    return lines;
  }
  if (result.affected.size === 0) lines.push('No package affected.');
  for (const p of workspace) {
    const why = result.affected.get(p.name);
    if (!why) continue;
    const n = result.changed.get(p.name)?.length;
    lines.push(`  ${p.name.padEnd(22)} ${why}${n ? ` (${n} file${n === 1 ? '' : 's'})` : ''}`);
  }
  if (result.rootDocs.length)
    lines.push(`  root docs (format only): ${result.rootDocs.join(', ')}`);
  return lines;
}
