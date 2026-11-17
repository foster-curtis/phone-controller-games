// Controller compatibility (controller-compat F5; PLATFORM §3, decision #13): runs on chromium, firefox
// and webkit. A phone with every optional API removed joins, plays and survives each hostile
// connection event (half-open socket, dropped sockets, hidden/visible, offline/online, bfcache
// restore) with the same player and slot, and no full screen ever starts without a button tap.
// Sim time is frozen and stepped through `__pcg`, as in reconnect.spec.ts.
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  closeContexts,
  collectPageErrors,
  dropSockets,
  freeze,
  halfOpenSockets,
  installSocketControl,
  openHost,
  phoneContextOptions,
  readyUp,
  removeApis,
  serveFonts,
  setOffline,
  setVisibility,
  simulateBfcacheRestore,
  stepped,
  stepUntil,
  test,
  url,
  type Host,
  type Phone,
} from './helpers';

test.afterEach(closeContexts);

// The browsers log failed loads and sockets on their own while the network is cut: not page errors.
const BENIGN = /Failed to load resource|WebSocket connection|net::ERR|NS_ERROR|Load failed/i;
const realErrors = (errors: string[]) => errors.filter((e) => !BENIGN.test(e));

type BrowserName = 'chromium' | 'firefox' | 'webkit';

interface CompatPhone extends Phone {
  errors: string[];
}

interface CompatOptions {
  removeAll?: boolean;
  spy?: boolean;
}

/** A phone like the real thing in this engine, with the socket fixtures installed from the start. */
async function newCompatContext(
  browser: Browser,
  browserName: BrowserName,
  opts: CompatOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext(phoneContextOptions(browserName, { landscape: true }));
  await serveFonts(context);
  await installSocketControl(context);
  if (opts.spy) {
    // Counts full-screen requests without really going full screen; only where the engine has the API.
    await context.addInitScript(() => {
      const w = window as unknown as { __fsCalls: number };
      w.__fsCalls = 0;
      for (const key of ['requestFullscreen', 'webkitRequestFullscreen'] as const) {
        const proto = Element.prototype as unknown as Record<string, unknown>;
        if (typeof proto[key] !== 'function') continue;
        proto[key] = () => {
          w.__fsCalls += 1;
          return Promise.resolve();
        };
      }
    });
  }
  if (opts.removeAll) {
    await removeApis(context, [
      'wakeLock',
      'fullscreen',
      'vibrate',
      'orientationLock',
      'clipboard',
    ]);
  }
  return context;
}

async function joinCompat(
  browser: Browser,
  browserName: BrowserName,
  code: string,
  name: string,
  opts: CompatOptions = {},
): Promise<CompatPhone> {
  const context = await newCompatContext(browser, browserName, opts);
  const page = await context.newPage();
  const errors = collectPageErrors(page);
  await page.goto(url(`/play?code=${code}`));
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'JOIN' }).click();
  const pick = page.locator('.screen.lobby .pick');
  await expect(pick).toBeVisible();
  await pick.click();
  await expect(page.locator('.screen.lobby .ready')).toBeVisible();
  return { context, page, name, errors };
}

const playerIdOf = (page: Page) => page.locator('#app').getAttribute('data-player-id');

/** Sockets the page has opened so far, and how many of them are open and working. */
function socketCounts(page: Page): Promise<{ total: number; live: number }> {
  return page.evaluate(() => {
    type S = WebSocket & { __pcgHalf?: boolean; __pcgDropped?: boolean };
    const all = (window as unknown as { __pcgSockets: { sockets: S[] } }).__pcgSockets.sockets;
    return {
      total: all.length,
      live: all.filter((s) => s.readyState === 1 && !s.__pcgHalf && !s.__pcgDropped).length,
    };
  });
}

/** The host sees the phone's player once, connected, in the same slot, and nobody twice. */
async function expectSamePlayer(
  host: Host,
  phone: CompatPhone,
  want: { playerId: string; slot: number | null },
) {
  await expect
    .poll(
      stepped(host, async () => {
        const mine = (await host.page.evaluate(() => window.__pcg!.players())).filter(
          (p) => p.name === phone.name,
        );
        return mine.length === 1 && mine[0]!.connected ? mine[0]! : null;
      }),
    )
    .toMatchObject({ playerId: want.playerId, slot: want.slot });
  const names = await host.page.evaluate(
    () => window.__pcg!.team()?.roster.map((r) => r.name) ?? [],
  );
  expect(new Set(names).size).toBe(names.length);
  expect(names.length).toBe(2);
}

/** After a socket event, the phone is back on a working socket (a new one, if `before` is given). */
async function expectRecovered(phone: CompatPhone, before: number | null, timeout: number) {
  await expect
    .poll(async () => (await socketCounts(phone.page)).live, { timeout })
    .toBeGreaterThanOrEqual(1);
  if (before !== null) {
    await expect
      .poll(async () => (await socketCounts(phone.page)).total, { timeout })
      .toBeGreaterThan(before);
  }
  await expect(phone.page.locator('[data-overlay=reconnecting]')).toBeHidden({ timeout });
}

