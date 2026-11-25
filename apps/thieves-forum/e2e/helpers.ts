// Shared e2e helpers: a host page plus phones, each in its own browser context (own localStorage, so
// its own player key), landscape (SPEC §3). Google Fonts requests are aborted so runs are offline
// and deterministic. Specs import `test` from here, not from '@playwright/test' (lint).
import { readE2EConfig, recordImpact, type ImpactRecorder } from '@pcg/game-kit/e2e';
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/** Phone viewport: landscape (SPEC §3), so the rotate overlay stays off. */
export const PHONE_VIEWPORT = { width: 844, height: 390 };
export const TV_VIEWPORT = { width: 1280, height: 720 };

/** The host debug hooks e2e reads (`window.__pcg`, src/host/main.ts). */
export interface HostHooks {
  code(): string | null;
  players(): { id: string; name: string }[];
}
type HookWindow = { __pcg?: HostHooks };

/** A real fullscreen breaks `page.setViewportSize()` on some platforms: make it a no-op. */
export async function noFullscreen(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.resolve();
  });
}

export async function blockFonts(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
}

/** `test` whose built-in `context` (and so `page`) gets `noFullscreen` and blocked fonts. */
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
    await noFullscreen(context);
    await blockFonts(context);
    await use(context);
  },
});

/** This app's e2e ports (package.json `pcg.e2e`). */
export const { relayPort: RELAY_PORT, webPort: WEB_PORT } = readE2EConfig(
  new URL('../package.json', import.meta.url),
);

export { expect };

/** Closes every context a test opened on the shared browser. Use as `test.afterEach(closeContexts)`. */
export async function closeContexts({ browser }: { browser: Browser }): Promise<void> {
  for (const context of browser.contexts()) await context.close();
}

export interface Host {
  context: BrowserContext;
  page: Page;
  code: string;
}

/** Opens the TV at `/` and waits for its room code. */
export async function openHost(browser: Browser): Promise<Host> {
  const context = await browser.newContext({ viewport: TV_VIEWPORT });
  await blockFonts(context);
  const page = await context.newPage();
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => (window as HookWindow).__pcg?.code() ?? null), {
      timeout: 20_000,
    })
    .toMatch(/^[A-Z]{4}$/);
  const code = (await page.evaluate(() => (window as HookWindow).__pcg!.code()))!;
  return { context, page, code };
}

export const hostPlayers = (host: Host) =>
  host.page.evaluate(() => (window as HookWindow).__pcg!.players());

export interface Phone {
  context: BrowserContext;
  page: Page;
  name: string;
}

/** Opens `/play?code=CODE` on a new phone, types `name` and taps Join. */
export async function joinPhone(browser: Browser, code: string, name: string): Promise<Phone> {
  const context = await browser.newContext({ viewport: PHONE_VIEWPORT, hasTouch: true });
  await blockFonts(context);
  await noFullscreen(context);
  const page = await context.newPage();
  await page.goto(`/play?code=${code}`);
  await expect(screen(page, 'join')).toBeVisible();
  await expect(page.locator('input[name=code]')).toHaveValue(code);
  await page.locator('input[name=name]').fill(name);
  await page.locator('[data-action=join]').click();
  return { context, page, name };
}

/** The phone screen (`[data-screen=kind]`). */
export function screen(page: Page, kind: 'join' | 'connected') {
  return page.locator(`[data-screen=${kind}]`);
}
