// SC5-fix-2 (BUILD_PLAN §8; SPEC §6.6, §7.4): the TV review really shows each photo. Every review
// `<img>` must have decoded (`complete && naturalWidth > 0`) and have a non-zero rendered box, for
// every photo the photographer steps through, not just exist in the DOM.
import type { Page } from '@playwright/test';
import {
  cameraAndReady,
  closeContexts,
  expect,
  hostPhase,
  joinPlayer,
  openHost,
  photographerOf,
  screen,
  setTimeScale,
  test,
  type Phone,
} from './helpers';

test.afterEach(closeContexts);
test.setTimeout(120_000);

/** The TV review photo as the browser sees it. */
function tvImage(page: Page) {
  return page.locator('.view.review img.photo').evaluate((img: HTMLImageElement) => {
    const r = img.getBoundingClientRect();
    return {
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      width: r.width,
      height: r.height,
    };
  });
}

async function expectTvPhotoRendered(page: Page): Promise<void> {
  await expect(page.locator('.view.review img.photo')).toHaveCount(1);
  await expect
    .poll(async () => {
      const i = await tvImage(page);
      return i.complete && i.naturalWidth > 0 && i.width > 0 && i.height > 0;
    })
    .toBe(true);
}

test('every TV review photo decodes and has a visible box', async ({ browser }) => {
  const host = await openHost(browser, 'debug=1&timeScale=0.1');
  const phones: Phone[] = [];
  for (const name of ['Ann', 'Ben', 'Cat']) phones.push(await joinPlayer(browser, host, name));
  for (const p of phones) await cameraAndReady(p);

  const leader = phones[0]!;
  await leader.page.locator('[data-action=start]').click();
  await expect(screen(leader.page, 'rules')).toBeVisible();
  await leader.page.locator('[data-action=skip]').click();

  await expect.poll(() => hostPhase(host)).toBe('announce');
  const ph = await photographerOf(host, phones);
  await setTimeScale(host, 0.3);
  await expect(screen(ph.page, 'announce')).toBeVisible();
  await ph.page.getByRole('button', { name: "I'm ready" }).click();
  const shoot = screen(ph.page, 'shoot');
  await expect(shoot).toBeVisible({ timeout: 15_000 });
  const shots = 3;
  for (let i = 1; i <= shots; i++) {
    await shoot.click({ position: { x: 200, y: 400 } });
    await expect(ph.page.locator('.shot-counter')).toHaveText(`${i} / 15`);
    await ph.page.waitForTimeout(450); // the 0.4 s shutter cooldown
  }
  await setTimeScale(host, 0.1);

  await expect(host.page.locator('.view.review')).toBeVisible({ timeout: 20_000 });
  const review = screen(ph.page, 'review');
  for (let n = 1; n <= shots; n++) {
    await expect(host.page.locator('.view.review .marker-tv')).toContainText(
      `Photo ${n} / ${shots}`,
    );
    await expectTvPhotoRendered(host.page);
    if (n < shots) await review.locator('[data-action=next]').click();
  }

  // A tag repaints the TV (a new <img> on the same object URL): still rendered.
  await review.locator('.stage').click({ position: { x: 60, y: 60 } });
  await review.locator('.sheet [data-player="unknown"]').click();
  await expect(host.page.locator('.view.review [data-tag]')).toHaveCount(1);
  await expectTvPhotoRendered(host.page);
});
