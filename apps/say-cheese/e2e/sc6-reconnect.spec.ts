// SC6 robustness (BUILD_PLAN §3 SC6; SPEC §6.3, §6.3.1, §7.4 Retry): a TV and phones through the real
// relay (2 s player window). Each phone's relay socket runs through a Playwright WebSocket route, so a
// test can cut it (both ends close, reconnects refused) and hold back photo chunks.
import type { BrowserContext, Page, WebSocketRoute } from '@playwright/test';
import {
  cameraAndReady,
  closeContexts,
  expect,
  hostPhase,
  hostState,
  joinOnPage,
  newPhone,
  openHost,
  RELAY_PORT,
  screen,
  sendRaw,
  setTimeScale,
  test,
  type Host,
} from './helpers';

test.afterEach(closeContexts);

/** The slice of the host's match state these tests read (`__pcg.state()`). */
interface State {
  players: {
    id: string;
    phoneId: string;
    name: string;
    score: number;
    connected: boolean;
    left: boolean;
  }[];
  queue: string[];
  round: {
    r: number;
    photographer: string;
    shots: number;
    photos: { index: number; url?: string }[];
  } | null;
}
const state = async (host: Host): Promise<State> => (await hostState(host)) as unknown as State;
test.setTimeout(180_000);

/** A phone whose relay socket the test controls. */
interface WiredPhone {
  context: BrowserContext;
  page: Page;
  name: string;
  /** Closes the relay socket on both ends and refuses reconnects until `up()`. */
  down(): Promise<void>;
  up(): void;
  /** While on, photo chunks from the phone never reach the relay (so they stay unacked). */
  hold(on: boolean): void;
}

async function wire(context: BrowserContext) {
  const st = { offline: false, hold: false, live: [] as WebSocketRoute[][] };
  await context.routeWebSocket(new RegExp(`:${RELAY_PORT}`), (ws) => {
    if (st.offline) {
      void ws.close();
      return;
    }
    const server = ws.connectToServer();
    st.live.push([ws, server]);
    ws.onMessage((m) => {
      if (st.hold && typeof m === 'string' && m.includes('"t":"chunk"')) return;
      server.send(m);
    });
  });
  return {
    async down() {
      st.offline = true;
      for (const [ws, server] of st.live) {
        await server!.close();
        await ws!.close();
      }
      st.live = [];
    },
    up: () => void (st.offline = false),
    hold: (on: boolean) => void (st.hold = on),
  };
}

async function openPlay(page: Page, host: Host): Promise<void> {
  await page.goto(`/play?code=${host.code}&debug=1`);
}

/** `joinPlayer` with a wired socket. */
async function joinWired(
  browser: Parameters<typeof newPhone>[0],
  host: Host,
  name: string,
): Promise<WiredPhone> {
  const context = await newPhone(browser);
  const w = await wire(context);
  const page = await context.newPage();
  await openPlay(page, host);
  await joinOnPage(page, name);
  await expect(screen(page, 'lobby')).toBeVisible();
  await expect
    .poll(async () => (await state(host)).players.some((p) => p.name === name))
    .toBe(true);
  return { context, page, name, ...w };
}

/** Host, phones, cameras, Ready, Start, rules skipped: the first round is announced. */
async function startMatch(browser: Parameters<typeof newPhone>[0], names: string[], query = '') {
  const host = await openHost(browser, `debug=1&timeScale=0.1${query}`);
  const phones: WiredPhone[] = [];
  for (const n of names) phones.push(await joinWired(browser, host, n));
  for (const p of phones) await cameraAndReady(p);
  const leader = phones[0]!;
  await leader.page.locator('[data-action=start]').click();
  await leader.page.locator('[data-action=skip]').click();
  await expect.poll(() => hostPhase(host)).toBe('announce');
  return { host, phones, leader };
}

async function photographer(host: Host, phones: WiredPhone[]) {
  const s = await state(host);
  const p = s.players.find((q) => q.id === s.round!.photographer)!;
  return { phone: phones.find((x) => x.name === p.name)!, id: p.id, phoneId: p.phoneId };
}

const seatOf = async (host: Host, name: string) =>
  (await state(host)).players.find((p) => p.name === name)!;

