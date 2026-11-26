// TV DOM UI (TF6, SPEC §6.14–§6.16, §6.19): every `?ui=<screen>` page renders its `[data-tv=<phase>]`
// screen at TV size and in the 1920 x 1080 frame, the host keys drive How to play, and the in-round HUD
// carries no player names. Screenshots go to e2e/__screens__/ (gitignored) for review.
import { expect, TV_VIEWPORT, test } from './helpers';

const SCREENS: [string, string][] = [
  ['title', 'lobby'],
  ['lobby', 'lobby'],
  ['rules', 'rules'],
  ['roundStart', 'roundStart'],
  ['play', 'play'],
  ['handsUp', 'handsUp'],
  ['reveal', 'reveal'],
  ['transition', 'transition'],
  ['podium', 'podium'],
];

test.use({ viewport: TV_VIEWPORT });

for (const [ui, phase] of SCREENS) {
  test(`?ui=${ui} renders [data-tv=${phase}]`, async ({ page }) => {
    await page.goto(`/?ui=${ui}`);
    const screen = page.locator(`[data-tv=${phase}]`);
    await expect(screen).toBeVisible();
    await expect(page.locator('[data-tv]')).toHaveCount(1);
    const box = await page.locator('.tv-frame').boundingBox();
    expect(box).not.toBeNull();
    // 1920 x 1080 frame scaled to fit the 1280 x 720 window
    expect(Math.round(box!.width)).toBe(1280);
    expect(Math.round(box!.height)).toBe(720);
    await page.screenshot({ path: `e2e/__screens__/tf6-${ui}.png` });
  });
}

test('?ui=play: the HUD shows the timer, round pill and room code only', async ({ page }) => {
  await page.goto('/?ui=play');
  const hud = page.locator('[data-tv=play]');
  await expect(hud.locator('[data-role=timer]')).toHaveText('3:01');
  await expect(hud.locator('[data-role=round-pill]')).toHaveText('ROUND 2 / 3');
  await expect(hud.locator('[data-role=room-code]')).toHaveText('ABCD');
  await expect(hud.locator('[data-color]')).toHaveCount(0);
});

test('?ui=rules: Next and Skip keys drive the cards, no hover needed', async ({ page }) => {
  await page.goto('/?ui=rules');
  const root = page.locator('.tv-rules');
  await expect(root).toHaveAttribute('data-card', '0');
  await page.keyboard.press('Enter');
  await expect(root).toHaveAttribute('data-card', '1');
  await page.keyboard.press('ArrowRight');
  await expect(root).toHaveAttribute('data-card', '2');
  await page.keyboard.press('Escape');
  await expect(root).toHaveAttribute('data-card', '0');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(root).toHaveAttribute('data-card', '1');
});

test('?ui=podium: arrow keys step the reveal to the winner banner', async ({ page }) => {
  await page.goto('/?ui=podium&step=0');
  await expect(page.locator('[data-tv=podium]')).toBeVisible();
  await expect(page.locator('[data-role=winner-banner]')).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-role=winner-banner]')).toHaveText('Marcus WINS!');
  await expect(page.locator('.podium-feedback svg')).toBeVisible();
});

test('?ui=reveal: cards pop lowest haul first', async ({ page }) => {
  await page.goto('/?ui=reveal&step=1');
  await expect(page.locator('[data-tv=reveal]')).toBeVisible();
  const cards = page.locator('[data-role=reveal-card]:not([hidden])');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Gaius');
  await page.keyboard.press('ArrowRight');
  await expect(cards).toHaveCount(2);
  await expect(page.locator('[data-role=reveal-card][data-state=tag]')).toContainText('+8');
});
