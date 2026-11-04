// Shared e2e helpers (BUILD_PLAN §2; additive only once SC0 is merged): a host page plus phones, each
// in its own browser context (own localStorage, so its own player key), portrait, camera granted.
// Google Fonts requests are aborted so runs are offline and deterministic. Specs import `test` from
// here, not from '@playwright/test', so the built-in `page` gets the fullscreen stub too.
import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import type { ScreenKind } from '../src/shared/messages';

/** Phone viewport: portrait (SPEC §3). */
export const PHONE_VIEWPORT = { width: 390, height: 844 };
export const TV_VIEWPORT = { width: 1280, height: 720 };

/** The host debug hooks e2e reads (`window.__pcg`, game-kit `installDebug`); SC5 installs them. */
interface DebugWindow {
  __pcg?: { code(): string | null };
}

/**
 * Turns the controller's fullscreen-on-tap (PLATFORM §3) into a no-op: a real fullscreen breaks
 * `page.setViewportSize()` on some platforms.
 */
export async function noFullscreen(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Element.prototype.requestFullscreen = () => Promise.resolve();
  });
}

/** `test` whose built-in `context` (and so `page`) gets `noFullscreen` and blocked fonts. */
export const test = base.extend({
  context: async ({ context }, use) => {
    await noFullscreen(context);
    await blockFonts(context);
    await use(context);
  },
});

export { expect };

/** Closes every context a test opened on the shared browser. Use as `test.afterEach(closeContexts)`. */
export async function closeContexts({ browser }: { browser: Browser }): Promise<void> {
  for (const context of browser.contexts()) await context.close();
}

export async function blockFonts(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort());
}

export interface Host {
  context: BrowserContext;
  page: Page;
  code: string;
}

/** Opens the TV at `/` (plus `query`, e.g. `timeScale=0.1`) and waits for its room code. */
export async function openHost(browser: Browser, query = ''): Promise<Host> {
  const context = await browser.newContext({ viewport: TV_VIEWPORT });
  await blockFonts(context);
  const page = await context.newPage();
  await page.goto(query ? `/?${query.replace(/^\?/, '')}` : '/');
  await expect
    .poll(() => page.evaluate(() => (window as DebugWindow).__pcg?.code() ?? null), {
      timeout: 20_000,
    })
    .toMatch(/^[A-Z]{4}$/);
  const code = (await page.evaluate(() => (window as DebugWindow).__pcg!.code()))!;
  return { context, page, code };
}

export interface Phone {
  context: BrowserContext;
  page: Page;
  name: string;
}

/** A phone's browser context: portrait, camera granted, fonts blocked, `seed` in localStorage. */
export async function newPhone(
  browser: Browser,
  { seed }: { seed?: Record<string, string> } = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: PHONE_VIEWPORT,
    hasTouch: true,
    permissions: ['camera'],
  });
  await blockFonts(context);
  await noFullscreen(context);
  if (seed) {
    await context.addInitScript((entries) => {
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, seed);
  }
  return context;
}

/**
 * Opens `/play?code=CODE` on a new phone and enters `name` in the lobby. The lobby markup lands in
 * SC3; this expects `input[name=name]` and a `Next` button there.
 */
export async function joinPhone(browser: Browser, code: string, name: string): Promise<Phone> {
  const context = await newPhone(browser);
  const page = await context.newPage();
  await page.goto(`/play?code=${code}`);
  await expect(screen(page, 'lobby')).toBeVisible();
  await page.locator('input[name=name]').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  return { context, page, name };
}

/** The phone screen `kind` (`[data-screen=kind]`). */
export function screen(page: Page, kind: ScreenKind) {
  return page.locator(`[data-screen=${kind}]`);
}

// ---- SC5 (additive) ----

/** The host's `window.__pcg` (src/host/debug.ts), as e2e uses it. */
export interface HostHooks {
  code(): string | null;
  phase(): string;
  state(): {
    phase: string;
    players: { id: string; phoneId: string; name: string; score: number }[];
    round: {
      r: number;
      photographer: string;
      photos: { index: number; url?: string }[];
      tags: { tagId: string; photo: number; playerId: string | null }[];
    } | null;
    lastResult: { photographerDelta: number; caught: { playerId: string; count: number }[] } | null;
  };
  control(c: { action: string; playerId?: string }): void;
  setTimeScale(n: number): void;
}

type HookWindow = { __pcg: HostHooks };

export const hostPhase = (host: Host) =>
  host.page.evaluate(() => (window as unknown as HookWindow).__pcg.phase());
export const hostState = (host: Host) =>
  host.page.evaluate(() => (window as unknown as HookWindow).__pcg.state());
export const hostControl = (host: Host, c: { action: string; playerId?: string }) =>
  host.page.evaluate((ctl) => (window as unknown as HookWindow).__pcg.control(ctl), c);
export const setTimeScale = (host: Host, n: number) =>
  host.page.evaluate((v) => (window as unknown as HookWindow).__pcg.setTimeScale(v), n);

/**
 * Opens `/play?code=CODE&debug=1` on a new phone and joins as `name` (the lobby's name field commits
 * on Enter), then waits until the host lists the player.
 */
export async function joinPlayer(
  browser: Browser,
  host: Host,
  name: string,
  { expectSeat = true }: { expectSeat?: boolean } = {},
): Promise<Phone> {
  const context = await newPhone(browser);
  const page = await context.newPage();
  await page.goto(`/play?code=${host.code}&debug=1`);
  await expect(screen(page, 'lobby')).toBeVisible();
  const input = page.locator('input[name=name]');
  await input.fill(name);
  await input.press('Enter');
  if (expectSeat) {
    await expect
      .poll(async () => (await hostState(host)).players.some((p) => p.name === name))
      .toBe(true);
  }
  return { context, page, name };
}

/** Enable camera, then Ready, on a lobby phone. */
export async function cameraAndReady(phone: Phone): Promise<void> {
  const cam = phone.page.locator('[data-action=camera]');
  await cam.click();
  await expect(phone.page.locator('[data-action=camera]')).toHaveText('Camera on ✓');
  await phone.page.locator('[data-action=ready]').click();
  await expect(phone.page.locator('[data-action=ready]')).toHaveText('Not ready');
}

/** The phone whose seat is the current round's photographer. */
export async function photographerOf(host: Host, phones: Phone[]): Promise<Phone> {
  const s = await hostState(host);
  const id = s.round?.photographer;
  const name = s.players.find((p) => p.id === id)?.name;
  const phone = phones.find((p) => p.name === name);
  if (!phone) throw new Error(`no photographer phone (round ${JSON.stringify(s.round)})`);
  return phone;
}

/** Sends a raw phone message through the page's client hook (`window.__pcg.send`). */
export function sendRaw(phone: Phone, msg: unknown): Promise<void> {
  return phone.page.evaluate((m) => {
    (window as unknown as { __pcg: { send(m: unknown): void } }).__pcg.send(m);
  }, msg);
}