async function startShoot(page: Page): Promise<void> {
  await expect(screen(page, 'announce')).toBeVisible();
  await page.getByRole('button', { name: "I'm ready" }).click();
  await expect(screen(page, 'shoot')).toBeVisible({ timeout: 20_000 });
}

async function snap(page: Page, n: number): Promise<void> {
  for (let i = 1; i <= n; i++) {
    await screen(page, 'shoot').click({ position: { x: 200, y: 400 } });
    await expect(page.locator('.shot-counter')).toHaveText(`${i} / 15`);
    await page.waitForTimeout(450); // the 0.4 s shutter cooldown
  }
}

/** Walks the photographer's review to the end and confirms Finish review. */
async function finishReview(page: Page, photos: number): Promise<void> {
  const review = screen(page, 'review');
  for (let i = 1; i < photos; i++) await review.locator('[data-action=next]').click();
  await review.locator('[data-action=finish]').click();
  await review.locator('[data-action=confirmFinish]').click();
}

test('(a) a dodger offline during the shoot comes back, still in the match and taggable', async ({
  browser,
}) => {
  const { host, phones } = await startMatch(browser, ['Ann', 'Ben', 'Cat']);
  const ph = await photographer(host, phones);
  const dodger = phones.find((p) => p !== ph.phone)!;
  const before = await seatOf(host, dodger.name);

  await setTimeScale(host, 0.5); // a 10 s shoot
  await startShoot(ph.phone.page);
  await snap(ph.phone.page, 1);
  await dodger.down();
  await expect.poll(async () => (await seatOf(host, dodger.name)).connected).toBe(false);
  await dodger.page.waitForTimeout(2_500); // past the relay's 2 s player window
  dodger.up();
  await expect
    .poll(async () => (await seatOf(host, dodger.name)).connected, { timeout: 15_000 })
    .toBe(true);
  const after = await seatOf(host, dodger.name);
  expect(after.id).toBe(before.id);

  const review = screen(ph.phone.page, 'review');
  await expect(review).toBeVisible({ timeout: 30_000 });
  await expect(screen(dodger.page, 'review')).toBeVisible();
  await review.locator('.stage').click({ position: { x: 60, y: 60 } });
  await review.locator(`.sheet [data-player="${before.id}"]`).click();
  await finishReview(ph.phone.page, 1);
  await expect.poll(() => hostPhase(host)).toBe('results');
  expect((await seatOf(host, dodger.name)).score).toBe(1);
});

test('(b) the photographer drops mid-upload: rejoins by key, unacked photos arrive, review goes on', async ({
  browser,
}) => {
  const { host, phones } = await startMatch(browser, ['Ann', 'Ben', 'Cat']);
  const ph = await photographer(host, phones);
  const p = ph.phone;

  await setTimeScale(host, 0.5);
  await startShoot(p.page);
  p.hold(true);
  await snap(p.page, 3);
  await expect.poll(async () => (await state(host)).round!.shots).toBe(3);
  expect((await state(host)).round!.photos.filter((x) => x.url)).toHaveLength(0);

  // Cut the socket past the relay window: the phone comes back under a new relay id.
  await p.down();
  p.hold(false);
  await p.page.waitForTimeout(2_500);
  p.up();
  await expect
    .poll(async () => (await seatOf(host, p.name)).phoneId, { timeout: 15_000 })
    .not.toBe(ph.phoneId);
  expect((await seatOf(host, p.name)).id).toBe(ph.id);
  await expect(screen(p.page, 'review')).toBeVisible({ timeout: 30_000 });
  const st = await state(host);
  expect(st.round!.photos.filter((x) => x.url)).toHaveLength(3);

  // Then the tab is killed and reopened (same localStorage, new sessionStorage): rejoin by key again;
  // the local photos are gone, so review shows the frame and "Look at the TV".
  const rejoinedId = (await seatOf(host, p.name)).phoneId;
  await p.page.close();
  await expect.poll(async () => (await seatOf(host, p.name)).connected).toBe(false);
  await new Promise((r) => setTimeout(r, 2_500));
  const page2 = await p.context.newPage();
  await openPlay(page2, host);
  await expect(screen(page2, 'review')).toBeVisible();
  await expect(screen(page2, 'review').locator('.lost')).toHaveText('Look at the TV');
  expect((await seatOf(host, p.name)).phoneId).not.toBe(rejoinedId);
  await finishReview(page2, 3);
  await expect.poll(() => hostPhase(host)).toBe('results');
});

