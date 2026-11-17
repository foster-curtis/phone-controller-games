// Self-test of the controller-compat hostile fixtures (@pcg/game-kit/e2e, controller-compat F4). Runs
// on every compat project (chromium, firefox, webkit). It needs no host: the controller page's dev
// mode is just a page, and sockets are opened straight to this suite's relay.
import { expect, type BrowserContext } from '@playwright/test';
import {
  RELAY_PORT,
  collectPageErrors,
  dropSockets,
  halfOpenSockets,
  installSocketControl,
  newPhoneContext,
  phoneContextOptions,
  removeApis,
  setOffline,
  setVisibility,
  simulateBfcacheRestore,
  test,
} from './helpers';

declare global {
  interface Window {
    __probe: { open: WebSocket; closes: number[]; messages: number };
    __openProbe: () => Promise<void>;
  }
}

/** A page with a probe socket to the relay that has answered a `create`. */
async function probePage(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto('/play.html?dev=1');
  await page.evaluate(async (port) => {
    window.__openProbe = async () => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const probe = { open: ws, closes: [] as number[], messages: 0 };
      window.__probe = probe;
      ws.addEventListener('message', () => (probe.messages += 1));
      ws.addEventListener('close', (ev) => probe.closes.push(ev.code));
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener('open', () => resolve());
        ws.addEventListener('error', () => reject(new Error('socket error')));
      });
      ws.send(JSON.stringify({ t: 'create', game: 'x', maxPlayers: 2 }));
    };
    await window.__openProbe();
  }, RELAY_PORT);
  await expect.poll(() => page.evaluate(() => window.__probe.messages)).toBeGreaterThan(0);
  return page;
}

test.describe('compat fixtures', () => {
  test('phoneContextOptions makes a touch phone viewport', async ({ browser, browserName }) => {
    const context = await browser.newContext(phoneContextOptions(browserName));
    const page = await context.newPage();
    await page.goto('/play.html?dev=1');
    expect(await page.evaluate(() => window.innerWidth)).toBeLessThan(500);
    expect(
      await page.evaluate(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0),
    ).toBe(true);
    await context.close();
  });

  test('removeApis really removes the APIs before page scripts', async ({ browser }) => {
    const context = await newPhoneContext(browser);
    await removeApis(context, [
      'wakeLock',
      'fullscreen',
      'vibrate',
      'orientationLock',
      'clipboard',
    ]);
    const page = await context.newPage();
    await page.goto('/play.html?dev=1');
    const present = await page.evaluate(() => ({
      wakeLock: 'wakeLock' in navigator && !!(navigator as { wakeLock?: unknown }).wakeLock,
      requestFullscreen: !!Element.prototype.requestFullscreen,
      webkitRequestFullscreen: !!(Element.prototype as { webkitRequestFullscreen?: unknown })
        .webkitRequestFullscreen,
      fullscreenEnabled: document.fullscreenEnabled,
      vibrate: !!navigator.vibrate,
      orientationLock: !!(screen.orientation as { lock?: unknown } | undefined)?.lock,
      clipboard: !!navigator.clipboard,
    }));
    expect(present).toEqual({
      wakeLock: false,
      requestFullscreen: false,
      webkitRequestFullscreen: false,
      fullscreenEnabled: false,
      vibrate: false,
      orientationLock: false,
      clipboard: false,
    });
    await context.close();
  });

  test('setVisibility toggles visibilityState and fires visibilitychange', async ({ browser }) => {
    const context = await newPhoneContext(browser);
    const page = await context.newPage();
    await page.goto('/play.html?dev=1');
    await page.evaluate(() => {
      (window as unknown as { seen: string[] }).seen = [];
      document.addEventListener('visibilitychange', () =>
        (window as unknown as { seen: string[] }).seen.push(document.visibilityState),
      );
    });
    await setVisibility(page, 'hidden');
    expect(await page.evaluate(() => [document.visibilityState, document.hidden])).toEqual([
      'hidden',
      true,
    ]);
    await setVisibility(page, 'visible');
    expect(await page.evaluate(() => document.hidden)).toBe(false);
    expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual([
      'hidden',
      'visible',
    ]);
    await context.close();
  });

  test('setOffline flips navigator.onLine and fires the events', async ({ browser }) => {
    const context = await newPhoneContext(browser);
    const page = await context.newPage();
    await page.goto('/play.html?dev=1');
    await page.evaluate(() => {
      (window as unknown as { net: string[] }).net = [];
      for (const name of ['offline', 'online'])
        window.addEventListener(name, () =>
          (window as unknown as { net: string[] }).net.push(name),
        );
    });
    await setOffline(context, page, true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await setOffline(context, page, false);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { net: string[] }).net)).toEqual([
      'offline',
      'online',
    ]);
    await context.close();
  });

  test('dropSockets closes abruptly with code 1006', async ({ browser }) => {
    const context = await newPhoneContext(browser);
    await installSocketControl(context);
    const page = await probePage(context);
    expect(await dropSockets(page)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.__probe.closes)).toEqual([1006]);
    expect(await page.evaluate(() => window.__probe.open.readyState)).toBe(3);
    await context.close();
  });

  test('halfOpenSockets keeps the socket open but silent; later sockets are normal', async ({
    browser,
  }) => {
    const context = await newPhoneContext(browser);
    await installSocketControl(context);
    const page = await probePage(context);
    const before = await page.evaluate(() => window.__probe.messages);
    expect(await halfOpenSockets(page)).toBeGreaterThan(0);
    // The page's send vanishes and nothing comes back, yet the socket never closes.
    await page.evaluate(() =>
      window.__probe.open.send(JSON.stringify({ t: 'create', game: 'x', maxPlayers: 2 })),
    );
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__probe.messages)).toBe(before);
    expect(await page.evaluate(() => window.__probe.open.readyState)).toBe(1);
    expect(await page.evaluate(() => window.__probe.closes)).toEqual([]);
    // A socket opened afterwards behaves normally.
    await page.evaluate(() => window.__openProbe());
    await expect.poll(() => page.evaluate(() => window.__probe.messages)).toBeGreaterThan(0);
    await context.close();
  });

  test('simulateBfcacheRestore fires pagehide/pageshow (persisted) and drops sockets', async ({
    browser,
  }) => {
    const context = await newPhoneContext(browser);
    await installSocketControl(context);
    const page = await probePage(context);
    await page.evaluate(() => {
      (window as unknown as { pt: string[] }).pt = [];
      for (const name of ['pagehide', 'pageshow'])
        window.addEventListener(name, (ev) =>
          (window as unknown as { pt: unknown[] }).pt.push(
            `${name}:${(ev as PageTransitionEvent).persisted}`,
          ),
        );
    });
    await simulateBfcacheRestore(page);
    expect(await page.evaluate(() => (window as unknown as { pt: string[] }).pt)).toEqual([
      'pagehide:true',
      'pageshow:true',
    ]);
    await expect.poll(() => page.evaluate(() => window.__probe.closes)).toEqual([1006]);
    await context.close();
  });

  test('collectPageErrors reports uncaught errors and console.error', async ({ browser }) => {
    const context = await newPhoneContext(browser);
    const page = await context.newPage();
    const errors = collectPageErrors(page);
    await page.goto('/play.html?dev=1');
    await page.evaluate(() => {
      console.error('boom');
      setTimeout(() => {
        throw new Error('late');
      }, 0);
    });
    await expect.poll(() => errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.join('\n')).toContain('console.error: boom');
    expect(errors.join('\n')).toContain('pageerror: late');
    await context.close();
  });
});
