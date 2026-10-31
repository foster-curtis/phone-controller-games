// FF4: the phone controller at /play?dev=1 on real landscape viewports. Every dev sample screen renders
// without console errors or page errors, the combat layout holds its rules in the browser, and each
// screen is screenshotted to e2e/__screens__/controller-<viewport>-<screen>.png (gitignored output).
import { expect, test, type Page } from '@playwright/test';
import { SAMPLE_IDS } from '../src/controller/samples';

const VIEWPORTS = [
  { width: 640, height: 360 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
];

async function open(page: Page, screen: string) {
  // Offline and deterministic: no Google Fonts.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.goto(`/play?dev=1&screen=${screen}`);
  await expect(page.locator('.screen-host .screen')).toBeVisible();
  // The icon sprite is fetched; wait for it so screenshots show glyphs.
  await expect(page.locator('#icon-sprite')).toHaveCount(1);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp, hasTouch: true });

    test('every sample screen renders without console errors', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`console: ${m.text()}`);
      });
      await open(page, 'combat');
      for (const id of SAMPLE_IDS) {
        await page.locator(`[data-dev-screen="${id}"]`).evaluate((b) => (b as HTMLElement).click());
        await expect(page.locator('.screen-host .screen')).toBeVisible();
        // The Shop-tab samples click the tab on the next tick.
        await page.waitForTimeout(60);
        await page.screenshot({
          path: `e2e/__screens__/controller-${vp.width}x${vp.height}-${id}.png`,
        });
      }
      for (const name of ['reconnecting', 'hostAway', 'rotate', 'refreshTv']) {
        await page
          .locator(`[data-dev-overlay="${name}"]`)
          .evaluate((b) => (b as HTMLElement).click());
        await expect(page.locator('.overlay')).toBeVisible();
        await page.screenshot({
          path: `e2e/__screens__/controller-${vp.width}x${vp.height}-overlay-${name}.png`,
        });
        await page
          .locator(`[data-dev-overlay="${name}"]`)
          .evaluate((b) => (b as HTMLElement).click());
      }
      expect(errors).toEqual([]);
    });

    test('combat layout: buttons clear of the right and bottom edges, gaps and sizes hold', async ({
      page,
    }) => {
      await open(page, 'combat');
      const boxes = await page.evaluate(() => {
        const r = (sel: string) => {
          const face = document.querySelector(`${sel} .round-face`) as HTMLElement;
          const b = face.getBoundingClientRect();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        };
        return {
          main: r('.round-btn.main'),
          sup: r('.round-btn.super'),
          action: r('.round-btn.action'),
        };
      });
      const list = Object.values(boxes);
      for (const b of list) {
        expect(b.w).toBeGreaterThanOrEqual(56);
        expect(vp.width - (b.x + b.w)).toBeGreaterThanOrEqual(64);
        expect(vp.height - (b.y + b.h)).toBeGreaterThanOrEqual(64);
      }
      const gap = (a: (typeof list)[number], b: (typeof list)[number]) =>
        Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2)) -
        a.w / 2 -
        b.w / 2;
      expect(gap(boxes.main, boxes.sup)).toBeGreaterThanOrEqual(24);
      expect(gap(boxes.main, boxes.action)).toBeGreaterThanOrEqual(24);
      expect(gap(boxes.sup, boxes.action)).toBeGreaterThanOrEqual(24);
    });

    test('touching the main button reaches the tuple readout (tap = a fire)', async ({ page }) => {
      await open(page, 'combat');
      const main = page.locator('.round-btn.main');
      const box = (await main.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      // Engineer: main is aimed; a tap fires with aim 0,0 (mainFires is slot 7).
      await expect
        .poll(async () => (await page.locator('.dev-readout').textContent()) ?? '')
        .toMatch(/^\[0, 0, 0, 0, 0, 0, 0, 1, /);
    });
  });
}

// C1 note (FF4-fix-1): the open screen picker covered the "dev" button, so it could not be closed.
// Real clicks (no evaluate, no force) so a covered toggle fails the actionability check.
test.describe('dev toggle', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

  test('the dev button opens and closes the picker', async ({ page }) => {
    await open(page, 'combat');
    const toggle = page.locator('.dev-toggle');
    const panel = page.locator('.dev-panel');
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(toggle).toBeVisible();
    // Picking a screen keeps the picker open; the toggle still closes it.
    await page.locator('[data-dev-screen="lobby"]').click();
    await toggle.click();
    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(panel).toBeVisible();
  });
});
