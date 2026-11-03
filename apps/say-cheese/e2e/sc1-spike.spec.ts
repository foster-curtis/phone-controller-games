// SC1 camera spike (BUILD_PLAN §3 SC1; SPEC §7.4): the fake camera's frames travel as JPEG chunks
// through the real relay to <img>s on the TV, every photo is acked, and no frame ever exceeds the
// relay's payload cap (which would close the socket with 1009).
import type { Page } from '@playwright/test';
import { blockFonts, closeContexts, expect, newPhone, test, TV_VIEWPORT } from './helpers';

test.afterEach(closeContexts);

/** The e2e relay (playwright.config.ts); Vite's HMR socket is on the page's own port. */
const RELAY = /^ws:\/\/localhost:8788\//;

/** Records every relay WebSocket a page opens and whether it closed. */
function watchSockets(page: Page): { opened: string[]; closed: string[] } {
  const log = { opened: [] as string[], closed: [] as string[] };
  page.on('websocket', (ws) => {
    if (!RELAY.test(ws.url())) return;
    log.opened.push(ws.url());
    ws.on('close', () => log.closed.push(ws.url()));
  });
  return log;
}

test('three shots arrive on the TV as photos ≤ 800 px, all acked', async ({ browser }) => {
  const tvContext = await browser.newContext({ viewport: TV_VIEWPORT });
  await blockFonts(tvContext);
  const tv = await tvContext.newPage();
  const errors: string[] = [];
  tv.on('pageerror', (e) => errors.push(e.message));
  const tvSockets = watchSockets(tv);
  await tv.goto('/spike');
  await expect(tv.locator('body')).toHaveAttribute('data-entry', 'spike');
  await expect(tv.locator('#spike')).toHaveAttribute('data-code', /^[A-Z]{4}$/, {
    timeout: 20_000,
  });
  const code = (await tv.locator('#spike').getAttribute('data-code'))!;

  const phoneContext = await newPhone(browser);
  const phone = await phoneContext.newPage();
  phone.on('pageerror', (e) => errors.push(e.message));
  const phoneSockets = watchSockets(phone);
  await phone.goto(`/spike?code=${code}`);
  await expect(phone.getByText('Relay: open')).toBeVisible();
  await phone.getByRole('button', { name: 'Enable camera' }).click();
  await expect(phone.getByText('Camera: ok')).toBeVisible();

  const shoot = phone.getByRole('button', { name: 'Shoot' });
  for (let i = 0; i < 3; i++) {
    await expect(shoot).toBeEnabled(); // the 0.4 s cooldown has passed
    await shoot.click();
    await expect(phone.locator('li[data-photo]')).toHaveCount(i + 1);
  }

  await expect(phone.locator('li[data-acked=true]')).toHaveCount(3);
  const imgs = tv.locator('.spike-photo img');
  await expect(imgs).toHaveCount(3);
  await expect
    .poll(() => imgs.evaluateAll((els) => els.every((e) => (e as HTMLImageElement).complete)))
    .toBe(true);
  const sizes = await imgs.evaluateAll((els) =>
    els.map((e) => [(e as HTMLImageElement).naturalWidth, (e as HTMLImageElement).naturalHeight]),
  );
  for (const [w, h] of sizes) {
    const long = Math.max(w!, h!);
    expect(long).toBeGreaterThan(0);
    expect(long).toBeLessThanOrEqual(800);
  }

  // One socket each, never closed (an oversize frame would have closed it with 1009).
  expect(phoneSockets.opened).toHaveLength(1);
  expect(phoneSockets.closed).toEqual([]);
  expect(tvSockets.opened).toHaveLength(1);
  expect(tvSockets.closed).toEqual([]);
  expect(errors).toEqual([]);
});
