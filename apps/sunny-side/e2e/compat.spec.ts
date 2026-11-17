// Controller compatibility (controller-compat F5): a phone with none of the optional browser APIs
// joins, plays and survives every kind of lost connection with the same player identity; full screen
// only ever starts from a tap on a full-screen button; `?debug=1` survives joining. Runs on the
// chromium, firefox and webkit projects (playwright.config.ts), so phones use phoneContextOptions.
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  blockFonts,
  closeContexts,
  collectPageErrors,
  dropSockets,
  halfOpenSockets,
  installSocketControl,
  joinPhone,
  openHost,
  phoneContextOptions,
  players,
  removeApis,
  screen,
  setOffline,
  setVisibility,
  simulateBfcacheRestore,
  startMatch,
  test,
  type Host,
  type Phone,
} from './helpers';

test.afterEach(closeContexts);

type BrowserName = 'chromium' | 'firefox' | 'webkit';

// Browser noise that isn't a page bug: blocked fonts, and the engines' own logs of a socket we cut.
const NOISE =
  /Failed to load resource|net::ERR|ERR_|WebSocket|can't establish a connection|connection was interrupted|Load failed|NS_ERROR|fonts\.g/i;

/** Uncaught errors and `console.error`s from every page in `context`, minus browser noise. */
function watchErrors(context: BrowserContext): () => string[] {
  const all: string[][] = [];
  context.on('page', (p) => all.push(collectPageErrors(p)));
  return () => all.flat().filter((e) => !NOISE.test(e));
}

/** Counts `requestFullscreen` calls (and still resolves, so the runner never really goes full screen). */
async function spyFullscreen(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    (window as unknown as { __fsCalls: number }).__fsCalls = 0;
    Element.prototype.requestFullscreen = () => {
      (window as unknown as { __fsCalls: number }).__fsCalls += 1;
      return Promise.resolve();
    };
  });
}

const fsCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __fsCalls?: number }).__fsCalls ?? 0);

/** A phone-shaped context for this browser (landscape, so the rotate overlay stays away). */
async function phoneContext(browser: Browser, browserName: BrowserName): Promise<BrowserContext> {
  const context = await browser.newContext(phoneContextOptions(browserName, { landscape: true }));
  await blockFonts(context);
  return context;
}

/** A host page with the full-screen spy and error watcher installed before it loads. */
async function openSpiedHost(browser: Browser): Promise<{ host: Host; errors: () => string[] }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockFonts(context);
  await spyFullscreen(context);
  const errors = watchErrors(context);
  const page = await context.newPage();
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => window.__pcg?.code() ?? null), { timeout: 20_000 })
    .toMatch(/^[A-Z]{4}$/);
  const code = (await page.evaluate(() => window.__pcg!.code()))!;
  return { host: { context, page, code }, errors };
}

/** Live, undisturbed sockets the page holds (see installSocketControl). */
const healthySockets = (page: Page) =>
  page.evaluate(() => {
    type S = WebSocket & { __pcgHalf?: boolean; __pcgDropped?: boolean };
    const control = (window as unknown as { __pcgSockets?: { sockets: S[] } }).__pcgSockets;
    return (control?.sockets ?? []).filter(
      (s) => s.readyState === WebSocket.OPEN && !s.__pcgHalf && !s.__pcgDropped,
    ).length;
  });

const bannerColor = (page: Page) =>
  page.locator('[data-banner]').evaluate((b) => (b as HTMLElement).dataset.color ?? '');

