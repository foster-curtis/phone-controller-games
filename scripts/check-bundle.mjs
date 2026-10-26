// Fails if any JS chunk reachable from a game's play.html (the phone controller) contains Phaser.
// Reads the Vite manifest plus the built HTML; run after `pnpm build`.
// `node scripts/check-bundle.mjs <app>` checks one app; with no argument, every game app
// (an `apps/*` folder with a play.html). Apps that don't depend on Phaser are skipped.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = join(root, 'apps');

// Strings that survive minification of Phaser's core (its boot banner and homepage).
const PHASER_SIGNATURE = /Phaser v|phaser\.io/;

function fail(msg) {
  console.error(`check:bundle FAILED: ${msg}`);
  process.exit(1);
}

function checkApp(app) {
  const appRoot = join(appsDir, app);
  if (!existsSync(join(appRoot, 'play.html'))) fail(`${app}: no apps/${app}/play.html`);
  const pkg = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
  if (!{ ...pkg.dependencies, ...pkg.devDependencies }.phaser) {
    console.log(`check:bundle ${app}: no Phaser dependency, skipped`);
    return;
  }

  const dist = join(appRoot, 'dist');
  const manifestPath = join(dist, '.vite', 'manifest.json');
  if (!existsSync(manifestPath))
    fail(`${app}: no Vite manifest at ${manifestPath}; run \`pnpm build:${app}\` first`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const keyByFile = new Map(Object.entries(manifest).map(([key, chunk]) => [chunk.file, key]));

  /** All JS files reachable from an HTML entry (its scripts + modulepreloads, then imports/dynamicImports). */
  function reachableJs(htmlName) {
    const html = readFileSync(join(dist, htmlName), 'utf8');
    const start = new Set();
    if (manifest[htmlName]) start.add(htmlName);
    const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="\/?([^"]+\.m?js)"/g)];
    for (const [, file] of refs) {
      const key = keyByFile.get(file);
      if (!key) fail(`${app}: ${htmlName} references ${file}, which is not in the manifest`);
      start.add(key);
    }
    if (start.size === 0) fail(`${app}: ${htmlName} has no JS entry`);

    const seen = new Set();
    const stack = [...start];
    while (stack.length) {
      const key = stack.pop();
      if (seen.has(key)) continue;
      seen.add(key);
      const chunk = manifest[key];
      if (!chunk) fail(`${app}: manifest has no chunk ${key}`);
      stack.push(...(chunk.imports ?? []), ...(chunk.dynamicImports ?? []));
    }
    return [...seen].map((key) => manifest[key].file).filter((f) => /\.m?js$/.test(f));
  }

  const withPhaser = (files) =>
    files.filter((f) => PHASER_SIGNATURE.test(readFileSync(join(dist, f), 'utf8')));

  // Sanity: the detector must still recognise Phaser in the host bundle.
  if (withPhaser(reachableJs('index.html')).length === 0) {
    fail(`${app}: Phaser signature not found in the host bundle; update PHASER_SIGNATURE`);
  }

  const controllerFiles = reachableJs('play.html');
  const offenders = withPhaser(controllerFiles);
  if (offenders.length > 0) fail(`${app}: play.html reaches Phaser via ${offenders.join(', ')}`);

  console.log(`check:bundle ${app} ok: ${controllerFiles.length} controller chunk(s), no Phaser`);
}

const apps = process.argv[2]
  ? [process.argv[2]]
  : readdirSync(appsDir).filter((d) => existsSync(join(appsDir, d, 'play.html')));
if (apps.length === 0) fail('no game apps found (apps/*/play.html)');
for (const app of apps) checkApp(app);
