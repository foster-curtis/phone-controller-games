import { expect } from '@playwright/test';
import { test } from './helpers';

test('controller results breakdown 640x360', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/play.html?dev=1');
  await page.locator('.dev-toggle').click();
  await page.locator('[data-dev-screen=results]').click();
  await page.locator('.dev-toggle').click();
  await expect(page.locator('[data-screen=results] [data-section=breakdown]')).toBeVisible();
  await expect(page.locator('[data-leader=next]')).toBeVisible();
  await page.screenshot({ path: 'e2e/__screens__/controller-results-640.png' });
  const box = await page.locator('[data-leader=next]').boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(360);
});
