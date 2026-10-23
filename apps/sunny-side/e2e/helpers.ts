// Shared e2e helpers: a host page plus phones, each in its own browser context (own localStorage,
// so its own player key). Google Fonts requests are aborted so runs are offline and deterministic.
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type {} from '../src/host/debug'; // `window.__pcg` typing
import type { PlayerView } from '../src/host/match';
import type { ScreenKind } from '../src/shared/messages';

/** Phone viewport: landscape, so the rotate overlay stays away. */
export const PHONE_VIEWPORT = { width: 844, height: 390 };

export async function blockFonts(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
}

export interface Host {
  context: BrowserContext;
  page: Page;
  code: string;
}

export async function openHost(browser: Browser): Promise<Host> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockFonts(context);
  const page = await context.newPage();
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => window.__pcg?.code() ?? null), { timeout: 20_000 })
    .toMatch(/^[A-Z]{4}$/);
  const code = (await page.evaluate(() => window.__pcg!.code()))!;
  return { context, page, code };
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
  const context = await browser.newContext({ viewport: PHONE_VIEWPORT });
  await blockFonts(context);
  if (seed) {
    await context.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seed);
  }
  return context;
}

/** Opens `/play?code=CODE` in a fresh context, enters `name` and taps Ready. */
export async function joinPhone(browser: Browser, code: string, name: string): Promise<Phone> {
  const context = await newPhoneContext(browser);
  const page = await context.newPage();
  await page.goto(`/play?code=${code}`);
  await expect(screen(page, 'lobby')).toBeVisible();
  await page.locator('input[name=name]').fill(name);
  await page.getByRole('button', { name: 'Ready' }).click();
  return { context, page, name };
}

export function screen(page: Page, kind: ScreenKind) {
  return page.locator(`[data-screen=${kind}]`);
}

export function phase(host: Host) {
  return host.page.evaluate(() => window.__pcg!.phase());
}

export function players(host: Host): Promise<PlayerView[]> {
  return host.page.evaluate(() => window.__pcg!.players());
}

export async function playerByName(host: Host, name: string): Promise<PlayerView> {
  let found: PlayerView | undefined;
  await expect
    .poll(async () => {
      found = (await players(host)).find((p) => p.name === name && !p.left);
      return !!found;
    })
    .toBe(true);
  return found!;
}

export function eliminate(host: Host, id: string): Promise<boolean> {
  return host.page.evaluate((pid) => window.__pcg!.debug.eliminate(pid), id);
}

export function hostTexts(host: Host): Promise<string[]> {
  return host.page.evaluate(() => window.__pcg!.texts());
}

/** The leader's phone taps a leader action button (`data-leader`). */
export async function leaderTap(phone: Phone, action: 'start' | 'next' | 'rematch' | 'lobby') {
  const button = phone.page.locator(`[data-leader=${action}]`);
  await expect(button).toBeEnabled();
  await button.click();
}

/** Starts round play from the lobby and waits for `playing` on the host. */
export async function startMatch(host: Host, leader: Phone): Promise<void> {
  await leaderTap(leader, 'start');
  await expect.poll(() => phase(host), { timeout: 10_000 }).toBe('playing');
}
