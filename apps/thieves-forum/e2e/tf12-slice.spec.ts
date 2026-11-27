// Vertical slice (BUILD_PLAN TF12; SPEC §6.2, §6.6, §6.7, §6.11–§6.14, §6.17): three phones join and
// Start; A browses an open stall and holds GRAB until it completes (item in A's pack, a toast on A
// only); B grabs during a forced merchant glance (merchant catch, the guard is alerted) and escapes by
// breaking line of sight; C Catch!es A mid-grab (C gets the pot, the TV shows the catch); a guard
// catches B (20 s in the stocks, B's phone shows IN THE STOCKS); the timer ends (HANDS UP! on every
// phone) and the TV reveals the cards lowest haul → highest. Host debug hooks (`?debug=1`,
// debugHooks/slice.ts) place characters and guards and quiet the merchants so each beat is staged.
import type { Page } from '@playwright/test';
import { closeContexts, expect, joinPhone, pcg, test, type Phone } from './helpers';
import { openSpikeHost, phoneId } from './helpers-tf7';

test.afterEach(closeContexts);

const TIME_SCALE = 2;

interface StallSpot {
  id: number;
  lane: string;
  x: number;
  y: number;
}
interface TvEv {
  e: string;
  seq: number;
  [k: string]: unknown;
}

/** Whether a TV event names this entity (its entity fields; `stall` and `coin` are other ids). */
const ENTITY_KEYS = ['by', 'at', 'thief', 'to', 'character', 'guard', 'merchant'];
const names = (e: TvEv, id: number) => ENTITY_KEYS.some((k) => e[k] === id);

const toast = (p: Phone) => p.page.locator('.pcg-toast');
const sheet = (p: Phone, name: string) => p.page.locator(`[data-sheet=${name}]`);

/** Taps BROWSE once the host says it applies, then dismisses the merchant's dialog with Leave. */
async function browse(p: Phone) {
  const main = p.page.locator('[data-role=main]');
  await expect(main).toHaveAttribute('data-main', 'browse');
  await main.click();
  await expect(sheet(p, 'stall')).toBeVisible();
  // The merchant walks over and asks (SPEC §6.6); Leave closes the dialog without suspicion.
  await expect(sheet(p, 'dialog')).toBeVisible({ timeout: 15_000 });
  await sheet(p, 'dialog').locator('[data-pick=leave]').click();
  await expect(sheet(p, 'dialog')).toHaveCount(0);
}

/** A free counter tile: the dearest one (longest grab) when `dearest`, else the first. */
async function freeTile(p: Phone, dearest = false) {
  const tiles = sheet(p, 'stall').locator('.tiles.counter .tile[data-state=free]');
  await expect(tiles.first()).toBeVisible();
  if (!dearest) return tiles.first();
  const prices = await tiles.locator('.price').allTextContents();
  const n = prices.map((t) => Number(t.replace(/\D/g, '')));
  return tiles.nth(n.indexOf(Math.max(...n)));
}

/** Presses a tile (mouse down) and resolves once the host's hold started (the bar runs). */
async function pressTile(p: Phone, tile: ReturnType<Page['locator']>) {
  const box = (await tile.boundingBox())!;
  await p.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.page.mouse.down();
  await expect(tile.locator('.hold-bar')).toBeVisible();
}

/** Waits until the host's hold for this phone runs (mid-steal). */
const holding = (tv: Page, player: string) =>
  expect
    .poll(async () => (await pcg<{ activity: string }>(tv, 'character', player)).activity, {
      intervals: [10],
    })
    .toBe('holding');

const tvLog = (tv: Page) => pcg<TvEv[]>(tv, 'tvLog');
async function logHas(tv: Page, pred: (e: TvEv) => boolean) {
  try {
    await expect.poll(async () => (await tvLog(tv)).some(pred), { timeout: 15_000 }).toBe(true);
  } catch (err) {
    console.log('tv log tail:', JSON.stringify((await tvLog(tv)).slice(-12)));
    throw err;
  }
}