test('(c) a host reload mid-shoot keeps the room, scores and queue, and replays the round', async ({
  browser,
}) => {
  const { host, phones, leader } = await startMatch(browser, ['Ann', 'Ben', 'Cat']);
  // Round 1: one photo, one tag, so the scores aren't all zero.
  const ph1 = await photographer(host, phones);
  const caught = phones.find((p) => p !== ph1.phone)!;
  const caughtId = (await seatOf(host, caught.name)).id;
  await setTimeScale(host, 0.3);
  await startShoot(ph1.phone.page);
  await snap(ph1.phone.page, 1);
  const review = screen(ph1.phone.page, 'review');
  await expect(review).toBeVisible({ timeout: 20_000 });
  await review.locator('.stage').click({ position: { x: 60, y: 60 } });
  await review.locator(`.sheet [data-player="${caughtId}"]`).click();
  await finishReview(ph1.phone.page, 1);
  await expect.poll(() => hostPhase(host)).toBe('results');
  await leader.page.locator('[data-action=next]').click();
  await expect.poll(() => hostPhase(host)).toBe('announce');

  // Round 2: reload the TV during a long shoot.
  const ph2 = await photographer(host, phones);
  await expect(screen(ph2.phone.page, 'announce')).toBeVisible();
  await ph2.phone.page.getByRole('button', { name: "I'm ready" }).click();
  await setTimeScale(host, 1); // the shoot timer starts after scatter: 20 s
  await expect.poll(() => hostPhase(host), { timeout: 10_000 }).toBe('shoot');
  const before = await state(host);

  await host.page.reload();
  await expect
    .poll(
      () =>
        host.page.evaluate(
          () => (window as { __pcg?: { code(): string | null } }).__pcg?.code() ?? null,
        ),
      {
        timeout: 20_000,
      },
    )
    .toBe(host.code);
  await expect.poll(() => hostPhase(host)).toBe('announce');
  const after = await state(host);
  expect(after.round!.photographer).toBe(before.round!.photographer);
  expect(after.round!.r).toBeGreaterThan(before.round!.r);
  expect(after.players.map((p) => [p.id, p.score])).toEqual(
    before.players.map((p) => [p.id, p.score]),
  );
  expect(after.queue).toEqual(before.queue);
  expect(after.players.find((p) => p.id === caughtId)!.score).toBe(1);

  // The replay runs: the same photographer's phone is back on announce.
  await startShoot(ph2.phone.page);
  await expect.poll(() => hostPhase(host)).toBe('shoot');
});

test('(d) leader removes a player, another leaves: both gone from standings', async ({
  browser,
}) => {
  const { host, phones, leader } = await startMatch(browser, ['Ann', 'Ben', 'Cat', 'Dan']);
  const ph = await photographer(host, phones);
  await setTimeScale(host, 0.3);
  await startShoot(ph.phone.page);
  await snap(ph.phone.page, 1);
  await expect(screen(ph.phone.page, 'review')).toBeVisible({ timeout: 20_000 });
  await finishReview(ph.phone.page, 1);
  await expect(host.page.locator('.view.results')).toBeVisible();

  const others = phones.filter((p) => p !== leader);
  const [removed, leaver] = others as [WiredPhone, WiredPhone];
  const removedId = (await seatOf(host, removed.name)).id;
  const leaverId = (await seatOf(host, leaver.name)).id;
  const standing = (id: string) =>
    host.page.locator(`.view.results .standings [data-player="${id}"]`);
  await expect(standing(removedId)).toHaveCount(1);

  await sendRaw(leader, { t: 'leader', action: 'remove', playerId: removedId });
  await expect(standing(removedId)).toHaveCount(0);
  await expect(removed.page.locator('[data-overlay=kicked]')).toBeVisible();

  await leaver.page.locator('[data-action=menu]').click();
  await leaver.page.locator('[data-action=leave]').click();
  await leaver.page.locator('[data-action=confirmLeave]').click();
  await expect(screen(leaver.page, 'left')).toBeVisible();
  await expect(standing(leaverId)).toHaveCount(0);

  const st = await state(host);
  const queue = st.queue;
  expect(queue).not.toContain(removedId);
  expect(queue).not.toContain(leaverId);
});
