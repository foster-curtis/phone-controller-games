// Tip-off spike (BUILD_PLAN TF4 acceptance; SPEC §6.13, §12.6): the TV at `/?spike=tipoff&debug=1` and
// one phone at `/play?spike=tipoff`. The phone asks for 3 snapshots; each arrives as a decodable JPEG of
// at most 120 KB, the phone's socket never closes (an oversize frame would close it with 1009), and a
// tap on the image outlines a hit area.
import {
  blockFonts,
  closeContexts,
  expect,
  noFullscreen,
  PHONE_VIEWPORT,
  test,
  TV_VIEWPORT,
} from './helpers';

test.afterEach(closeContexts);

interface Hit {
  targetId: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface PhoneHooks {
  status(): string;
  stats(): { reconnects: number; lastClose: { code: number } | null };
  results(): { bytes: number; chunks: number; ms: number; w: number; h: number; hits: number }[];
  header(): { snapshot: { id: number; w: number; h: number }; hits: Hit[] } | null;
  picked(): number | null;
}
interface HostHooks {
  code(): string | null;
  sends(): { bytes: number; acked: boolean; own: number; hits: number }[];
}
type W<T> = { __pcg?: T };

test('a phone requests 3 tip snapshots; each arrives whole, small, and tappable', async ({
  browser,
}) => {
  const tvCtx = await browser.newContext({ viewport: TV_VIEWPORT });
  await blockFonts(tvCtx);
  const tv = await tvCtx.newPage();
  await tv.goto('/?spike=tipoff&debug=1');
  await expect
    .poll(() => tv.evaluate(() => (window as W<HostHooks>).__pcg?.code() ?? null), {
      timeout: 20_000,
    })
    .toMatch(/^[A-Z]{4}$/);
  const code = (await tv.evaluate(() => (window as W<HostHooks>).__pcg!.code()))!;
  await expect(tv.locator('[data-role=room-code]')).toHaveText(code);
  await expect(tv.locator('.spike-qr svg')).toBeVisible();

  const phoneCtx = await browser.newContext({ viewport: PHONE_VIEWPORT, hasTouch: true });
  await blockFonts(phoneCtx);
  await noFullscreen(phoneCtx);
  const phone = await phoneCtx.newPage();
  const closes: number[] = [];
  phone.on('websocket', (ws) => ws.on('close', () => closes.push(Date.now())));
  await phone.goto(`/play?spike=tipoff&code=${code}&debug=1`);
  const shoot = phone.locator('[data-action=snapshot]');
  await expect(shoot).toBeEnabled({ timeout: 20_000 });

  const results = () => phone.evaluate(() => (window as W<PhoneHooks>).__pcg!.results());

  for (let n = 1; n <= 3; n++) {
    await shoot.click();
    await expect.poll(async () => (await results()).length).toBe(n);
    const sheet = phone.locator('[data-screen=tipoff]');
    await expect(sheet).toHaveAttribute('data-loaded', 'true');
    const img = sheet.locator('[data-role=snapshot]');
    await expect
      .poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth))
      .toBeGreaterThan(0);

    const r = (await results())[n - 1]!;
    expect(r.bytes).toBeLessThanOrEqual(120 * 1024);
    expect(r).toMatchObject({ w: 960, h: 540 });
    expect(r.hits).toBe(29); // 30 characters less the phone's own
    expect(await img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBe(960);

    // Tap the middle of a hit area on screen: it gets the outline.
    const header = (await phone.evaluate(() => (window as W<PhoneHooks>).__pcg!.header()))!;
    const hit = header.hits[Math.floor(header.hits.length / 2)]!;
    const box = (await sheet.locator('[data-role=stage]').boundingBox())!;
    const scale = Math.min(box.width / header.snapshot.w, box.height / header.snapshot.h);
    const ox = box.x + (box.width - header.snapshot.w * scale) / 2;
    const oy = box.y + (box.height - header.snapshot.h * scale) / 2;
    await phone.mouse.click(ox + (hit.x + hit.w / 2) * scale, oy + (hit.y + hit.h / 2) * scale);
    await expect(sheet).toHaveAttribute('data-selected', /^\d+$/);
    await expect(sheet.locator('[data-role=outline]')).toHaveAttribute('visibility', 'visible');
    await expect(sheet.locator('[data-action=send]')).toBeEnabled();

    if (n === 1) await phone.screenshot({ path: 'e2e/__screens__/tf4-tipoff-phone.png' });
    if (n < 3) await sheet.locator('[data-action=cancel]').click();
    else await sheet.locator('[data-action=send]').click();
    await expect(sheet).toHaveCount(0);
  }
  expect(await phone.evaluate(() => (window as W<PhoneHooks>).__pcg!.picked())).not.toBeNull();

  // Every snapshot acked on the TV; the phone's socket never closed or reconnected.
  await expect
    .poll(() => tv.evaluate(() => (window as W<HostHooks>).__pcg!.sends().map((s) => s.acked)))
    .toEqual([true, true, true]);
  const stats = await phone.evaluate(() => (window as W<PhoneHooks>).__pcg!.stats());
  expect(stats.lastClose).toBeNull();
  expect(stats.reconnects).toBe(0);
  expect(closes).toEqual([]);

  const log = await results();
  console.info('tip-off spike (local relay):', JSON.stringify(log));
  await tv.screenshot({ path: 'e2e/__screens__/tf4-tipoff-tv.png' });
});