test('one round of the slice on three phones', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await openSpikeHost(browser, `?debug=1&timeScale=${TIME_SCALE}`);
  const tv = host.page;
  const [A, B, C] = [
    await joinPhone(browser, host.code, 'Aulus'),
    await joinPhone(browser, host.code, 'Brutus'),
    await joinPhone(browser, host.code, 'Cassia'),
  ] as [Phone, Phone, Phone];
  const phones = [A, B, C];
  const lobby = (p: Phone) => p.page.locator('[data-screen=lobby]');
  for (const p of phones) await lobby(p).locator('[data-action=ready]').click();
  const start = lobby(A).locator('[data-action=start]');
  await expect(start).toBeEnabled();
  await start.click();
  for (const p of phones) await expect(p.page.locator('[data-screen=roundStart]')).toBeVisible();
  await expect.poll(() => pcg(tv, 'matchPhase'), { timeout: 15_000 }).toBe('play');
  for (const p of phones) await expect(p.page.locator('[data-screen=play]')).toBeVisible();
  await expect(tv.locator('[data-tv=play]')).toBeVisible();

  const [a, b, c] = await Promise.all(phones.map(phoneId));
  const charId = async (id: string) =>
    (await pcg<{ id: number; x: number; y: number } | null>(tv, 'character', id))!;
  // Real time for the beats, so a short grab is still live when a catcher, a glance or a guard acts.
  await pcg(tv, 'setTimeScale', 1);
  // Stage the beats: guards off duty and merchants quiet until a beat asks for them.
  await expect.poll(async () => (await pcg<unknown[]>(tv, 'guards')).length).toBeGreaterThan(0);
  await pcg(tv, 'parkGuards');
  await pcg(tv, 'calmMerchants', 600_000);
  const stalls = await pcg<StallSpot[]>(tv, 'stalls');
  expect(stalls.length).toBeGreaterThanOrEqual(2);
  const s1 = stalls[0]!;
  const s2 = stalls.at(-1)!;

  // ---- A: browse, hold GRAB until it completes → item in A's pack, a toast on A only ----
  await pcg(tv, 'shoo', s1.x, s1.y, 2);
  await pcg(tv, 'place', a, s1.x, s1.y, -Math.PI / 2);
  await browse(A);
  const aId = (await charId(a)).id;
  const mark = Math.max(0, ...(await tvLog(tv)).map((e) => e.seq));
  const t1 = await freeTile(A);
  await pressTile(A, t1);
  await expect(toast(A)).toHaveText(/^\+\d+ /, { timeout: 10_000 });
  await A.page.mouse.up();
  expect((await pcg<{ items: string[] }>(tv, 'bag', a)).items).toHaveLength(1);
  for (const p of [B, C]) await expect(toast(p)).toHaveCount(0);
  // Nothing on the TV names A for a successful grab: only the counter changes (SPEC §6.11).
  const during = (await tvLog(tv)).filter((e) => e.seq > mark);
  expect(during.filter((e) => names(e, aId))).toEqual([]);
  expect(during.some((e) => e.e === 'stallChanged' && e.stall === s1.id)).toBe(true);

  // ---- C Catch!es A mid-grab → C gets the pot; the TV shows the catch ----
  const potOfA = Math.floor((await pcg<{ purse: number }>(tv, 'bag', a)).purse * 0.25);
  const cPurse = (await pcg<{ purse: number }>(tv, 'bag', c)).purse;
  const at = await charId(a);
  await pcg(tv, 'shoo', at.x, at.y, 2);
  await pcg(tv, 'place', a, at.x, at.y);
  await pcg(tv, 'place', c, at.x + 0.7, at.y, Math.PI); // beside A, facing A
  // Slow motion for this beat, so C's tap surely lands while A's grab runs (the hold is host time).
  await pcg(tv, 'setTimeScale', 0.2);
  await pressTile(A, await freeTile(A, true));
  await holding(tv, a);
  await C.page.locator('[data-role=catch]').click();
  await logHas(tv, (e) => e.e === 'grabAttempt' && e.at === at.id && e.right === true);
  await logHas(tv, (e) => e.e === 'caught' && e.thief === at.id);
  await A.page.mouse.up();
  await pcg(tv, 'setTimeScale', 1);
  expect((await pcg<{ purse: number }>(tv, 'bag', c)).purse).toBe(cPurse + potOfA);
  await expect(A.page.locator('.caught-banner')).toBeVisible();
  await expect(toast(C)).toContainText('+');

  // ---- B grabs during a forced glance → merchant catch, guard alert; B escapes out of sight ----
  await pcg(tv, 'shoo', s2.x, s2.y, 2);
  await pcg(tv, 'place', b, s2.x, s2.y, -Math.PI / 2);
  await browse(B);
  const bId = (await charId(b)).id;
  // One guard on duty in B's lane, a few tiles off and looking away from B.
  const gx = s2.x > 20 ? s2.x - 5 : s2.x + 5;
  await pcg(tv, 'placeGuard', 0, gx, s2.y + 1.2, s2.x > 20 ? Math.PI : 0);
  // The look lands 120 ms into B's grab (the hook fires on the step the hold starts).
  await pcg(tv, 'glanceOnHold', b, s2.id, 120);
  await pressTile(B, await freeTile(B, true));

  await logHas(tv, (e) => e.e === 'shout' && e.at === bId);
  await B.page.mouse.up();
  await expect
    .poll(async () =>
      (await pcg<{ mode: string; thief: number | null }[]>(tv, 'guards')).some(
        (g) => g.mode === 'chase' && g.thief === bId,
      ),
    )
    .toBe(true);
  // Break line of sight: B is across the market, behind the middle row, out of the cone's range.
  const far = { x: s2.x > 20 ? 2 : 38, y: s2.y > 20 ? 15.5 : 31.5 };
  await pcg(tv, 'place', b, far.x, far.y);
  await logHas(tv, (e) => e.e === 'guardGiveUp');
  expect((await tvLog(tv)).some((e) => e.e === 'caught' && e.thief === bId)).toBe(false);

  // ---- a guard catches B mid-grab → 20 s in the stocks; B's phone shows IN THE STOCKS ----
  await pcg(tv, 'parkGuards');
  await pcg(tv, 'calmMerchants', 600_000);
  await pcg(tv, 'shoo', s2.x, s2.y, 2);
  await pcg(tv, 'place', b, s2.x, s2.y, -Math.PI / 2);
  await expect(sheet(B, 'stall')).toBeVisible();
  // A guard steps up 2.5 tiles in front of B, facing B, on the step B's grab starts.
  await pcg(tv, 'guardOnHold', b, 0, s2.x, s2.y + 2.5, -Math.PI / 2);
  await pressTile(B, await freeTile(B, true));
  await logHas(tv, (e) => e.e === 'guardSpot' && e.at === bId);
  await B.page.mouse.up();
  await pcg(tv, 'setTimeScale', 4); // the march and the stocks
  await logHas(tv, (e) => e.e === 'caught' && e.thief === bId);
  await expect(B.page.locator('[data-screen=stocks]')).toBeVisible({ timeout: 30_000 });
  await expect(B.page.locator('[data-screen=stocks]')).toContainText('IN THE STOCKS');
  await logHas(tv, (e) => e.e === 'stocksIn' && e.character === bId);
  const stocks = await tv.evaluate(
    (id) =>
      (
        window as unknown as {
          __pcg: { world(): { stocks: { character: number | null; endsInMs: number }[] } };
        }
      ).__pcg
        .world()
        .stocks.find((s) => s.character === id),
    bId,
  );
  expect(stocks!.endsInMs).toBeGreaterThan(15_000);
  expect(stocks!.endsInMs).toBeLessThanOrEqual(20_000);
  await tv.screenshot({ path: 'e2e/__screens__/tf12-stocks-tv.png' });
  await B.page.screenshot({ path: 'e2e/__screens__/tf12-stocks-phone.png' });

  // ---- time up → HANDS UP! on every phone; reveal cards lowest haul → highest ----
  await pcg(tv, 'setTimeScale', 2);
  await pcg(tv, 'endRound');
  for (const p of phones) {
    await expect(p.page.locator('[data-screen=handsUp]')).toBeVisible();
    await expect(p.page.locator('[data-screen=handsUp]')).toContainText('HANDS UP!');
  }
  const cards = tv.locator('[data-tv=reveal] [data-role=reveal-card]');
  await expect(cards).toHaveCount(3, { timeout: 20_000 });
  await expect(cards.nth(2)).not.toHaveAttribute('data-state', 'hidden', { timeout: 20_000 });
  const reveal = await pcg<{
    phase: string;
    reveal: { entries: { name: string; haul: number }[] };
  }>(tv, 'tvView');
  const entries = reveal.reveal.entries;
  const hauls = entries.map((e) => e.haul);
  expect(hauls).toEqual([...hauls].sort((x, y) => x - y));
  await expect(cards.locator('.reveal-name')).toHaveText(entries.map((e) => e.name));
  expect(new Set(entries.map((e) => e.name))).toEqual(new Set(['Aulus', 'Brutus', 'Cassia']));
  await tv.screenshot({ path: 'e2e/__screens__/tf12-reveal-tv.png' });
  await A.page.screenshot({ path: 'e2e/__screens__/tf12-handsup-phone.png' });
  expect(host.errors).toEqual([]);
});
