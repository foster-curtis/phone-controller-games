// SC5 limits (BUILD_PLAN §3 SC5; SPEC §6.1, §6.2, §6.4, §6.3.1): the 15th shot ends the shoot early,
// only the photographer's tags count, a round with no photos scores nothing, and the 9th player is
// refused a seat.
import {
  cameraAndReady,
  closeContexts,
  expect,
  hostControl,
  hostPhase,
  hostState,
  joinPlayer,
  openHost,
  photographerOf,
  screen,
  sendRaw,
  setTimeScale,
  test,
  type Phone,
} from './helpers';

test.afterEach(closeContexts);
test.setTimeout(150_000);

test('15th shot ends the shoot, dodger tags are ignored, 0 photos scores nothing', async ({
  browser,
}) => {
  const host = await openHost(browser, 'debug=1&timeScale=0.1');
  const phones: Phone[] = [];
  for (const name of ['Ann', 'Ben', 'Cat']) phones.push(await joinPlayer(browser, host, name));
  for (const p of phones) await cameraAndReady(p);
  await hostControl(host, { action: 'start' });
  await hostControl(host, { action: 'skip' });
  await expect.poll(() => hostPhase(host)).toBe('announce');

  const ph = await photographerOf(host, phones);
  const [b, c] = phones.filter((p) => p !== ph) as [Phone, Phone];
  const players = (await hostState(host)).players;
  const idOf = (p: Phone) => players.find((q) => q.name === p.name)!.id;

  // A full 20 s shoot (timeScale 1), so only the 15-shot cap can end it early.
  await setTimeScale(host, 0.2);
  await ph.page.getByRole('button', { name: "I'm ready" }).click();
  await expect.poll(() => hostPhase(host)).toBe('scatter');
  await setTimeScale(host, 1);
  const shoot = screen(ph.page, 'shoot');
  await expect(shoot).toBeVisible({ timeout: 10_000 });
  const started = Date.now();
  for (let i = 1; i <= 15; i++) {
    await shoot.click({ position: { x: 200, y: 400 } });
    await expect(ph.page.locator('.shot-counter')).toHaveText(`${i} / 15`);
    if (i < 15) await ph.page.waitForTimeout(450);
  }
  await setTimeScale(host, 0.1);
  await expect.poll(() => hostPhase(host)).not.toBe('shoot');
  expect(Date.now() - started).toBeLessThan(18_000); // well before the 20 s timer
  await expect(host.page.locator('.view.review .marker-tv')).toContainText('Photo 1 / 15', {
    timeout: 15_000,
  });

  // A dodger's tag and finishReview are ignored (SPEC §6.4: only the photographer tags).
  await sendRaw(b, { t: 'tag', photo: 0, tagId: 'dodger', x: 0.5, y: 0.5, playerId: idOf(c) });
  await sendRaw(b, { t: 'finishReview' });
  await sendRaw(b, { t: 'view', photo: 3 });
  const review = screen(ph.page, 'review');
  await review.locator('.stage').click({ position: { x: 60, y: 60 } });
  await review.locator(`.sheet [data-player="${idOf(c)}"]`).click();
  await expect(host.page.locator('.view.review [data-tag]')).toHaveCount(1);
  const st = await hostState(host);
  expect(st.phase).toBe('review');
  expect(st.round!.tags.map((t) => t.tagId)).not.toContain('dodger');
  expect(st.round!.tags).toHaveLength(1);
  await expect(host.page.locator('.view.review .marker-tv')).toContainText('Photo 1 / 15');

  for (let i = 1; i < 15; i++) await review.locator('[data-action=next]').click();
  await review.locator('[data-action=finish]').click();
  await review.locator('[data-action=confirmFinish]').click();
  await expect.poll(() => hostPhase(host)).toBe('results');
  expect((await hostState(host)).lastResult?.photographerDelta).toBe(-1);

  // Next turn: the photographer never taps; the timer ends the shoot with 0 photos.
  await hostControl(host, { action: 'next' });
  await expect.poll(() => hostPhase(host)).toBe('announce');
  const ph2 = await photographerOf(host, phones);
  const before = Object.fromEntries((await hostState(host)).players.map((p) => [p.id, p.score]));
  await ph2.page.getByRole('button', { name: "I'm ready" }).click();
  await expect(screen(ph2.page, 'shoot')).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => hostPhase(host), { timeout: 15_000 }).toBe('results');
  const after = await hostState(host);
  expect(after.lastResult).toMatchObject({ photographerDelta: 0, caught: [] });
  expect(Object.fromEntries(after.players.map((p) => [p.id, p.score]))).toEqual(before);
  await expect(host.page.locator('.view.results')).toContainText('Nobody was caught!');
  await expect(host.page.locator('.view.results')).toContainText(`${ph2.name}: 0`);
});

test('a 9th player is refused a seat', async ({ browser }) => {
  test.slow();
  const host = await openHost(browser, 'debug=1');
  const names = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
  for (const name of names) await joinPlayer(browser, host, name);
  await expect(host.page.locator('.view.lobby li.player')).toHaveCount(8);

  const ninth = await joinPlayer(browser, host, 'P9', { expectSeat: false });
  // The host has heard from the phone (it got a lobby screen) but gave it no seat.
  await expect(screen(ninth.page, 'lobby')).toBeVisible();
  await ninth.page.waitForTimeout(500);
  const st = await hostState(host);
  expect(st.players.map((p) => p.name)).toEqual(names);
  await expect(host.page.locator('.view.lobby li.player')).toHaveCount(8);
  await expect(ninth.page.locator('.me .chip')).toHaveCount(0);
});
