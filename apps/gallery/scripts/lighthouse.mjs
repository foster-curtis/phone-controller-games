// Lighthouse check (SPEC: Done when, "accessibility and performance in the 90s on mobile").
// Builds the gallery (skip with --no-build), serves it with `vite preview` on 4173 (shared with
// check:routes, so never at the same time), runs Lighthouse with its default mobile settings on
// Playwright's Chromium, prints both scores, and exits 1 if either is below 90.
// Usage: pnpm lighthouse:gallery [-- --no-build]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CONFIG = join(ROOT, 'vite.config.ts');
const PORT = 4173;
const URL_ = `http://localhost:${PORT}/`;
const LIGHTHOUSE = 'lighthouse@13.6.0';
const CATEGORIES = ['performance', 'accessibility'];
const MIN_SCORE = 90;

/** `pnpm dlx …` without a shell when this runs under pnpm (npm_execpath is pnpm's JS entry). */
function pnpmCommand(args) {
  const pnpm = process.env.npm_execpath;
  if (pnpm && /\.c?js$/.test(pnpm)) return [process.execPath, [pnpm, ...args], false];
  return ['pnpm', args, process.platform === 'win32'];
}

if (!process.argv.includes('--no-build')) {
  await build({ root: ROOT, configFile: CONFIG, logLevel: 'warn' });
}

const server = await preview({
  root: ROOT,
  configFile: CONFIG,
  logLevel: 'warn',
  preview: { port: PORT, strictPort: true, host: 'localhost', open: false },
});

const tmp = mkdtempSync(join(tmpdir(), 'pcg-gallery-lighthouse-'));
const report = join(tmp, 'report.json');
let failed = true;
try {
  const [cmd, args, shell] = pnpmCommand([
    'dlx',
    LIGHTHOUSE,
    URL_,
    `--only-categories=${CATEGORIES.join(',')}`,
    '--output=json',
    `--output-path=${report}`,
    '--chrome-flags=--headless=new',
    '--quiet',
  ]);
  const run = spawnSync(cmd, args, {
    cwd: ROOT,
    shell,
    stdio: 'inherit',
    env: { ...process.env, CHROME_PATH: chromium.executablePath() },
  });
  // Chrome's temp-profile cleanup can fail on Windows after a good run; the report decides.
  if (!existsSync(report)) {
    console.error(`lighthouse: no report (exit ${run.status ?? run.error})`);
  } else {
    const { categories } = JSON.parse(readFileSync(report, 'utf8'));
    const scores = CATEGORIES.map((id) => [id, Math.round((categories[id]?.score ?? 0) * 100)]);
    for (const [id, score] of scores) {
      console.log(`lighthouse ${id}: ${score}${score < MIN_SCORE ? ` (below ${MIN_SCORE})` : ''}`);
    }
    failed = scores.some(([, score]) => score < MIN_SCORE);
  }
} finally {
  await server.close();
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
