// SC7 shared devices (BUILD_PLAN §3 SC7; SPEC §6.3.1): phone A holds three seats, B and C one each (5
// players). Each of A's seats sees the pass screen before its own turn, B and C never do; a seat on A
// is tagged and scored on its own; removing a seat leaves the others; a one-phone game plays on.
import {
  cameraAndReady,
  closeContexts,
  expect,
  hostPhase,
  hostState,
  joinPlayer,
  openHost,
  screen,
  setTimeScale,
  test,
  type Host,
  type Phone,
} from './helpers';

test.afterEach(closeContexts);
test.setTimeout(240_000);

/** Adds a player on `phone` through the lobby's "+ Add another player" step. */
async function addSeat(host: Host, phone: Phone, name: string): Promise<void> {
  await phone.page.locator('[data-action=addSeat]').click();
  const input = phone.page.locator('input[name=seatName]');
  await input.fill(name);
  await input.press('Enter');
  await expect
    .poll(async () => (await hostState(host)).players.some((p) => p.name === name))
    .toBe(true);
}

/** Records the "Pass the phone to …" text of every pass screen this page ever shows. */
async function watchPass(phone: Phone): Promise<void> {
  await phone.page.evaluate(() => {
    const w = window as unknown as { __sawPass: string[] };
    w.__sawPass = [];
    new MutationObserver(() => {
      const t = document.querySelector('[data-screen=pass] p.body')?.textContent;
      if (t && !w.__sawPass.includes(t)) w.__sawPass.push(t);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}
const sawPass = (phone: Phone) =>
  phone.page.evaluate(() => (window as unknown as { __sawPass: string[] }).__sawPass);

const phoneId = (phone: Phone) =>
  phone.page.evaluate(() =>
    (window as unknown as { __pcg: { playerId(): string } }).__pcg.playerId(),
  );

/** The phone holding the round's photographer seat (`p3#1` → the phone whose relay id is `p3`). */
async function phoneOfPhotographer(host: Host, phones: Phone[]): Promise<Phone> {
  const id = (await hostState(host)).round!.photographer;
  for (const p of phones) if (id.startsWith(`${await phoneId(p)}#`)) return p;
  throw new Error(`no phone for ${id}`);
}

const nameOfSeat = async (host: Host, id: string) =>
  (await hostState(host)).players.find((p) => p.id === id)!.name;

/** Waits for the round's first phase (`pass` on a shared phone, else `announce`). */
async function waitRoundStart(host: Host): Promise<string> {
  await expect
    .poll(async () => ['pass', 'announce'].includes(await hostPhase(host)), { timeout: 20_000 })
    .toBe(true);
  return hostPhase(host);
}

/** Photographer taps I'm ready on the announce screen and waits for the shoot screen. */
async function startShoot(ph: Phone): Promise<void> {
  await expect(screen(ph.page, 'announce')).toBeVisible();
  await ph.page.getByRole('button', { name: "I'm ready" }).click();
  await expect(screen(ph.page, 'shoot')).toBeVisible({ timeout: 15_000 });
}

/** Confirms the pass screen on a shared photographer phone. */
async function confirmPass(host: Host, ph: Phone): Promise<void> {
  await expect(host.page.locator('.view.pass')).toBeVisible();
  await expect(screen(ph.page, 'pass')).toBeVisible();
  await ph.page.locator('[data-action=imSeat]').click();
  await expect.poll(() => hostPhase(host)).toBe('announce');
}

test('three seats on one phone, two single phones: pass screens, separate scoring', async ({
  browser,
}) => {
  const host = await openHost(browser, 'debug=1&timeScale=0.1');
  const errors: string[] = [];
  host.page.on('pageerror', (e) => errors.push(e.message));
  const a = await joinPlayer(browser, host, 'Ann');
  const b = await joinPlayer(browser, host, 'Ben');
  const c = await joinPlayer(browser, host, 'Cat');
  for (const p of [a, b, c]) p.page.on('pageerror', (e) => errors.push(`${p.name}: ${e.message}`));
  await addSeat(host, a, 'Kai');
  await addSeat(host, a, 'Lou');
  await expect(a.page.locator('.seat-chips li')).toHaveCount(3);
  for (const p of [a, b, c]) await cameraAndReady(p);
  expect((await hostState(host)).players).toHaveLength(5);
  // The TV groups A's three seats under Ann with a phone marker.
  await expect(host.page.locator('.view.lobby .phone-mark')).toHaveCount(1);
  await expect(host.page.locator('.view.lobby ul.shared > li')).toHaveCount(2);
  for (const p of [a, b, c]) await watchPass(p);

  await a.page.locator('[data-action=start]').click();
  await expect(screen(a.page, 'rules')).toBeVisible();
  await a.page.locator('[data-action=skip]').click();

  const phones = [a, b, c];
  for (let turn = 1; turn <= 5; turn++) {
    const first = await waitRoundStart(host);
    const ph = await phoneOfPhotographer(host, phones);
    const photographerId = (await hostState(host)).round!.photographer;
    if (ph === a) {
      expect(first).toBe('pass');
      await confirmPass(host, ph);
    } else {
      expect(first).toBe('announce');
      await expect(host.page.locator('.view.pass')).toHaveCount(0);
    }
    if (turn === 1) {
      // One photo, tagged on a seat of phone A that isn't the photographer.
      const phName = await nameOfSeat(host, photographerId);
      const victim = phName === 'Kai' ? 'Lou' : 'Kai';
      const victimId = (await hostState(host)).players.find((p) => p.name === victim)!.id;
      await setTimeScale(host, 0.3);
      await startShoot(ph);
      await screen(ph.page, 'shoot').click({ position: { x: 200, y: 400 } });
      await expect(ph.page.locator('.shot-counter')).toHaveText('1 / 15');
      await setTimeScale(host, 0.1);
      const review = screen(ph.page, 'review');
      await expect(review).toBeVisible({ timeout: 20_000 });
      const stage = review.locator('.stage');
      await stage.click({ position: { x: 60, y: 60 } });
      await review.locator(`.sheet [data-player="${victimId}"]`).click();
      await review.locator('[data-action=finish]').click();
      await review.locator('[data-action=confirmFinish]').click();
      await expect(host.page.locator('.view.results')).toBeVisible();
      const scores: Record<string, number> = Object.fromEntries(
        (await hostState(host)).players.map((p) => [p.name, p.score]),
      );
      expect(scores[victim]).toBe(1);
      expect(scores[phName]).toBe(-1);
      // Separate scoring: A's third seat and the single phones stay at zero (or −1 for the photographer).
      const bystanders = Object.entries(scores).filter(([n]) => n !== victim && n !== phName);
      for (const [, score] of bystanders) expect(score).toBe(0);
    } else {
      await startShoot(ph);
      await expect.poll(() => hostPhase(host), { timeout: 20_000 }).toBe('results');
    }
    if (turn < 5) await a.page.locator('[data-action=next]').click();
  }

  // Each of A's three seats got its turn, so A saw exactly three pass screens; B and C none.
  expect((await sawPass(a)).sort()).toEqual([
    'Pass the phone to Ann',
    'Pass the phone to Kai',
    'Pass the phone to Lou',
  ]);
  expect(await sawPass(b)).toEqual([]);
  expect(await sawPass(c)).toEqual([]);
  expect(errors).toEqual([]);
});

test('removing one seat on a phone leaves the other two', async ({ browser }) => {
  const host = await openHost(browser, 'debug=1&timeScale=0.1');
  const a = await joinPlayer(browser, host, 'Ann');
  await addSeat(host, a, 'Kai');
  await addSeat(host, a, 'Lou');
  await expect(a.page.locator('.seat-chips li')).toHaveCount(3);
  await a.page.locator('[data-seat="1"] [data-action=removeSeat]').click();
  await expect
    .poll(async () => (await hostState(host)).players.map((p) => p.name).sort())
    .toEqual(['Ann', 'Lou']);
  await expect(a.page.locator('.seat-chips li')).toHaveCount(2);
  await expect(host.page.locator('.view.lobby li.player')).toHaveCount(2);
});

test('a one-phone game: pass screen, photographer screens and leader controls share the phone', async ({
  browser,
}) => {
  const host = await openHost(browser, 'debug=1&timeScale=0.1');
  const a = await joinPlayer(browser, host, 'Ann');
  await addSeat(host, a, 'Kai');
  await addSeat(host, a, 'Lou');
  await cameraAndReady(a);
  await expect(a.page.locator('[data-action=start]')).toBeEnabled();
  await a.page.locator('[data-action=start]').click();
  await expect(screen(a.page, 'rules')).toBeVisible();
  await a.page.locator('[data-action=skip]').click();
  for (let turn = 1; turn <= 2; turn++) {
    expect(await waitRoundStart(host)).toBe('pass');
    await confirmPass(host, a);
    await startShoot(a);
    await expect.poll(() => hostPhase(host), { timeout: 20_000 }).toBe('results');
    await a.page.locator('[data-action=next]').click();
  }
});
