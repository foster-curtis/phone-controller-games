// FF1 smoke: both entries load (host `/`, phone `/play`) with the brand head and no page errors.
// Later milestones replace this with the lobby → combat smoke (SPEC §15.9).
import { expect, test } from '@playwright/test';

for (const [path, entry] of [
  ['/', 'host'],
  ['/play?code=ABCD', 'controller'],
] as const) {
  test(`${path} loads the ${entry} entry`, async ({ page }) => {
    // Offline and deterministic: no Google Fonts.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.locator('body')).toHaveAttribute('data-entry', entry);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    // brand.css is applied (ink background).
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(20, 22, 26)');
    expect(errors).toEqual([]);
  });
}
