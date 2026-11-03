// Shared e2e helpers (pattern from Sunny Side): a TV page plus phones, each in its own browser context
// (own localStorage, so its own player key and device ID). Fonts are stubbed so runs are offline.
// Timing never sleeps or waits on wall-clock sim time: specs step the sim with `__pcg.advance` and
// poll its state. Every URL is absolute (contexts made with `browser.newContext` get no baseURL).
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import type {} from '../src/host/debug'; // `window.__pcg` typing

export const PHONE_VIEWPORT = { width: 844, height: 390 };

/** An absolute URL on the e2e dev server. */
export function url(path: string): string {
  return new URL(path, test.info().project.use.baseURL).toString();
}

/** The controller's fullscreen-on-tap would really fullscreen headless Chromium on Windows. */
export async function noFullscreen(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.resolve();
  });
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await noFullscreen(context);
    await use(context);
  },
});

export async function closeContexts({ browser }: { browser: Browser }): Promise<void> {
  for (const context of browser.contexts()) await context.close();
}

export async function blockFonts(context: BrowserContext): Promise<void> {
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
}

export interface Host {
  context: BrowserContext;
  page: Page;
  code: string;
  errors: string[];
}

/** Opens the TV, waits for the home screen, creates the room with Enter (home row 1). */
export async function openHost(browser: Browser): Promise<Host> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockFonts(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Bloom off and rendering capped at 15 fps: under software GL the TV's frames would starve the
  // phone pages (one shared GPU process); the sim runs on its own timer either way.
  await page.goto(url('/?panel=0&bloom=0&fps=15'));
  await expect
    .poll(() => page.evaluate(() => window.__pcg?.screen() ?? null), { timeout: 30_000 })
    .toBe('home');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.__pcg?.code() ?? null), { timeout: 20_000 })
    .toMatch(/^[A-Z]{4}$/);
  const code = (await page.evaluate(() => window.__pcg!.code()))!;
  return { context, page, code, errors };
}

export interface Phone {
  context: BrowserContext;
  page: Page;
  name: string;
}

export async function newPhoneContext(
  browser: Browser,
  seed?: Record<string, string>,
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: PHONE_VIEWPORT, hasTouch: true });
  await blockFonts(context);
  await noFullscreen(context);
  if (seed) {
    await context.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seed);
  }
  return context;
}

/** A phone joins by the QR's URL, enters its name, picks the first knight (the Ranger). */
export async function joinPhone(browser: Browser, code: string, name: string): Promise<Phone> {
  const context = await newPhoneContext(browser);
  const page = await context.newPage();
  await page.goto(url(`/play?code=${code}`));
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'JOIN' }).click();
  const pick = page.locator('.screen.lobby .pick');
  await expect(pick).toBeVisible();
  await expect(pick).toHaveText(/RANGER/);
  await pick.click();
  await expect(page.locator('.screen.lobby .ready')).toBeVisible();
  return { context, page, name };
}

export function phase(host: Host) {
  return host.page.evaluate(() => window.__pcg!.phase());
}

export function stats(host: Host) {
  return host.page.evaluate(() => window.__pcg!.stats());
}

export function players(host: Host) {
  return host.page.evaluate(() => window.__pcg!.players());
}

export async function playerByName(host: Host, name: string) {
  const all = await players(host);
  return all.find((p) => p.name === name) ?? null;
}

/**
 * Steps the sim `steps` at a time until the run is at `wave` and `phase`, inside the TV page (one
 * round trip, so a busy page can't stretch it): sim time, never wall time. Gives up after `max` steps.
 */
export async function stepUntil(
  host: Host,
  want: { phase: string; wave?: number },
  steps = 30,
  max = 20_000,
): Promise<void> {
  const ok = await host.page.evaluate(
    ([n, cap, w]) => {
      const api = window.__pcg!;
      const done = () => api.phase() === w.phase && (w.wave === undefined || api.wave() === w.wave);
      for (let ran = 0; !done() && ran < cap; ran += n) api.advance(n);
      return done();
    },
    [steps, max, want] as const,
  );
  expect(ok, `reached ${want.phase} ${want.wave ?? ''}`).toBe(true);
}

/** Steps the sim (inside the TV page) until an enemy has died. */
export async function stepUntilKill(host: Host, steps = 60, max = 20_000): Promise<void> {
  const deaths = await host.page.evaluate(
    ([n, cap]) => {
      const api = window.__pcg!;
      for (let ran = 0; api.stats().enemyDeaths === 0 && ran < cap; ran += n) api.advance(n);
      return api.stats().enemyDeaths;
    },
    [steps, max] as const,
  );
  expect(deaths).toBeGreaterThan(0);
}

/** Both phones tap Ready in the lobby; the run starts by itself (everyone ready, §11.1). */
export async function readyUp(phones: Phone[]) {
  for (const p of phones) {
    const ready = p.page.locator('.screen.lobby .ready');
    await ready.click();
    await expect(ready).toHaveAttribute('aria-pressed', 'true');
  }
}

/** Freezes wall-clock sim time on the TV: from here on only `advance` steps the run. */
export function freeze(host: Host) {
  return host.page.evaluate(() => window.__pcg!.speed(0));
}

export function advance(host: Host, steps: number) {
  return host.page.evaluate((n) => window.__pcg!.advance(n), steps);
}

/** A poll callback that first steps the sim (commands, presence and inputs apply on a step). */
export function stepped<T>(host: Host, read: () => Promise<T>, steps = 2): () => Promise<T> {
  return async () => {
    await advance(host, steps);
    return read();
  };
}
