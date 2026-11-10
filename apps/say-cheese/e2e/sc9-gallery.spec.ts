// SC9 TV polish (BUILD_PLAN §3 SC9; SPEC §6.6, decision #22): `/?gallery=1` renders every phase with no
// console errors and saves screenshots for C4; tied winners share the podium; the review shows tag
// circles without name labels beside a player column with counts; reduced motion is respected.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test, TV_VIEWPORT } from './helpers';

const SCREENS = resolve(import.meta.dirname, '__screens__');
const PHASES = [
  'lobby',
  'rules',
  'pass',
  'announce',
  'scatter',
  'shoot',
  'upload',
  'review',
  'results',
  'matchEnd',
];

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    // The blocked Google Fonts requests (helpers `blockFonts`) are expected to fail.
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url)) {
      errors.push(m.text());
    }
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

test.beforeAll(() => mkdirSync(SCREENS, { recursive: true }));
test.use({ viewport: TV_VIEWPORT });

test('the gallery renders every phase without console errors and saves screenshots', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = watchConsole(page);
  await page.clock.install({ time: 0 });
  await page.goto('/?gallery=1');
  await page.clock.pauseAt(1000); // paused: only runFor() moves time, so each step is one view
  const seen = new Set<string>();
  // The gallery steps every 4 s; the paused fake clock fast-forwards exactly that.
  for (let i = 0; i < 13; i++) {
    const tv = page.locator('#tv');
    const phase = (await tv.getAttribute('data-tv'))!;
    seen.add(phase);
    await page.waitForTimeout(1500); // let the entrance animation settle
    await page.screenshot({
      path: resolve(SCREENS, `sc9-${String(i).padStart(2, '0')}-${phase}.png`),
    });
    await page.clock.runFor(4000);
  }
  expect([...seen].sort()).toEqual([...PHASES].sort());
  expect(errors).toEqual([]);
});

test('a tie of two winners shows both on the podium', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?gallery=1&phase=matchEnd');
  const first = page.locator('.podium .step[data-place="1"] .chip');
  await expect(first).toHaveText(['Ben', 'Eli']);
  await expect(page.locator('.winners .chip')).toHaveCount(2);
  await expect(page.getByText('Hardest to photograph')).toBeVisible();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: resolve(SCREENS, 'sc9-podium-tie.png') });
  expect(errors).toEqual([]);
});

test('the review print is large, tags are bare circles, the column lists counts', async ({
  page,
}) => {
  await page.goto('/?gallery=1&phase=review');
  const box = page.locator('.view.review .photo-box');
  await expect(page.locator('.view.review img.photo')).toBeVisible();
  const tags = page.locator('.view.review [data-tag]');
  expect(await tags.count()).toBeGreaterThan(3);
  // No name label on the photo: no label element, and nothing visible inside a tag but the "?".
  await expect(page.locator('.view.review .tag-name')).toHaveCount(0);
  const shown = await tags.evaluateAll((els) =>
    els.flatMap((e) =>
      [...e.children].flatMap((c) => {
        const r = c.getBoundingClientRect(); // the .sr name is a 1 px clipped box
        return r.width > 2 || r.height > 2 ? [c.textContent] : [];
      }),
    ),
  );
  expect(shown).toEqual(['?']);
  // The column: every dodger with a count, in their color.
  const rows = page.locator('.view.review .players-col .row');
  await expect(rows).toHaveCount(7);
  await expect(rows.first().locator('.n')).toHaveText(/^×\d$/);
  const col = await page.locator('.players-col').boundingBox();
  const b = (await box.boundingBox())!;
  // The print takes most of the width left beside the column and most of the height.
  expect(b.width).toBeGreaterThan((TV_VIEWPORT.width - col!.width) * 0.5);
  expect(b.height).toBeGreaterThan(TV_VIEWPORT.height * 0.5);
  expect(b.x + b.width).toBeLessThanOrEqual(col!.x + 24);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(SCREENS, 'sc9-review-720.png') });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: resolve(SCREENS, 'sc9-review-1080.png') });
});

test('prefers-reduced-motion turns the entrance and flash animations off', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?gallery=1&phase=shoot');
  const names = await page.evaluate(() => {
    const name = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).animationName : 'missing';
    };
    return [name('.view.shoot'), name('.shoot .flash'), name('.shots')];
  });
  expect(names.every((n) => n === 'none')).toBe(true);
});
