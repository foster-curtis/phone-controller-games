// SC10 emoji (BUILD_PLAN §3 SC10; SPEC §6.6): in review a dodger's 😂 floats on the TV, and the
// photographer's phone has no emoji bar.
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

test('a dodger reacts in review and the TV shows it; the photographer has no bar', async ({
  browser,
}) => {
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
  await shoot.click({ position: { x: 200, y: 400 } });
  await expect(ph.page.locator('.shot-counter')).toHaveText('1 / 15');
  await setTimeScale(host, 0.1);

  await expect(host.page.locator('.view.review')).toBeVisible({ timeout: 20_000 });
  await expect(screen(ph.page, 'review')).toBeVisible();
  await expect(ph.page.locator('.emoji-bar')).toHaveCount(0);

  const dodger = phones.find((p) => p !== ph)!;
  await expect(screen(dodger.page, 'review')).toBeVisible();
  await expect(dodger.page.locator('.emoji-bar')).toBeVisible();
  await dodger.page.locator('.emoji-btn[data-emoji="1"]').click();
  await expect(host.page.locator('.emoji-layer .emoji')).toHaveText('😂');
});
