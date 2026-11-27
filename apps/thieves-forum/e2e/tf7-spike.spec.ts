// Crowd spike (BUILD_PLAN TF7, SPEC §6.2, §6.10, §6.11, §6.18, §12.3, §12.5): host + 3 phones join and
// land on the lobby screen, press Ready, and the leader taps the visible Start (TF7-fix-1); a
// non-leader has no Start; each phone's stick moves its own character in the stick direction (`__pcg.world()`);
// the TV logs no console errors; the live NPC count stays within tolerance for 20 s at timeScale 2.
// Also: `?stress=1&debug=1` runs the 8-bot crowd and reports FPS and step time (logged, BUILD_PLAN §8).
import { closeContexts, expect, joinPhone, test, type Phone } from './helpers';
import { balance } from '../src/content';
import { plannedNpcs } from '../src/host/sim/npc/churn';
import { holdStick, openSpikeHost, phoneId, type W } from './helpers-tf7';

test.afterEach(closeContexts);

test('three phones drive their characters through the spike round', async ({ browser }) => {
  test.setTimeout(150_000);
  const host = await openSpikeHost(browser, '?timeScale=2&overlay=1');
  const tv = host.page;
  const phones: Phone[] = [];
  for (const name of ['Livia', 'Marcus', 'Julia'])
    phones.push(await joinPhone(browser, host.code, name));
  const lobby = (p: Phone) => p.page.locator('[data-screen=lobby]');
  for (const p of phones) {
    await expect(lobby(p)).toBeVisible();
    await expect(lobby(p).locator('.player .label')).toHaveText(['Livia', 'Marcus', 'Julia']);
  }
  await expect(tv.locator('[data-role=player]')).toHaveText(['Livia', 'Marcus', 'Julia']);

  // Only the leader (first to join) sees Start, disabled until enough players are ready.
  const start = lobby(phones[0]!).locator('[data-action=start]');
  await expect(start).toBeVisible();
  await expect(start).toBeDisabled();
  for (const p of phones.slice(1))
    await expect(lobby(p).locator('[data-action=start]')).toHaveCount(0);

  // A color tap reaches the host and every phone.
  const swatch = lobby(phones[2]!).locator('.swatch:not([disabled])[aria-pressed=false]').first();
  const picked = (await swatch.getAttribute('data-color'))!;
  await swatch.click();
  await expect(lobby(phones[0]!).locator('.player').nth(2).locator('.dot')).toHaveAttribute(
    'style',
    new RegExp(`--player-${picked}`),
  );

  for (const p of phones) await lobby(p).locator('[data-action=ready]').click();
  for (const p of phones)
    await expect(lobby(p).locator('.player .tag.ok')).toHaveCount(phones.length);
  await expect(start).toBeEnabled();
  for (const p of phones.slice(1))
    await expect(lobby(p).locator('[data-action=start]')).toHaveCount(0);
  await start.click();
  await expect(tv.locator('[data-tv=roundStart]')).toBeVisible();
  for (const p of phones) await expect(p.page.locator('[data-screen=roundStart]')).toBeVisible();

  await expect
    .poll(() => tv.evaluate(() => (window as W).__pcg!.phase()), { timeout: 10_000 })
    .toBe('play');
  await expect(tv.locator('[data-tv=play]')).toBeVisible();
  for (const p of phones) await expect(p.page.locator('[data-screen=play]')).toBeVisible();

  const pos = (id: number) =>
    tv.evaluate((i) => {
      const c = (window as W).__pcg!.world()!.characters.find((ch) => ch.id === i)!;
      return { x: c.x, y: c.y };
    }, id);
  const dirs: [number, number][] = [
    [45, 0],
    [0, 45],
    [-45, 0],
  ];
  for (const [i, phone] of phones.entries()) {
    const pid = await phoneId(phone);
    const id = await tv.evaluate((p) => (window as W).__pcg!.characterOf(p), pid);
    expect(id, phone.name).not.toBeNull();
    const [dx, dy] = dirs[i]!;
    const before = await pos(id!);
    let after = before;
    await holdStick(phone, dx, dy, 1500, async () => {
      after = await pos(id!);
    });
    const mx = after.x - before.x;
    const my = after.y - before.y;
    // Moved at least a tile, mostly along the stick.
    const along = (mx * dx + my * dy) / 45;
    expect(along, `${phone.name} moved along the stick`).toBeGreaterThan(1);
    expect(Math.abs(mx * dy - my * dx) / 45, phone.name).toBeLessThan(along);
  }

  // The crowd: once it has streamed in, the live count stays within ±8% (at least ±1) for 20 s.
  const npcs = () =>
    tv.evaluate(() => {
      const d = (window as W).__pcg!.debug()!;
      return { live: d.liveNpcs, planned: d.plannedNpcs };
    });
  const { planned } = await npcs();
  expect(planned).toBe(plannedNpcs(3, balance)); // from balance.ts (three phones)
  const tol = Math.max(1, Math.round(planned * 0.08));
  await expect
    .poll(async () => (await npcs()).live, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(planned - tol);
  const seen: number[] = [];
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    seen.push((await npcs()).live);
    await tv.waitForTimeout(500);
  }
  expect(Math.min(...seen)).toBeGreaterThanOrEqual(planned - tol);
  expect(Math.max(...seen)).toBeLessThanOrEqual(planned + tol);
  // The dev overlay is on (`?overlay=1`).
  await expect(tv.locator('html')).toHaveAttribute('data-dev-overlay', 'on');

  await tv.screenshot({ path: 'e2e/__screens__/tf7-spike-tv.png' });
  await phones[0]!.page.screenshot({ path: 'e2e/__screens__/tf7-spike-phone.png' });
  expect(host.errors).toEqual([]);
});

test('stress mode runs the 8-player crowd with a perf readout', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?stress=1&debug=1');
  await expect
    .poll(() => page.evaluate(() => (window as W).__pcg?.phase?.() ?? null), { timeout: 20_000 })
    .toBe('play');
  await page.waitForTimeout(8000);
  const perf = await page.evaluate(() => (window as W).__pcg!.perf!());
  console.log(`tf7 stress (headless, software GL): ${JSON.stringify(perf)}`);
  expect(perf.characters).toBeGreaterThanOrEqual(8);
  await expect(page.locator('[data-role=perf]')).toContainText('fps');
  await page.screenshot({ path: 'e2e/__screens__/tf7-stress.png' });
  expect(errors).toEqual([]);
});
