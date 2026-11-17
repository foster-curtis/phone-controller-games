// Controller compatibility (controller-compat F5; PLATFORM §3, docs/notes/controller-compat.md): the
// phone and the TV in a hostile browser, on chromium, firefox and webkit (phoneContextOptions per
// engine). Covers: no automatic full screen, the manual full-screen buttons (phone lobby, phone corner,
// TV lobby), the `?debug=1` Diagnostics pill, and the phone recovering by itself from half-open and
// dropped sockets, a hidden tab, going offline and a bfcache restore, with the same seat and no
// duplicate player. Firefox and webkit run only this file (playwright.config.ts).
import type { Browser, BrowserContext, Page } from '@playwright/test';
import {
  collectPageErrors,
  dropSockets,
  expect,
  halfOpenSockets,
  hostState,
  installSocketControl,
  joinOnPage,
  phoneContextOptions,
  removeApis,
  screen,
  setOffline,
  setVisibility,
  simulateBfcacheRestore,
  test,
  TV_VIEWPORT,
  type Host,
  type Phone,
} from './helpers';

test.setTimeout(240_000);
test.afterEach(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close();
});

type EngineName = 'chromium' | 'firefox' | 'webkit';

/** Fonts answer empty instead of aborting, so an offline run logs no console error for them. */
async function stubFonts(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
}

/**
 * Counts every full-screen request the page makes (and swallows it, so the viewport never changes).
 * `__fsApi` says whether this engine has the API at all.
 */
async function spyFullscreen(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __fsCalls: number; __fsApi: boolean };
    w.__fsCalls = 0;
    w.__fsApi = false;
    const proto = Element.prototype as unknown as Record<string, unknown>;
    for (const key of [
      'requestFullscreen',
      'webkitRequestFullscreen',
      'webkitRequestFullScreen',
      'mozRequestFullScreen',
    ]) {
      if (typeof proto[key] !== 'function') continue;
      w.__fsApi = true;
      proto[key] = function () {
        w.__fsCalls++;
        return Promise.resolve();
      };
    }
  });
}
const fsCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fsCalls: number }).__fsCalls);
const hasFsApi = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fsApi: boolean }).__fsApi);

/**
 * Real outages make browsers log their own network errors (a refused WebSocket, a failed fetch).
 * Those are the test's doing, so they don't count; anything the page throws or logs does.
 */
const realErrors = (errors: string[]) =>
  errors.filter(
    (e) => !/WebSocket connection to|net::ERR_|NS_ERROR|Failed to load resource/i.test(e),
  );

interface Opened {
  host: Host;
  hostErrors: string[];
}

async function openHost(browser: Browser, spy: boolean): Promise<Opened> {
  const context = await browser.newContext({ viewport: TV_VIEWPORT });
  await stubFonts(context);
  if (spy) await spyFullscreen(context);
  const page = await context.newPage();
  const hostErrors = collectPageErrors(page);
  await page.goto('/?debug=1');
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as { __pcg: { code(): string | null } }).__pcg.code(),
        ),
      {
        timeout: 20_000,
      },
    )
    .toMatch(/^[A-Z]{4}$/);
  const code = await page.evaluate(() =>
    (window as unknown as { __pcg: { code(): string } }).__pcg.code(),
  );
  return { host: { context, page, code }, hostErrors };
}

interface PhoneOpts {
  hostile: boolean;
  spy: boolean;
}

async function openPhone(
  browser: Browser,
  browserName: EngineName,
  host: Host,
  name: string,
  { hostile, spy }: PhoneOpts,
): Promise<{ phone: Phone; errors: string[] }> {
  const context = await browser.newContext({
    ...phoneContextOptions(browserName),
    // Chromium fakes the camera through launch flags and needs the grant; the others use prefs.
    ...(browserName === 'chromium' ? { permissions: ['camera'] } : {}),
  });
  await stubFonts(context);
  await installSocketControl(context);
  if (spy) await spyFullscreen(context);
  if (hostile)
    await removeApis(context, [
      'wakeLock',
      'fullscreen',
      'vibrate',
      'orientationLock',
      'clipboard',
    ]);
  const page = await context.newPage();
  const errors = collectPageErrors(page);
  await page.goto(`/play?code=${host.code}&debug=1`);
  await joinOnPage(page, name);
  await expect(screen(page, 'lobby')).toBeVisible();
  return { phone: { context, page, name }, errors };
}

/** The slice of the host's match state these tests read. */
interface Seat {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  left: boolean;
}
const seats = async (host: Host): Promise<Seat[]> =>
  (await hostState(host)).players as unknown as Seat[];

