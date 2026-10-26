// On-screen keyboard: the name step and the lobby rename popup stay visible above it. A keyboard
// is simulated by shrinking the viewport height at the same width (what the visual viewport does).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { blockFonts, joinPhone, openHost, screen } from './helpers';

const W = 568;
const H = 320;
const KEYBOARD_H = 180;

async function expectInView(page: Page, ...items: Locator[]) {
  const vh = page.viewportSize()!.height;
  for (const item of items) {
    const b = (await item.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y + b.height).toBeLessThanOrEqual(vh);
  }
}

test('name step and rename popup stay above the keyboard', async ({ browser }) => {
  const host = await openHost(browser);
  await joinPhone(browser, host.code, 'Ann');
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  await blockFonts(context);
  const page = await context.newPage();
  await page.goto(`/play?code=${host.code}`);
  await expect(screen(page, 'lobby')).toBeVisible();

  // Name step.
  const input = page.locator('input[name=name]');
  await input.focus();
  await page.setViewportSize({ width: W, height: H - KEYBOARD_H });
  await expect(screen(page, 'lobby')).toHaveClass(/kb-open/);
  await expectInView(page, input, page.getByRole('button', { name: 'Next' }));
  await input.fill('Bob');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.setViewportSize({ width: W, height: H });
  await expect(screen(page, 'lobby')).not.toHaveClass(/kb-open/);

  // Rename popup.
  await page.locator('[data-rename]').click();
  const popup = page.locator('[data-popup=rename]');
  await popup.locator('input[name=name]').focus();
  await page.setViewportSize({ width: W, height: H - KEYBOARD_H });
  await expect(popup).toHaveClass(/kb-open/);
  await expectInView(
    page,
    popup.locator('input[name=name]'),
    popup.getByRole('button', { name: 'Cancel' }),
    popup.getByRole('button', { name: 'Save' }),
  );
  await popup.locator('input[name=name]').fill('Bobby');
  await popup.getByRole('button', { name: 'Save' }).click();
  await expect(popup).toHaveCount(0);
  await expect(page.locator('.lobby-name .name')).toHaveText('Bobby');
});