test('a phone with no optional APIs plays through every hostile connection event', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(240_000);
  const host = await openHost(browser);
  const hostErrors = collectPageErrors(host.page);
  await freeze(host);
  // The TV's own full-screen button is mounted on the lobby (hidden only where the API is missing).
  await expect(host.page.locator('.pcg-fullscreen-btn')).toBeAttached();

  const ann = await joinCompat(browser, browserName, host.code, 'Ann', { removeAll: true });
  const bob = await joinCompat(browser, browserName, host.code, 'Bob');
  // The manual full-screen button is on the phone lobby (inline).
  await expect(ann.page.locator('.screen.lobby .fs-inline')).toBeVisible();
  await readyUp([ann, bob]);
  await stepUntil(host, { phase: 'build' });
  await expect(ann.page.locator('.screen.build')).toBeVisible();
  // ... and the corner icon is on the controller, clear of the controls.
  await expect(ann.page.locator('.pcg-fullscreen-corner')).toBeVisible();

  const me = (await host.page.evaluate(() => window.__pcg!.players())).find(
    (p) => p.name === 'Ann',
  )!;
  const want = { playerId: me.playerId, slot: me.slot };
  const phoneId = await playerIdOf(ann.page);
  expect(phoneId).toBeTruthy();

  // Input from the left half: a stick drag, sent again after every recovery.
  const drag = async () => {
    const vp = ann.page.viewportSize()!;
    await ann.page.mouse.move(vp.width * 0.2, vp.height * 0.7);
    await ann.page.mouse.down();
    await ann.page.mouse.move(vp.width * 0.2 + 40, vp.height * 0.7, { steps: 3 });
    await ann.page.mouse.up();
  };
  await drag();

  // [label, action, allowed ms, opens a new socket]
  const events: Array<[string, () => Promise<void>, number, boolean]> = [
    // Silently dead socket: only the phone's own heartbeat (12 s) can notice.
    ['half-open', async () => void (await halfOpenSockets(ann.page)), 25_000, true],
    ['dropped', async () => void (await dropSockets(ann.page)), 15_000, true],
    [
      'hidden → visible',
      async () => {
        await setVisibility(ann.page, 'hidden');
        await setVisibility(ann.page, 'visible');
      },
      15_000,
      false,
    ],
    [
      'offline → online',
      async () => {
        await setOffline(ann.context, ann.page, true);
        await ann.page.waitForTimeout(500);
        await setOffline(ann.context, ann.page, false);
      },
      25_000,
      false,
    ],
    ['bfcache restore', () => simulateBfcacheRestore(ann.page), 15_000, true],
  ];
  for (const [label, act, timeout, reopens] of events) {
    const before = (await socketCounts(ann.page)).total;
    await act();
    await expectRecovered(ann, reopens ? before : null, timeout);
    await expectSamePlayer(host, ann, want);
    expect(await playerIdOf(ann.page), label).toBe(phoneId);
    await drag();
  }

  await expect(ann.page.locator('.screen.build')).toBeVisible();
  expect(realErrors(ann.errors)).toEqual([]);
  expect(realErrors(bob.errors)).toEqual([]);
  expect(realErrors(hostErrors)).toEqual([]);
});

test('full screen never starts without a button tap', async ({ browser, browserName }) => {
  test.setTimeout(90_000);
  const host = await openHost(browser);
  const calls = (page: Page) =>
    page.evaluate(() => (window as unknown as { __fsCalls?: number }).__fsCalls ?? 0);
  const ann = await joinCompat(browser, browserName, host.code, 'Ann', { spy: true });
  const armed = await ann.page.evaluate(
    () => typeof (Element.prototype as { requestFullscreen?: unknown }).requestFullscreen,
  );

  // Joining, picking a knight, tapping around and readying up: none of it asks for full screen.
  // Known non-button spots only (never `.pcg-fullscreen-btn`): the knight name and the room code.
  await ann.page.locator('.screen.lobby .knight-name').click();
  await ann.page.locator('.screen.lobby .room-code').click({ force: true });
  await ann.page.locator('.screen.lobby .ready').click();
  await expect(ann.page.locator('.screen.lobby .ready')).toHaveAttribute('aria-pressed', 'true');
  expect(await calls(ann.page)).toBe(0);

  // A tap on the button is a deliberate request, and the only kind.
  if (armed === 'function') {
    await ann.page.locator('.screen.lobby .fs-inline').click();
    await expect.poll(() => calls(ann.page)).toBeGreaterThanOrEqual(1);
  }
  expect(realErrors(ann.errors)).toEqual([]);
});

test('?debug=1 survives joining by code and shows the Diagnostics pill', async ({
  browser,
  browserName,
}) => {
  test.setTimeout(90_000);
  const host = await openHost(browser);
  const context = await newCompatContext(browser, browserName);
  const page = await context.newPage();
  const errors = collectPageErrors(page);
  await page.goto(url('/play?debug=1'));
  await expect(page.locator('.pcg-diag-pill')).toBeVisible();
  await page.getByLabel('Room code').fill(host.code);
  await page.getByRole('button', { name: 'JOIN' }).click();
  await expect(page.getByLabel('Your name')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('debug')).toBe('1');
  await expect(page.locator('.pcg-diag-pill')).toBeVisible();
  expect(realErrors(errors)).toEqual([]);
});