/** A phone socket that is neither half-open nor dropped, and the client says `open`. */
async function recovered(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __pcgSockets?: {
        sockets: { readyState: number; __pcgHalf?: boolean; __pcgDropped?: boolean }[];
      };
      __pcg?: { status(): string };
    };
    const live = (w.__pcgSockets?.sockets ?? []).some(
      (s) => s.readyState === 1 && !s.__pcgHalf && !s.__pcgDropped,
    );
    return live && w.__pcg?.status() === 'open';
  });
}

interface Roster {
  ids: Map<string, string>;
  count: number;
}
async function roster(host: Host, names: string[]): Promise<Roster> {
  const all = await seats(host);
  const ids = new Map<string, string>();
  for (const n of names) ids.set(n, all.find((s) => s.name === n)!.id);
  return { ids, count: all.length };
}

/** After a recovery: same seat, no duplicate player, back on the host as connected. */
async function expectSameSeats(host: Host, before: Roster): Promise<void> {
  await expect
    .poll(async () => {
      const all = await seats(host);
      return (
        all.length === before.count &&
        [...before.ids].every(([name, id]) => {
          const mine = all.filter((s) => s.name === name);
          return mine.length === 1 && mine[0]!.id === id && mine[0]!.connected;
        })
      );
    })
    .toBe(true);
}

/** Toggles Ready on the phone and waits for the host to see it: proves the socket carries input. */
async function readyRoundTrip(host: Host, phone: Phone): Promise<void> {
  const mine = (await seats(host)).find((s) => s.name === phone.name)!;
  const target = !mine.ready;
  await phone.page.locator('[data-action=ready]').click();
  await expect
    .poll(async () => (await seats(host)).find((s) => s.name === phone.name)!.ready)
    .toBe(target);
}

type Scenario = [name: string, run: (phone: Phone) => Promise<void>];
const scenarios: Scenario[] = [
  [
    'half-open sockets (the phone must notice by itself)',
    async ({ page }) => {
      expect(await halfOpenSockets(page)).toBeGreaterThan(0);
    },
  ],
  [
    'dropped sockets',
    async ({ page }) => {
      expect(await dropSockets(page)).toBeGreaterThan(0);
    },
  ],
  [
    'tab hidden then visible',
    async ({ page }) => {
      await setVisibility(page, 'hidden');
      await page.waitForTimeout(1_500);
      await setVisibility(page, 'visible');
    },
  ],
  [
    'offline then online',
    async ({ context, page }) => {
      await setOffline(context, page, true);
      await page.waitForTimeout(3_000);
      await setOffline(context, page, false);
    },
  ],
  [
    'bfcache restore',
    async ({ page }) => {
      await simulateBfcacheRestore(page);
    },
  ],
];

test('no automatic full screen; the full-screen buttons are on the phone and the TV; ?debug=1 shows Diagnostics', async ({
  browser,
  browserName,
}) => {
  const { host, hostErrors } = await openHost(browser, true);
  const { phone, errors } = await openPhone(browser, browserName, host, 'Ann', {
    hostile: false,
    spy: true,
  });
  const { page } = phone;

  // Buttons: the inline one in the lobby, the corner one over every screen, the TV's in its lobby.
  const inline = page.locator('button.pcg-fullscreen-btn[data-action=fullscreen]');
  const corner = page.locator('.pcg-fullscreen-corner');
  await expect(inline).toBeVisible();
  await expect(corner).toBeVisible();
  await expect(page.locator('.pcg-diag-pill')).toBeVisible();
  const tvButton = host.page.locator('.host-chrome .pcg-fullscreen-btn');
  const tvApi = await hasFsApi(host.page);
  if (tvApi) await expect(tvButton).toBeVisible();
  else await expect(tvButton).toBeHidden();

  // Taps on the phone (camera, ready, the page itself) never ask for full screen.
  await page.locator('[data-action=camera]').click();
  await page.locator('[data-action=ready]').click();
  await page.locator('main.lobby').click({ position: { x: 20, y: 400 } });
  await page.waitForTimeout(500);
  expect(await fsCalls(page)).toBe(0);
  expect(await fsCalls(host.page)).toBe(0);

  // Only a tap on the button does (where the engine has the API at all).
  if (await hasFsApi(page)) {
    await corner.click();
    await expect.poll(() => fsCalls(page)).toBe(1);
  }
  // The TV: a key press (F) or its button, never anything else.
  if (tvApi) {
    await host.page.keyboard.press('f');
    await expect.poll(() => fsCalls(host.page)).toBe(1);
    await tvButton.focus();
    await host.page.keyboard.press('Enter');
    await expect.poll(() => fsCalls(host.page)).toBe(2);
  }
  // Enter on the focused TV full-screen button is the button's, not the leader's Start.
  expect((await hostState(host)).phase).toBe('lobby');

  expect(realErrors(errors)).toEqual([]);
  expect(realErrors(hostErrors)).toEqual([]);
});

