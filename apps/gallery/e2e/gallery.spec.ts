// The gallery page end to end (SPEC: Page structure, Game cards, Status handling, Device and input;
// BUILD_PLAN G1 E2E): cards from the catalog, Read more and Play by keyboard, mouse and touch, the
// kit's theme and motion rules, the 320px layout and axe.
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import { LISTED, paragraphCount, playerRange } from './catalog';
import { expect, test } from './helpers';

const cards = (page: Page) => page.locator('article.game-card');
const card = (page: Page, id: string) => page.locator(`article.game-card[data-game="${id}"]`);
const details = (c: Locator) => c.locator('details.read-more');
const isOpen = (c: Locator) => details(c).evaluate((d) => (d as HTMLDetailsElement).open);

test.describe('cards', () => {
  test('one per listed game, in catalog order, from the catalog', async ({ page }) => {
    await page.goto('/');
    await expect(cards(page)).toHaveCount(LISTED.length);
    for (const [i, game] of LISTED.entries()) {
      const c = cards(page).nth(i);
      await expect(c).toHaveAttribute('data-game', game.id);
      await expect(c.locator('.game-card-title')).toHaveText(game.title);
      await expect(c.locator('.game-card-meta .eyebrow')).toHaveText(playerRange(game));
      await expect(c.locator('.game-card-description')).toHaveText(game.shortDescription);
      await expect(c.locator('a.button')).toHaveAttribute('href', game.url);
      await expect(c.locator('.pill')).toHaveCount(game.status === 'beta' ? 1 : 0);
      await expect(c.locator('img')).toHaveAttribute('alt', `${game.title} card art`);
    }
  });
});

test.describe('keyboard', () => {
  test('Tab order: skip link, lockup, theme toggle, then Read more and Play per card', async ({
    page,
  }) => {
    await page.goto('/');
    const order: Locator[] = [
      page.locator('a.skip'),
      page.locator('a.brand-lockup'),
      page.locator('button.theme-toggle'),
    ];
    for (const game of LISTED) {
      order.push(card(page, game.id).locator('summary'), card(page, game.id).locator('a.button'));
    }
    for (const target of order) {
      await page.keyboard.press('Tab');
      await expect(target).toBeFocused();
    }
  });

  test('Enter and Space open and close Read more', async ({ page }) => {
    await page.goto('/');
    for (const game of LISTED) {
      const c = card(page, game.id);
      await c.locator('summary').focus();
      for (const key of ['Enter', 'Space']) {
        await page.keyboard.press(key);
        await expect.poll(() => isOpen(c), `${game.id} ${key} opens`).toBe(true);
        await expect(c.locator('.long-description p')).toHaveCount(
          paragraphCount(game.longDescription),
        );
        await expect(c.locator('.long-description p').first()).toBeVisible();
        await page.keyboard.press(key);
        await expect.poll(() => isOpen(c), `${game.id} ${key} closes`).toBe(false);
      }
    }
  });

  test('the focused element shows the focus ring', async ({ page }) => {
    await page.goto('/');
    const first = LISTED[0]!;
    // Tab to the first card's summary, then its Play link (3 header stops before them).
    for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
    await expect(card(page, first.id).locator('summary')).toBeFocused();
    const outline = () =>
      page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(await outline()).not.toBe('none');
    await page.keyboard.press('Tab');
    await expect(card(page, first.id).locator('a.button')).toBeFocused();
    expect(await outline()).not.toBe('none');
  });
});

test.describe('mouse', () => {
  test('clicking Read more toggles it', async ({ page }) => {
    await page.goto('/');
    const c = card(page, LISTED[0]!.id);
    await c.locator('summary').click();
    await expect.poll(() => isOpen(c)).toBe(true);
    await expect(c.locator('.long-description p').first()).toBeVisible();
    await c.locator('summary').click();
    await expect.poll(() => isOpen(c)).toBe(false);
  });

  for (const game of LISTED) {
    test(`Play opens ${game.id} in the same tab`, async ({ page, context }) => {
      await page.goto('/');
      await card(page, game.id).locator('a.button').click();
      await page.waitForURL(game.url);
      expect(page.url()).toBe(game.url);
      expect(context.pages()).toHaveLength(1);
    });
  }

  for (const [what, selector] of [
    ['title', '.game-card-title a'],
    ['image', 'a.game-card-image'],
  ] as const) {
    test(`the ${what} opens the game in the same tab`, async ({ page, context }) => {
      const game = LISTED[0]!;
      await page.goto('/');
      await card(page, game.id).locator(selector).click();
      await page.waitForURL(game.url);
      expect(page.url()).toBe(game.url);
      expect(context.pages()).toHaveLength(1);
    });
  }
});

test.describe('touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('tapping Read more toggles it, and tapping Play opens the game', async ({
    page,
    context,
  }) => {
    const game = LISTED[0]!;
    await page.goto('/');
    const c = card(page, game.id);
    await c.locator('summary').tap();
    await expect.poll(() => isOpen(c)).toBe(true);
    await expect(c.locator('.long-description p').first()).toBeVisible();
    await c.locator('summary').tap();
    await expect.poll(() => isOpen(c)).toBe(false);

    await c.locator('a.button').tap();
    await page.waitForURL(game.url);
    expect(page.url()).toBe(game.url);
    expect(context.pages()).toHaveLength(1);
  });
});

test.describe('theme', () => {
  test.describe('with a light OS preference', () => {
    test.use({ colorScheme: 'light' });

    test('the first load is dark (the OS is ignored)', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('.theme-toggle')).toHaveAttribute(
        'aria-label',
        'Switch to light mode',
      );
    });
  });

  test('the toggle switches to light, and a reload stays light', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('.theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('.theme-toggle')).toHaveAttribute(
      'aria-label',
      'Switch to dark mode',
    );
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('.theme-toggle')).toHaveAttribute(
      'aria-label',
      'Switch to dark mode',
    );
  });

  test('the lockup animation plays on load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.m-all')).toHaveAttribute('transform', /./, { timeout: 3_000 });
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('the lockup never animates', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(1_000);
      await expect(page.locator('.m-all')).not.toHaveAttribute('transform', /./);
      const textTransform = await page
        .locator('.brand-lockup-text')
        .evaluate((el) => getComputedStyle(el).transform);
      expect(textTransform).toBe('none');
    });
  });
});

test.describe('layout', () => {
  test('no horizontal scroll at 320px, even with every Read more open', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');
    await page
      .locator('details')
      .evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('the lockup hides "games" below 360px', async ({ page }) => {
    await page.setViewportSize({ width: 359, height: 800 });
    await page.goto('/');
    await expect(page.locator('.brand-label')).toBeHidden();
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.locator('.brand-label')).toBeVisible();
  });
});

test.describe('accessibility', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`axe finds no WCAG A/AA violations in ${theme}, every Read more open`, async ({
      page,
    }) => {
      await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page
        .locator('details')
        .evaluateAll((all) => all.forEach((d) => ((d as HTMLDetailsElement).open = true)));
      // The kit's amber ".dev" is part of the logotype, which WCAG 1.4.3 exempts from contrast; the
      // user accepted that exemption (BUILD_PLAN §8). Only that element is excluded.
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .exclude('.brand-wordmark-tld')
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual(
        [],
      );
    });
  }
});
