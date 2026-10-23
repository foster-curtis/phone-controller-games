// Host visibility pause (SPEC §8): host tab hidden → phones show gamePaused; visible → they leave it.
import { expect, test, type Page } from '@playwright/test';
import { joinPhone, openHost, playerByName, screen, startMatch } from './helpers';

async function setHostVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('hiding the host pauses the phones; showing it resumes', async ({ browser }) => {
  const host = await openHost(browser);
  const ann = await joinPhone(browser, host.code, 'Ann');
  const bob = await joinPhone(browser, host.code, 'Bob');
  await playerByName(host, 'Bob');
  await startMatch(host, ann);
  await expect(screen(ann.page, 'playing')).toBeVisible();

  await setHostVisibility(host.page, 'hidden');
  await expect(screen(ann.page, 'gamePaused')).toBeVisible();
  await expect(screen(bob.page, 'gamePaused')).toBeVisible();
  expect(await host.page.evaluate(() => window.__pcg!.view().paused)).toBe(true);

  await setHostVisibility(host.page, 'visible');
  await expect(screen(ann.page, 'gamePaused')).toHaveCount(0);
  await expect(screen(bob.page, 'gamePaused')).toHaveCount(0);
  await expect(screen(ann.page, 'playing')).toBeVisible();
  await expect(screen(bob.page, 'playing')).toBeVisible();
  expect(await host.page.evaluate(() => window.__pcg!.view().paused)).toBe(false);
});
