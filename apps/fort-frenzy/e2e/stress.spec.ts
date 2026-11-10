// FF15 in-game stress mode (`?debug=1&stress=1`): the real sim and World scene at the SPEC §15.2 peak
// load run with no console errors and no fallback shapes, and the overlay reports frame and sim step
// times. The numbers themselves are judged on the target laptop (software GL here, BUILD_PLAN §8).
import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1920, height: 1080 } });

interface StressProbe {
  frameMs: number;
  simMs: number | null;
  simP99Ms: number | null;
  fallbacks: number;
}

test('in-game stress mode', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // Offline: no Google Fonts (an empty stylesheet, so nothing logs a load error).
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto('/?debug=1&stress=1');
  const probe = () =>
    page.evaluate(() => (window as unknown as { __pcgStress?: StressProbe }).__pcgStress ?? null);
  await expect
    .poll(async () => (await probe())?.simMs ?? 0, { timeout: 60_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  const stats = (await probe())!;
  expect(stats.frameMs).toBeGreaterThan(0);
  expect(stats.simP99Ms).toBeGreaterThan(0);
  expect(stats.fallbacks).toBe(0);
  await page.screenshot({ path: 'e2e/__screens__/stress.png' });
  expect(errors).toEqual([]);
});
