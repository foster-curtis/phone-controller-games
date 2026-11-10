// Coverage-based e2e selection (PLATFORM §4). Each e2e run records the URLs every test's pages
// requested (`@pcg/game-kit/e2e`); the Vite dev server serves each source module as its own URL,
// so those map back to files. The impact map (`.pcg-cache/e2e-impact/<app>.json`, gitignored)
// keeps, per spec, the files its tests loaded. A change then runs only the specs that loaded a
// changed file. Anything the map can't vouch for runs the app's whole suite.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path';
import { CACHE, ROOT, scopeDirs } from './workspace.mjs';

const toPosix = (p) => p.split('\\').join('/');
const appKey = (app) => app.dir.split('/').pop();

export const impactMapPath = (app) => join(CACHE, 'e2e-impact', `${appKey(app)}.json`);
export const rawDir = (app) => join(CACHE, 'e2e-raw', appKey(app));
export const reportPath = (app) => join(CACHE, 'e2e-report', `${appKey(app)}.json`);

/**
 * The repo file a dev-server URL served, or null (another origin, Vite internals, pre-bundled
 * dependencies, or no such file).
 * @param {string} url
 * @param {{ appDir: string, webPort: number, root?: string, exists?: (rel: string) => boolean }} opts
 */
export function urlToFile(url, { appDir, webPort, root = ROOT, exists }) {
  const has = exists ?? ((rel) => existsSync(join(root, rel)));
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || Number(u.port) !== webPort) {
    return null;
  }
  const path = decodeURIComponent(u.pathname);
  if (path.startsWith('/@fs/')) {
    // Files outside the app root (workspace packages): `/@fs/C:/…` on Windows, `/@fs/home/…` elsewhere.
    let abs = path.slice('/@fs'.length);
    if (/^\/[A-Za-z]:\//.test(abs)) abs = abs.slice(1);
    const rel = toPosix(relative(root, abs));
    if (rel.startsWith('..') || isAbsolute(rel) || rel.split('/').includes('node_modules'))
      return null;
    return has(rel) ? rel : null;
  }
  if (path.startsWith('/@') || path.startsWith('/node_modules/') || path.startsWith('/__'))
    return null;
  const candidates = path.endsWith('/') ? [`${path}index.html`] : [path, `${path}.html`];
  for (const candidate of candidates) {
    for (const base of [appDir, `${appDir}/public`]) {
      const rel = posix.normalize(`${base}${candidate}`);
      if (rel.startsWith(`${appDir}/`) && has(rel)) return rel;
    }
  }
  return null;
}

/** Changed files that can't reach a page in e2e: docs, unit tests and fixtures. */
export function e2eIgnored(file) {
  return (
    /\.md$/i.test(file) ||
    /(^|\/)(__tests__|__fixtures__|__screens__)\//.test(file) ||
    /\.test\.[cm]?[jt]sx?$/.test(file) ||
    /^packages\/[^/]+\/test\//.test(file)
  );
}

/** The app's spec files, relative to the app (`e2e/smoke.spec.ts`). */
export function listSpecs(app, root = ROOT) {
  const dir = join(root, app.dir, 'e2e');
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map((f) => `e2e/${toPosix(String(f))}`)
    .filter((f) => f.endsWith('.spec.ts') && !f.includes('/__screens__/'))
    .sort();
}

export function loadMap(app) {
  try {
    return JSON.parse(readFileSync(impactMapPath(app), 'utf8'));
  } catch {
    return null;
  }
}

export function saveMap(app, map) {
  mkdirSync(dirname(impactMapPath(app)), { recursive: true });
  writeFileSync(impactMapPath(app), `${JSON.stringify(map, null, 1)}\n`);
}

/**
 * The specs of `app` that `files` need.
 * @returns {{ full: true, why: string } | { full: false, specs: Map<string, string> }} spec → why
 */
export function selectSpecs({ app, files, workspace, map, specs }) {
  const dirs = scopeDirs(app.name, workspace);
  const relevant = files.filter((f) => dirs.some((d) => f.startsWith(`${d}/`)) && !e2eIgnored(f));
  /** @type {Map<string, string>} */
  const selected = new Map();
  if (relevant.length === 0) return { full: false, specs: selected };
  if (!map) return { full: true, why: `no impact map yet for ${app.dir}` };
  const loadedBy = new Map();
  for (const [spec, loaded] of Object.entries(map.specs)) {
    for (const f of loaded) loadedBy.set(f, [...(loadedBy.get(f) ?? []), spec]);
  }
  for (const file of relevant) {
    if (file.startsWith(`${app.dir}/e2e/`)) {
      const spec = file.slice(app.dir.length + 1);
      if (!spec.endsWith('.spec.ts')) return { full: true, why: `${file} is shared e2e code` };
      if (specs.includes(spec)) selected.set(spec, 'changed');
      continue; // a deleted spec runs nothing
    }
    const hits = (loadedBy.get(file) ?? []).filter((s) => specs.includes(s));
    if (hits.length === 0) return { full: true, why: `no spec has loaded ${file}` };
    for (const spec of hits) if (!selected.has(spec)) selected.set(spec, `loads ${file}`);
  }
  for (const spec of specs) {
    if (!(spec in map.specs) && !selected.has(spec)) selected.set(spec, 'not recorded yet');
  }
  return { full: false, specs: selected };
}

/**
 * Per-test outcomes from Playwright's JSON report: `key` is `e2e/x.spec.ts:LINE` (a CLI filter),
 * `ok` is true (passed or flaky), false (failed) or null (skipped).
 * @returns {{ spec: string, key: string, ok: boolean | null }[]}
 */
export function parseReport(report, appAbs) {
  const rootDir = report.config?.rootDir ?? appAbs;
  const out = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      const file = toPosix(relative(appAbs, resolve(rootDir, spec.file)));
      for (const test of spec.tests ?? []) {
        const ok = test.status === 'skipped' ? null : test.status !== 'unexpected';
        out.push({ spec: file, key: `${file}:${spec.line}`, ok });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const suite of report.suites ?? []) walk(suite);
  return out;
}

/** The files each spec's tests loaded, from the recorder's per-test files. */
export function readRaw(app, webPort, root = ROOT) {
  /** @type {Map<string, Set<string>>} */
  const bySpec = new Map();
  const dir = rawDir(app);
  if (!existsSync(dir)) return bySpec;
  const appAbs = join(root, app.dir);
  for (const name of readdirSync(dir)) {
    const { file, urls } = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    const spec = toPosix(relative(appAbs, file));
    const files = bySpec.get(spec) ?? new Set();
    for (const url of urls) {
      const rel = urlToFile(url, { appDir: app.dir, webPort, root });
      if (rel) files.add(rel);
    }
    bySpec.set(spec, files);
  }
  return bySpec;
}

/**
 * Folds a run's recordings into the map. A spec whose every test ran and passed in a full-suite
 * run gets its entry replaced (it may load fewer files now); any other recording adds to it.
 * Specs that no longer exist drop out.
 */
export function mergeMap(old, recorded, { replace, specs }) {
  const next = {};
  for (const spec of specs) {
    const fresh = recorded.get(spec);
    const prev = old?.specs?.[spec];
    if (!fresh && !prev) continue;
    const files = new Set(fresh && replace.has(spec) ? [] : (prev ?? []));
    for (const f of fresh ?? []) files.add(f);
    next[spec] = [...files].sort();
  }
  return { version: 1, specs: next };
}
