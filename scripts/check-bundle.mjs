// Checks the JS a game's play.html (the phone controller) loads: no Phaser in any reachable chunk
// (apps that depend on Phaser), and the gzipped total under the app's limit (Fort Frenzy SPEC §15.7).
// Reads the Vite manifest plus the built HTML; run after `pnpm build`.
// `node scripts/check-bundle.mjs <app>...` checks those apps; with no argument, every game app
// (an `apps/*` folder with a play.html).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = join(root, 'apps');

// Strings that survive minification of Phaser's core (its boot banner and homepage).
const PHASER_SIGNATURE = /Phaser v|phaser\.io/;

// Gzipped JS reachable from play.html, in KB (1024 bytes). Every game app needs an entry.
// Sunny Side: its size when the limit was added (FF1, 15.0 KB) + 20%.
const PLAY_JS_LIMIT_KB = {
  'fort-frenzy': 100,
  // Say Cheese: no Phaser, a DOM controller plus the kits.
  'say-cheese': 40,
  'sunny-side': 18,
};

function fail(msg) {
  console.error(`check:bundle FAILED: ${msg}`);
  process.exit(1);
}

function checkApp(app) {
  const appRoot = join(appsDir, app);
  if (!existsSync(join(appRoot, 'play.html'))) fail(`${app}: no apps/${app}/play.html`);
  const pkg = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
  const usesPhaser = Boolean({ ...pkg.dependencies, ...pkg.devDependencies }.phaser);
  const limitKb = PLAY_JS_LIMIT_KB[app];
  if (limitKb === undefined) fail(`${app}: no play.html JS limit in PLAY_JS_LIMIT_KB`);

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

  const controllerFiles = reachableJs('play.html');
  let phaserNote = 'no Phaser dependency';
  if (usesPhaser) {
    // Sanity: the detector must still recognise Phaser in the host bundle, once the host imports it
    // (a new game's host can be a blank page before its renderer lands).
    if (importsPhaser(join(appRoot, 'src')) && withPhaser(reachableJs('index.html')).length === 0) {
      fail(`${app}: Phaser signature not found in the host bundle; update PHASER_SIGNATURE`);
    }
    const offenders = withPhaser(controllerFiles);
    if (offenders.length > 0) fail(`${app}: play.html reaches Phaser via ${offenders.join(', ')}`);
    phaserNote = 'no Phaser';
  }

  const gzBytes = controllerFiles.reduce(
    (sum, f) => sum + gzipSync(readFileSync(join(dist, f)), { level: 9 }).length,
    0,
  );
  const kb = (gzBytes / 1024).toFixed(1);
  if (gzBytes > limitKb * 1024)
    fail(`${app}: play.html loads ${kb} KB gzipped JS, limit ${limitKb} KB`);

  console.log(
    `check:bundle ${app} ok: ${controllerFiles.length} controller chunk(s), ${phaserNote}, ` +
      `${kb} KB gzipped JS (limit ${limitKb} KB)`,
  );
}

/** True if any source file under `dir` imports Phaser. */
function importsPhaser(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).some(
    (e) =>
      e.isFile() &&
      /.[cm]?[jt]s$/.test(e.name) &&
      !/__(fixtures|tests)__/.test(e.parentPath) &&
      /from ['"]phaser['"]|import(['"]phaser['"])/.test(
        readFileSync(join(e.parentPath, e.name), 'utf8'),
      ),
  );
}

const apps =
  process.argv.length > 2
    ? process.argv.slice(2)
    : readdirSync(appsDir).filter((d) => existsSync(join(appsDir, d, 'play.html')));
if (apps.length === 0) fail('no game apps found (apps/*/play.html)');
for (const app of apps) checkApp(app);
