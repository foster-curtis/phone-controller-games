// Setup smoke (scaffold; SPEC §6.18): the TV opens a room and shows its code; two phones join by code
// and name; both land on the lobby screen with both names (TF7-fix-1: the lobby replaced "Connected"),
// and the TV lists both names.
import { closeContexts, expect, hostPlayers, joinPhone, openHost, test } from './helpers';

test.afterEach(closeContexts);

test('host shows a room code; two phones join and the host lists both names', async ({
  browser,
}) => {
  const host = await openHost(browser);
  await expect(host.page.locator('[data-role=room-code]')).toHaveText(host.code);
  await expect(host.page.locator('.lobby-qr svg')).toBeVisible();
  await expect(host.page.locator('canvas')).toHaveCount(1);

  const phones = [
    await joinPhone(browser, host.code, 'Livia'),
    await joinPhone(browser, host.code, 'Marcus'),
  ];
  for (const phone of phones) {
    const lobby = phone.page.locator('[data-screen=lobby]');
    await expect(lobby).toBeVisible();
    await expect(lobby.locator('.player .label')).toHaveText(['Livia', 'Marcus']);
    await expect(lobby.locator('[data-action=ready]')).toBeVisible();
  }

  await expect(host.page.locator('[data-role=player]')).toHaveText(['Livia', 'Marcus']);
  expect((await hostPlayers(host)).map((p) => p.name)).toEqual(['Livia', 'Marcus']);

  // For review (gitignored): the TV lobby and a joined phone.
  await host.page.screenshot({ path: 'e2e/__screens__/smoke-tv-lobby.png' });
  await phones[0]!.page.screenshot({ path: 'e2e/__screens__/smoke-phone-lobby.png' });
});
