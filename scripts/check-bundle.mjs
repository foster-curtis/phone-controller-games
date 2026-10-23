// Fails if any JS chunk reachable from play.html (the phone controller) contains Phaser.
// Reads the Vite manifest plus the built HTML; run after `pnpm build`.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps', 'sunny-side', 'dist');
const manifestPath = join(dist, '.vite', 'manifest.json');

// Strings that survive minification of Phaser's core (its boot banner and homepage).
const PHASER_SIGNATURE = /Phaser v|phaser\.io/;

function fail(msg) {
  console.error(`check:bundle FAILED: ${msg}`);
  process.exit(1);
}

if (!existsSync(manifestPath))
  fail(`no Vite manifest at ${manifestPath}; run \`pnpm build\` first`);
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
    if (!key) fail(`${htmlName} references ${file}, which is not in the manifest`);
    start.add(key);
  }
  if (start.size === 0) fail(`${htmlName} has no JS entry`);

  const seen = new Set();
  const stack = [...start];
  while (stack.length) {
    const key = stack.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) fail(`manifest has no chunk ${key}`);
    stack.push(...(chunk.imports ?? []), ...(chunk.dynamicImports ?? []));
  }
  return [...seen].map((key) => manifest[key].file).filter((f) => /\.m?js$/.test(f));
}

const withPhaser = (files) =>
  files.filter((f) => PHASER_SIGNATURE.test(readFileSync(join(dist, f), 'utf8')));

// Sanity: the detector must still recognise Phaser in the host bundle.
if (withPhaser(reachableJs('index.html')).length === 0) {
  fail('Phaser signature not found in the host bundle; update PHASER_SIGNATURE');
}

const controllerFiles = reachableJs('play.html');
const offenders = withPhaser(controllerFiles);
if (offenders.length > 0) fail(`play.html reaches Phaser via ${offenders.join(', ')}`);

console.log(`check:bundle ok: ${controllerFiles.length} controller chunk(s), no Phaser`);
