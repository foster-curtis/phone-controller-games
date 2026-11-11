// Shared e2e helpers (BUILD_PLAN G1). Specs import `test` from here, not from '@playwright/test', so
// every test records the files it loads (coverage-based selection in scripts/e2e.mjs) and every page
// opens games on a local stub instead of the live subdomains. The fonts are the kit's own files,
// served by Vite, so nothing needs blocking.
import { readE2EConfig, recordImpact, type ImpactRecorder } from '@pcg/game-kit/e2e';
import { test as base, expect, type BrowserContext } from '@playwright/test';

export { expect };

/** This app's e2e ports (package.json `pcg.e2e`). Only the web port is used. */
export const { webPort: WEB_PORT } = readE2EConfig(new URL('../package.json', import.meta.url));

/** Every game's launch URL today (`gameUrl`, subdomain routing). */
export const GAME_URLS = 'https://*.fostercurtis.dev/**';

/** Answers game launches with a tiny local page, so Play tests never reach the network. */
export async function stubGames(context: BrowserContext): Promise<void> {
  await context.route(GAME_URLS, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><title>Game stub</title><p>Game stub</p></html>',
    }),
  );
}

export const test = base.extend<{ impact: ImpactRecorder }>({
  // Records the files each test loads, for coverage-based selection (`scripts/e2e.mjs`). A no-op
  // unless that runner set `PCG_E2E_IMPACT_DIR`.
  impact: [
    async ({ browser }, use, testInfo) => {
      const recorder = recordImpact(browser, testInfo);
      await use(recorder);
      recorder.finish();
    },
    { auto: true },
  ],
  context: async ({ context, impact }, use) => {
    impact.watch(context);
    await stubGames(context);
    await use(context);
  },
});
