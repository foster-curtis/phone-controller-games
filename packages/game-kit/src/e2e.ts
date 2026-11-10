// @pcg/game-kit/e2e: Playwright helpers every game's e2e suite uses (Node only, never bundled into a
// page). The per-app e2e config (`pcg.e2e` in package.json) and the request recorder behind
// coverage-based e2e selection in `scripts/e2e.mjs` (PLATFORM §4).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, TestInfo } from '@playwright/test';

/** `pcg.e2e` in an app's package.json: its own e2e ports, and whether its suite must run alone. */
export interface E2EConfig {
  relayPort: number;
  webPort: number;
  /** CPU- or timing-sensitive: `scripts/e2e.mjs` runs it after the others, with nothing alongside. */
  exclusive: boolean;
}

/** Reads `pcg.e2e` from a package.json: `readE2EConfig(new URL('./package.json', import.meta.url))`. */
export function readE2EConfig(packageJson: URL | string): E2EConfig {
  const pkg = JSON.parse(readFileSync(packageJson, 'utf8')) as {
    name?: string;
    pcg?: { e2e?: Partial<E2EConfig> };
  };
  const e2e = pkg.pcg?.e2e;
  if (!e2e || !Number.isInteger(e2e.relayPort) || !Number.isInteger(e2e.webPort)) {
    throw new Error(`${pkg.name ?? 'package.json'}: needs pcg.e2e.relayPort and pcg.e2e.webPort`);
  }
  return {
    relayPort: e2e.relayPort as number,
    webPort: e2e.webPort as number,
    exclusive: e2e.exclusive === true,
  };
}

/** Set by `scripts/e2e.mjs`: where each test writes the URLs its pages requested. Unset, nothing is recorded. */
export const IMPACT_DIR_ENV = 'PCG_E2E_IMPACT_DIR';

export interface ImpactRecorder {
  /** Records this context's requests (the built-in `context` fixture; `browser.newContext()` is automatic). */
  watch(context: BrowserContext): void;
  /** Stops watching new contexts and writes `<dir>/<testId>.json`. */
  finish(): void;
}

const idle: ImpactRecorder = { watch() {}, finish() {} };

/**
 * Records every URL the test's browser contexts request. The Vite dev server serves each source
 * module as its own request, so the set maps to the files the test loaded. That's file-level
 * coverage, which is what e2e selection needs.
 */
export function recordImpact(browser: Browser, testInfo: TestInfo): ImpactRecorder {
  const dir = process.env[IMPACT_DIR_ENV];
  if (!dir) return idle;
  const urls = new Set<string>();
  const watched = new WeakSet<BrowserContext>();
  const watch = (context: BrowserContext): void => {
    if (watched.has(context)) return;
    watched.add(context);
    context.on('request', (request) => urls.add(request.url()));
  };
  // `browser.newPage()` goes through `newContext()` too.
  const original = browser.newContext;
  browser.newContext = async function (this: Browser, ...args: Parameters<Browser['newContext']>) {
    const context = await original.apply(this, args);
    watch(context);
    return context;
  };
  return {
    watch,
    finish() {
      browser.newContext = original;
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${testInfo.testId}.json`),
        JSON.stringify({ file: testInfo.file, urls: [...urls].sort() }),
      );
    },
  };
}