test('hostile phone (no Wake Lock, full screen, vibrate, orientation lock, clipboard) recovers from every outage in the lobby', async ({
  browser,
  browserName,
}) => {
  const { host, hostErrors } = await openHost(browser, false);
  const ann = await openPhone(browser, browserName, host, 'Ann', { hostile: true, spy: false });
  const ben = await openPhone(browser, browserName, host, 'Ben', { hostile: false, spy: false });
  await expect.poll(async () => (await seats(host)).length).toBe(2);
  const { page } = ann.phone;

  // With the APIs gone the buttons still show, and a tap opens the Add-to-Home-Screen sheet.
  const inline = page.locator('button.pcg-fullscreen-btn[data-action=fullscreen]');
  await expect(inline).toBeVisible();
  await expect(page.locator('.pcg-fullscreen-corner')).toBeVisible();
  await expect(page.locator('.pcg-diag-pill')).toBeVisible();
  await inline.click();
  await expect(page.locator('.pcg-sheet')).toBeVisible();
  await page.locator('.pcg-sheet button').click();
  await expect(page.locator('.pcg-sheet')).toBeHidden();

  const before = await roster(host, ['Ann', 'Ben']);
  await readyRoundTrip(host, ann.phone);
  for (const [name, run] of scenarios) {
    await test.step(name, async () => {
      await run(ann.phone);
      // Heartbeat timeout is 12 s: give it room.
      await expect.poll(() => recovered(page), { timeout: 25_000 }).toBe(true);
      await expect(screen(page, 'lobby')).toBeVisible();
      await expectSameSeats(host, before);
      await readyRoundTrip(host, ann.phone);
    });
  }
  // Ben was never touched.
  await expect(screen(ben.phone.page, 'lobby')).toBeVisible();
  expect((await seats(host)).find((s) => s.name === 'Ben')!.connected).toBe(true);

  expect(realErrors(ann.errors)).toEqual([]);
  expect(realErrors(ben.errors)).toEqual([]);
  expect(realErrors(hostErrors)).toEqual([]);
});

test('a hostile phone keeps its seat through a started match', async ({ browser, browserName }) => {
  const { host, hostErrors } = await openHost(browser, false);
  const names = ['Ann', 'Ben', 'Cat'];
  const opened = [];
  for (const n of names)
    opened.push(await openPhone(browser, browserName, host, n, { hostile: true, spy: false }));

  // Needs a camera: the match won't start without one. Engines whose headless build has none skip
  // this test only (the lobby tests above still run there).
  const leader = opened[0]!.phone;
  await leader.page.locator('[data-action=camera]').click();
  const camOn = await leader.page
    .getByRole('button', { name: 'Camera on ✓' })
    .waitFor({ timeout: 10_000 })
    .then(
      () => true,
      () => false,
    );
  test.skip(!camOn, `${browserName} headless has no fake camera here, so a match can't start`);
  for (const [i, o] of opened.entries()) {
    if (i > 0) {
      await o.phone.page.locator('[data-action=camera]').click();
      await expect(o.phone.page.locator('[data-action=camera]')).toHaveText('Camera on ✓');
    }
    await o.phone.page.locator('[data-action=ready]').click();
    await expect(o.phone.page.locator('[data-action=ready]')).toHaveText('Not ready');
  }
  await leader.page.locator('[data-action=start]').click();
  await leader.page.locator('[data-action=skip]').click();
  await expect.poll(async () => (await hostState(host)).phase).toBe('announce');

  const round = (await hostState(host)).round!;
  const photographerSeat = (await seats(host)).find((s) => s.id === round.photographer)!;
  const ph = opened.find((o) => o.phone.name === photographerSeat.name)!;
  const dodger = opened.find((o) => o !== ph)!;
  const before = await roster(host, names);
  const { page } = dodger.phone;

  // Outages on a dodger while the photographer is still getting ready (the announce has no timer).
  for (const [name, run] of scenarios) {
    await test.step(name, async () => {
      await run(dodger.phone);
      await expect.poll(() => recovered(page), { timeout: 25_000 }).toBe(true);
      await expect(screen(page, 'announce')).toBeVisible();
      await expectSameSeats(host, before);
    });
  }

  // Play a little: the photographer shoots, and the recovered phone still gets the host's screens.
  await ph.phone.page.getByRole('button', { name: "I'm ready" }).click();
  await expect(screen(ph.phone.page, 'shoot')).toBeVisible({ timeout: 20_000 });
  await expect(screen(page, 'announce')).toBeHidden();
  await screen(ph.phone.page, 'shoot').click({ position: { x: 200, y: 400 } });
  await expect
    .poll(
      async () =>
        ((await hostState(host)).round as unknown as { shots: number } | null)?.shots ?? 0,
    )
    .toBeGreaterThanOrEqual(1);
  await expectSameSeats(host, before);

  for (const o of opened) expect(realErrors(o.errors)).toEqual([]);
  expect(realErrors(hostErrors)).toEqual([]);
});
