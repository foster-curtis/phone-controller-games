// FF3 gallery (BUILD_PLAN FF3 acceptance): every page loads with no console errors and no fallback
// shapes (every frame it draws is in the atlas), and writes e2e/__screens__/gallery-<page>.png.
import { expect, test, type Page } from '@playwright/test';

const PAGES = ['rigs', 'turrets', 'citadel', 'autotiles', 'effects', 'icons', 'map'] as const;

test.use({ viewport: { width: 1920, height: 1080 } });

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function open(page: Page, query: string) {
  // Offline and deterministic: no Google Fonts (an empty stylesheet, so nothing logs a load error).
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(`/?gallery=1&${query}`);
  await page.waitForFunction(() => window.__pcgGallery?.ready === true, undefined, {
    timeout: 30_000,
  });
  // Let clips, bursts and the bloom run a few frames.
  await page.waitForTimeout(700);
}

for (const name of PAGES) {
  test(`gallery ${name}`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, `page=${name}&panel=0&clip=walk&hitbox=${name === 'rigs' ? 1 : 0}`);
    const probe = await page.evaluate(() => window.__pcgGallery!);
    expect(probe.missing).toEqual([]);
    expect(probe.fallbacks).toBe(0);
    await page.screenshot({ path: `e2e/__screens__/gallery-${name}.png` });
    expect(errors).toEqual([]);
  });
}

test('gallery rigs unlit, Colossus final, Mk III mortar', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'page=rigs&panel=0&unlit=1&colossus=4&tier=3&gauge=7&color=rose');
  const probe = await page.evaluate(() => window.__pcgGallery!);
  expect(probe.fallbacks).toBe(0);
  await page.screenshot({ path: 'e2e/__screens__/gallery-rigs-unlit.png' });
  expect(errors).toEqual([]);
});

// FF3-fix-1 (C1 notes): enemy hit and death, the knights' down pile and respawn; FF7: the Ranger's
// shot, super and build kneel and the Drone's slash; FF8: the Warden's slam (attack), stomp (super)
// and kneel-and-tap (build) per view with their shockwaves, and the mortar's fire recoil (attack).
for (const clip of ['hit', 'death', 'down', 'respawn', 'attack', 'super', 'build'] as const) {
  test(`gallery rigs ${clip}`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, `page=rigs&panel=0&clip=${clip}`);
    await page.waitForTimeout(1200);
    const probe = await page.evaluate(() => window.__pcgGallery!);
    expect(probe.fallbacks).toBe(0);
    await page.screenshot({ path: `e2e/__screens__/gallery-rigs-${clip}.png` });
    expect(errors).toEqual([]);
  });
}

// FF8: the autotiles page's structure states (net discharges, build sketch and fill, destroyed
// collapse, charged and damaged walls, Mason sparks) run their loops with no fallback shapes.
test('gallery autotiles states over a loop', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'page=autotiles&panel=0');
  await page.waitForTimeout(2000);
  const probe = await page.evaluate(() => window.__pcgGallery!);
  expect(probe.fallbacks).toBe(0);
  await page.screenshot({ path: 'e2e/__screens__/gallery-autotiles-states.png' });
  expect(errors).toEqual([]);
});

test('gallery stress', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page, 'stress=1');
  await page.waitForTimeout(1500);
  const probe = await page.evaluate(() => window.__pcgGallery!);
  expect(probe.fallbacks).toBe(0);
  const stats = await page.evaluate(
    () => (window as unknown as { __pcgStress?: { frameMs: number } }).__pcgStress,
  );
  expect(stats?.frameMs).toBeGreaterThan(0);
  await page.screenshot({ path: 'e2e/__screens__/gallery-stress.png' });
  expect(errors).toEqual([]);
});
