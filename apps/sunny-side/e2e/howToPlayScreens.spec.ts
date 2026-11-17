// Screenshots for visual review of the How to play cards (gitignored output in e2e/__screens__/).
import { expect, type Browser } from '@playwright/test';
import { closeContexts, joinPhone, leaderTap, openHost, screen, test } from './helpers';

test.afterEach(closeContexts);
test.setTimeout(120_000);

async function shoot(browser: Browser, n: number, name: string, reduced = false) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.abort());
  const page = await context.newPage();
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/?debug=1&howto=${n}`);
  await expect(page.locator('.pcg-rules')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `e2e/__screens__/${name}.png` });
  await context.close();
}

for (let n = 1; n <= 6; n++) {
  test(`screenshot card ${n}`, async ({ browser }) => {
    await shoot(browser, n, `htp-card-${n}`);
  });
}

test('screenshot card 3 with reduced motion', async ({ browser }) => {
  await shoot(browser, 3, 'htp-card-3-still', true);
});

test('screenshot leader phone rules screen', async ({ browser }) => {
  const host = await openHost(browser);
  const ann = await joinPhone(browser, host.code, 'Ann');
  await joinPhone(browser, host.code, 'Bob');
  await leaderTap(ann, 'start');
  await expect(screen(ann.page, 'rules')).toBeVisible();
  await ann.page.screenshot({ path: 'e2e/__screens__/htp-phone-leader.png' });
  // The real flow (not the preview) on the TV, for comparison.
  await host.page.setViewportSize({ width: 1920, height: 1080 });
  await host.page.waitForTimeout(2500);
  await host.page.screenshot({ path: 'e2e/__screens__/htp-host-real.png' });
  for (let i = 1; i <= 5; i++) {
    await leaderTap(ann, 'next');
    await expect.poll(() => host.page.evaluate(() => window.__pcg!.rules()?.card)).toBe(i);
    if (i >= 3) {
      await host.page.waitForTimeout(2500);
      await host.page.screenshot({ path: `e2e/__screens__/htp-host-real-${i + 1}.png` });
    }
  }
});
