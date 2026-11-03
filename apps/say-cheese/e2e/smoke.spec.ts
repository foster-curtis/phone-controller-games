// SC0 smoke (BUILD_PLAN §3): both entries load with the brand head and no page errors, and a phone
// page gets Chromium's fake camera (SPEC §3) as a live MediaStream.
import { closeContexts, expect, newPhone, test } from './helpers';

test.afterEach(closeContexts);

for (const [path, entry] of [
  ['/', 'host'],
  ['/play', 'controller'],
  ['/play?code=ABCD', 'controller'],
] as const) {
  test(`${path} loads the ${entry} entry`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.locator('body')).toHaveAttribute('data-entry', entry);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.getByText('Cheese!')).toBeVisible();
    // brand.css is applied (ink background).
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor))
      .toBe('rgb(20, 22, 26)');
    expect(errors).toEqual([]);
  });
}

test('a phone gets a live fake-camera stream', async ({ browser }) => {
  const context = await newPhone(browser);
  const page = await context.newPage();
  await page.goto('/play');
  const track = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    const [video] = stream.getVideoTracks();
    const result = { kind: video?.kind, state: video?.readyState };
    stream.getTracks().forEach((t) => t.stop());
    return result;
  });
  expect(track).toEqual({ kind: 'video', state: 'live' });
});
