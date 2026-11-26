// TF5 dev mode (SPEC §6.17, §12.7): `/play?dev=1` steps through every phone screen and sheet on the fake
// client with no console errors, in landscape, and saves a screenshot of each for review (gitignored).
import { expect, PHONE_VIEWPORT, test } from './helpers';

test.use({ viewport: PHONE_VIEWPORT, hasTouch: true });

/** Dev sample id → what must be on screen. */
const STEPS: [id: string, selector: string][] = [
  ['lobby', '[data-screen=lobby]'],
  ['rules', '[data-screen=rules]'],
  ['roundStart', '[data-screen=roundStart] .outfit-card'],
  ['roundStart2', '[data-screen=roundStart][data-cards="2"]'],
  ['walkOn', '[data-screen=walkOn]'],
  ['play', '[data-screen=play] [data-role=main]'],
  ['toss', '[data-role=toss][data-cooldown]'],
  ['stall', '[data-sheet=stall] .tile'],
  ['dialog', '[data-sheet=dialog]'],
  ['pawn', '[data-sheet=pawn]'],
  ['sell', '[data-sheet=sell]'],
  ['pack', '[data-sheet=pack]'],
  ['tip', '[data-sheet=tip] .tip-hit'],
  ['caught', '.caught-banner'],
  ['toast', '.pcg-toast.toast-lucky'],
  ['stocks', '[data-screen=stocks]'],
  ['handsUp', '[data-screen=handsUp]'],
  ['matchEnd', '[data-screen=matchEnd]'],
  ['waiting', '[data-screen=waiting][data-reason=nextRound]'],
  ['full', '[data-screen=waiting][data-reason=full]'],
];

test('/play?dev=1 steps through every screen with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    // Google Fonts are aborted on purpose (helpers.ts blockFonts).
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url))
      errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/play?dev=1');
  await expect(page.locator('[data-screen=join]')).toBeVisible();
  await page.screenshot({ path: 'e2e/__screens__/tf5-join.png' });

  for (const [id, selector] of STEPS) {
    // Click the switcher row's button without opening the panel, so screenshots show the phone only.
    await page.locator(`[data-dev-screen=${id}]`).dispatchEvent('click');
    await expect(page.locator(selector).first()).toBeVisible();
    await expect(page.locator('.overlay')).toHaveCount(0);
    await page.screenshot({ path: `e2e/__screens__/tf5-${id}.png` });
  }

  // A real grab on the dev host stand-in: the tile's bar fills and completes.
  await page.locator('[data-dev-screen=stall]').dispatchEvent('click');
  const tile = page.locator('[data-sheet=stall] [data-slot="0"]');
  const box = (await tile.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(tile.locator('.hold-bar')).toBeVisible();
  await page.screenshot({ path: 'e2e/__screens__/tf5-grab.png' });
  await expect(tile.locator('.hold-bar')).toHaveAttribute('data-progress', '100');
  await page.mouse.up();

  expect(errors).toEqual([]);
});
