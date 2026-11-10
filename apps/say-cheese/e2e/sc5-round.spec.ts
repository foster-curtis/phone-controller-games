// SC5 vertical slice (BUILD_PLAN §3 SC5; SPEC §6.2–§6.4, §7.4): a TV and three phones through the
// real relay with Chromium's fake camera. One full round (5 shots, uploaded while shooting, tagged on
// the photographer's phone and mirrored on the TV), two empty rounds to match end, then Rematch.
import {
  cameraAndReady,
  closeContexts,
  expect,
  hostPhase,
  hostState,
  joinPlayer,
  openHost,
  photographerOf,
  screen,
  setTimeScale,
  test,
  type Host,
  type Phone,
} from './helpers';

test.afterEach(closeContexts);
test.setTimeout(150_000);

/** Photographer taps I'm ready and waits for the shoot screen. */
async function startShoot(ph: Phone): Promise<void> {
  await expect(screen(ph.page, 'announce')).toBeVisible();
  await ph.page.getByRole('button', { name: "I'm ready" }).click();
  await expect(screen(ph.page, 'shoot')).toBeVisible({ timeout: 15_000 });
}

/** An empty round: the photographer never taps, the shoot times out, results score nothing. */
async function emptyRound(host: Host, phones: Phone[]): Promise<void> {
  await expect.poll(() => hostPhase(host)).toBe('announce');
  const ph = await photographerOf(host, phones);
  await startShoot(ph);
  await expect.poll(() => hostPhase(host), { timeout: 15_000 }).toBe('results');
  expect((await hostState(host)).lastResult?.photographerDelta).toBe(0);
}

test('full round, two more turns to match end, rematch skips the rules', async ({ browser }) => {
  const host = await openHost(browser, 'debug=1&timeScale=0.1');
  const errors: string[] = [];
  host.page.on('pageerror', (e) => errors.push(e.message));
  const phones: Phone[] = [];
  for (const name of ['Ann', 'Ben', 'Cat']) phones.push(await joinPlayer(browser, host, name));
  for (const p of phones) p.page.on('pageerror', (e) => errors.push(`${p.name}: ${e.message}`));
  for (const p of phones) await cameraAndReady(p);

  // The first phone to join leads (SPEC §6.5).
  const leader = phones[0]!;
  await expect(leader.page.locator('[data-action=start]')).toBeEnabled();
  await leader.page.locator('[data-action=start]').click();
  await expect(screen(leader.page, 'rules')).toBeVisible();
  await leader.page.locator('[data-action=skip]').click();

  await expect.poll(() => hostPhase(host)).toBe('announce');
  const ph = await photographerOf(host, phones);
  const [b, c] = phones.filter((p) => p !== ph) as [Phone, Phone];
  const players = (await hostState(host)).players;
  const idOf = (p: Phone) => players.find((q) => q.name === p.name)!.id;

  // Five taps need ~2 s of shoot time: 0.3 gives 6 s (the e2e default 0.1 gives 2 s).
  await setTimeScale(host, 0.3);
  await startShoot(ph);
  const shoot = screen(ph.page, 'shoot');
  for (let i = 1; i <= 5; i++) {
    await shoot.click({ position: { x: 200, y: 400 } });
    await expect(ph.page.locator('.shot-counter')).toHaveText(`${i} / 15`);
    await ph.page.waitForTimeout(450); // the 0.4 s shutter cooldown
  }
  await expect(host.page.locator('.view.shoot .shots')).toHaveText('5 / 15');
  await setTimeScale(host, 0.1);

  // Uploaded while shooting: review opens with all five photos on the TV.
  await expect(host.page.locator('.view.review')).toBeVisible({ timeout: 20_000 });
  await expect(host.page.locator('.view.review .marker-tv')).toContainText('Photo 1 / 5');
  const st = await hostState(host);
  expect(st.round!.photos.filter((p) => p.url).length).toBe(5);
  await expect(host.page.locator('.view.review img.photo')).toHaveCount(1);

  const review = screen(ph.page, 'review');
  const stage = review.locator('.stage');
  const tvTags = host.page.locator('.view.review [data-tag]');
  await expect(stage.locator('img')).toHaveCount(1); // the phone's own local copy
  const tagAt = async (who: Phone | null) => {
    await stage.click({ position: { x: 60, y: 60 } });
    await review.locator(`.sheet [data-player="${who ? idOf(who) : 'unknown'}"]`).click();
  };

  // Photo 1 and 2: Ben-or-whoever (player B).
  await tagAt(b);
  await expect(tvTags).toHaveCount(1);
  await expect(tvTags.first()).toContainText(b.name);
  await review.locator('[data-action=next]').click();
  await expect(host.page.locator('.view.review .marker-tv')).toContainText('Photo 2 / 5');
  await expect(tvTags).toHaveCount(0);
  await tagAt(b);
  await expect(tvTags).toHaveCount(1);

  // Photo 3: Unknown, changed to C, then removed.
  await review.locator('[data-action=next]').click();
  await expect(host.page.locator('.view.review .marker-tv')).toContainText('Photo 3 / 5');
  await tagAt(null);
  await expect(host.page.locator('.view.review .tag.unknown')).toHaveCount(1);
  await stage.locator('[data-tag]').click();
  await review.locator(`.sheet [data-player="${idOf(c)}"]`).click();
  await expect(tvTags).toHaveCount(1);
  await expect(tvTags.first()).toContainText(c.name);
  await stage.locator('[data-tag]').click();
  await review.locator('[data-action=remove]').click();
  await expect(tvTags).toHaveCount(0);

  // To the last photo, Finish review, confirm.
  await review.locator('[data-action=next]').click();
  await review.locator('[data-action=next]').click();
  await review.locator('[data-action=finish]').click();
  await review.locator('[data-action=confirmFinish]').click();

  await expect(host.page.locator('.view.results')).toBeVisible();
  await expect(host.page.locator('.view.results .caught-list')).toContainText(
    `${b.name} caught ×2`,
  );
  await expect(host.page.locator('.view.results')).toContainText(`${ph.name}: -2`);
  await expect(screen(ph.page, 'results').locator('.pill')).toHaveText('You: -2');
  await expect(screen(b.page, 'results').locator('.pill')).toHaveText('Caught 2×');
  const scores = Object.fromEntries((await hostState(host)).players.map((p) => [p.name, p.score]));
  expect(scores).toEqual({ [ph.name]: -2, [b.name]: 2, [c.name]: 0 });

  // Next photographer twice more (no shots: no score), then match end.
  await host.page.getByRole('button', { name: /Next photographer/ }).click();
  await emptyRound(host, phones);
  await leader.page.locator('[data-action=next]').click();
  await emptyRound(host, phones);
  await expect(host.page.getByRole('button', { name: /Final results/ })).toBeVisible();
  await leader.page.locator('[data-action=next]').click();
  await expect(host.page.locator('.view.matchEnd')).toBeVisible();
  // Lowest score wins: the first photographer at −2.
  await expect(host.page.locator('.view.matchEnd .winners')).toHaveText(ph.name);

  // Rematch: straight to announce, no rules.
  await leader.page.locator('[data-action=rematch]').click();
  await expect.poll(() => hostPhase(host)).toBe('announce');
  await expect(host.page.locator('.view.announce')).toBeVisible();
  expect(errors).toEqual([]);
});