test('a phone with no optional APIs recovers from every kind of lost connection', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(180_000);
  const { host, errors: hostErrors } = await openSpiedHost(browser);

  // Ann (leader): no Wake Lock, full screen, vibration, orientation lock or clipboard from the start.
  const annContext = await phoneContext(browser, browserName);
  await installSocketControl(annContext);
  await removeApis(annContext, [
    'wakeLock',
    'fullscreen',
    'vibrate',
    'orientationLock',
    'clipboard',
  ]);
  const annErrors = watchErrors(annContext);
  const ann: Phone = await joinPhone(browser, host.code, 'Ann', annContext);
  const bobContext = await phoneContext(browser, browserName);
  const bobErrors = watchErrors(bobContext);
  await joinPhone(browser, host.code, 'Bob', bobContext);

  // Full-screen buttons: inline on the phone lobby, on the host lobby (where the API exists).
  await expect(screen(ann.page, 'lobby').locator('.pcg-fullscreen-btn')).toBeVisible();
  const hostCanFullscreen = await host.page.evaluate(
    () =>
      !!(
        document.fullscreenEnabled ||
        (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled
      ),
  );
  await expect(host.page.locator('.host-fullscreen-btn')).toBeVisible({
    visible: hostCanFullscreen,
  });

  // Without the API, the button opens the Add-to-Home-Screen sheet.
  await screen(ann.page, 'lobby').locator('.pcg-fullscreen-btn').click();
  await expect(ann.page.locator('.pcg-sheet')).toBeVisible();
  await ann.page.locator('.pcg-sheet button').click();
  await expect(ann.page.locator('.pcg-sheet')).toHaveCount(0);

  await startMatch(host, ann);
  // The corner button shows on the controller, and the host's button is gone from the play area.
  await expect(ann.page.locator('.pcg-fullscreen-corner')).toBeVisible();
  await expect(host.page.locator('.host-fullscreen-btn')).toBeHidden();

  // Send input: drag the stick.
  const zone = await ann.page.locator('.stick-zone').boundingBox();
  const drag = async () => {
    if (!zone) return;
    await ann.page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2);
    await ann.page.mouse.down();
    await ann.page.mouse.move(zone.x + zone.width / 2 + 40, zone.y + zone.height / 2, {
      steps: 4,
    });
    await ann.page.mouse.up();
  };
  await drag();

  const root = ann.page.locator('#app');
  const id = (await root.getAttribute('data-player-id'))!;
  expect(id).toBeTruthy();
  const color = await bannerColor(ann.page);
  expect(color).not.toBe('');

  // Same player id and color, one Ann and one Bob on the TV (no duplicates), and a working socket.
  const expectSame = async () => {
    await expect(root).toHaveAttribute('data-player-id', id);
    await expect.poll(() => healthySockets(ann.page), { timeout: 25_000 }).toBeGreaterThan(0);
    await expect
      .poll(
        async () => {
          const live = (await players(host)).filter((p) => !p.left);
          const a = live.find((p) => p.id === id);
          return {
            count: live.length,
            unique: new Set(live.map((p) => p.id)).size,
            names: live.map((p) => p.name).sort(),
            connected: a?.connected,
            color: a?.color,
          };
        },
        { timeout: 25_000 },
      )
      .toEqual({ count: 2, unique: 2, names: ['Ann', 'Bob'], connected: true, color });
    expect(await bannerColor(ann.page)).toBe(color);
  };

  // 1. Half-open: the socket stays open but silent. Only the client heartbeat (12 s) can notice.
  expect(await halfOpenSockets(ann.page)).toBeGreaterThan(0);
  await expectSame();
  await drag();

  // 2. Abrupt drop (1006).
  expect(await dropSockets(ann.page)).toBeGreaterThan(0);
  await expectSame();

  // 3. Backgrounded and back.
  await setVisibility(ann.page, 'hidden');
  await setVisibility(ann.page, 'visible');
  await expectSame();

  // 4. Network off and on (shorter than the relay's reconnect window).
  await setOffline(ann.context, ann.page, true);
  await ann.page.waitForTimeout(500);
  await setOffline(ann.context, ann.page, false);
  await expectSame();

  // 5. Back/forward-cache restore.
  await simulateBfcacheRestore(ann.page);
  await expectSame();
  await drag();

  // Nothing ever asked for full screen, and nothing threw.
  expect(await fsCalls(host.page)).toBe(0);
  expect(annErrors()).toEqual([]);
  expect(bobErrors()).toEqual([]);
  expect(hostErrors()).toEqual([]);
});

test('full screen starts only from a tap on a full-screen button', async ({
  browser,
  browserName,
}) => {
  const { host, errors: hostErrors } = await openSpiedHost(browser);
  const annContext = await phoneContext(browser, browserName);
  await spyFullscreen(annContext);
  const annErrors = watchErrors(annContext);
  const ann = await joinPhone(browser, host.code, 'Ann', annContext);
  const bobContext = await phoneContext(browser, browserName);
  await joinPhone(browser, host.code, 'Bob', bobContext);

  // Joining, naming, readying and the host's own screen asked for nothing.
  expect(await fsCalls(ann.page)).toBe(0);
  expect(await fsCalls(host.page)).toBe(0);
  await startMatch(host, ann);
  await ann.page.locator('.stick-zone').click();
  await ann.page.locator('[data-pad=dash]').click();
  expect(await fsCalls(ann.page)).toBe(0);
  expect(await fsCalls(host.page)).toBe(0);

  // Only the corner button (a deliberate tap on it) asks: a request where the API exists, else the sheet.
  const corner = ann.page.locator('.pcg-fullscreen-corner');
  await expect(corner).toBeVisible();
  await corner.click();
  const asked = await fsCalls(ann.page);
  if (asked === 0) await expect(ann.page.locator('.pcg-sheet')).toBeVisible();
  else expect(asked).toBe(1);

  // On the TV, a key other than F does nothing either.
  await host.page.keyboard.press('Enter');
  expect(await fsCalls(host.page)).toBe(0);

  expect(annErrors()).toEqual([]);
  expect(hostErrors()).toEqual([]);
});

test('?debug=1 survives joining and shows Diagnostics; the page links its own manifest', async ({
  browser,
  browserName,
}) => {
  const host = await openHost(browser);
  const context = await phoneContext(browser, browserName);
  const errors = watchErrors(context);
  const page = await context.newPage();
  await page.goto('/play?debug=1');
  await expect(page.locator('.pcg-diag-pill')).toBeVisible();
  await expect(page.locator('[data-screen=joining] .pcg-fullscreen-btn')).toBeVisible();
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/play.webmanifest');

  // Entering a code on the join screen keeps debug=1.
  await page.locator('input.code').fill(host.code);
  await page.getByRole('button', { name: 'Join' }).click();
  await page.waitForURL(new RegExp(`code=${host.code}`));
  expect(new URL(page.url()).searchParams.get('debug')).toBe('1');
  await expect(page.locator('.pcg-diag-pill')).toBeVisible();
  await expect(screen(page, 'lobby')).toBeVisible();
  expect(errors()).toEqual([]);
});
