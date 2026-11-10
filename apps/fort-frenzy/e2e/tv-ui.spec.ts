// FF5: every `?ui=<screen>` sample renders at 1920×1080 and 1280×720 with every element inside the
// 96 px TV-safe margin (edge washes excepted) and no console errors. Screenshots: e2e/__screens__/tv-*.png.
import { expect } from '@playwright/test';
import { test } from './helpers';

const SCREENS = [
  'loading',
  'home',
  'lobby',
  'countdown',
  'combat',
  'low-hp',
  'boss',
  'build',
  'victory',
  'defeat',
  'summary',
  'restoring',
  'outdated',
];
const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
];

for (const size of SIZES) {
  for (const name of SCREENS) {
    test(`ui=${name} at ${size.width}×${size.height}`, async ({ page }) => {
      await page.setViewportSize(size);
      // Offline and deterministic: no Google Fonts.
      await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (
          m.type() === 'error' &&
          !/fonts\.(googleapis|gstatic)|ERR_FAILED|ERR_BLOCKED/.test(m.text())
        )
          errors.push(m.text());
      });
      await page.goto(`/?ui=${name}`);
      await expect(page.locator('#tv-ui .sec').first()).toBeAttached();
      // images (portraits, enemy art) are in before the shot and the box checks
      await page.waitForFunction(() => [...document.images].every((i) => i.complete));
      await page.waitForTimeout(450); // entrance animations

      const bad = await page.evaluate(() => {
        const root = document.querySelector('#tv-ui')!;
        const r = root.getBoundingClientRect();
        const s = r.width / 1920;
        const out: string[] = [];
        for (const el of root.querySelectorAll('*')) {
          if (el.classList.contains('layer') || el.closest('[data-edge]')) continue;
          if (el.closest('svg') && el.tagName !== 'svg') continue;
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          const x0 = (b.left - r.left) / s;
          const y0 = (b.top - r.top) / s;
          const x1 = (b.right - r.left) / s;
          const y1 = (b.bottom - r.top) / s;
          if (x0 < 95.5 || y0 < 95.5 || x1 > 1824.5 || y1 > 984.5) {
            out.push(
              `${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 40)} ${[x0, y0, x1, y1].map(Math.round)}`,
            );
          }
        }
        return out;
      });
      expect(bad).toEqual([]);

      await page.screenshot({
        path: `e2e/__screens__/tv-${name}-${size.width}.png`,
      });
      expect(errors).toEqual([]);
    });
  }
}

test('home: keyboard moves focus and cycles difficulty', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto('/?ui=home');
  const focused = () => page.locator('#tv-ui .row.focus .lbl').innerText();
  expect((await focused()).toLowerCase()).toBe('create room');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect((await focused()).toLowerCase()).toBe('difficulty');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tv-ui .row.focus .val')).toContainText('Hard');
});

test('lobby: a slot number arms, the second press removes', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto('/?ui=lobby');
  await expect(page.locator('#tv-ui .slot:not(.open)')).toHaveCount(4);
  await page.keyboard.press('2');
  await expect(page.locator('#tv-ui .slot.armed')).toHaveCount(1);
  await page.keyboard.press('2');
  await expect(page.locator('#tv-ui .slot:not(.open)')).toHaveCount(3);
});

test('C1 notes: lobby QR is right-aligned; next-wave card and icons are bigger', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto('/?ui=lobby');
  const qr = await page.locator('#tv-ui .lobby .qrbox').boundingBox();
  expect(Math.abs(qr!.x + qr!.width - 1824)).toBeLessThanOrEqual(1);
  await page.goto('/?ui=build');
  const card = await page.locator('#tv-ui .hud-preview').boundingBox();
  expect(card!.height).toBeGreaterThanOrEqual(120); // was 77
  expect(card!.width).toBeGreaterThanOrEqual(1000); // was 720
  const tile = await page.locator('#tv-ui .eny .tile').first().boundingBox();
  expect(tile!.width).toBeGreaterThanOrEqual(100); // was 52
  expect(tile!.height).toBeGreaterThanOrEqual(76); // was 38
});
