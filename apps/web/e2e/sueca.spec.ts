import { expect, type Page } from '@playwright/test';
import { signIn, test, uniqueName } from './helpers';

const RESULTS = { name: 'Voltar à sala' } as const;
const PLAYABLE = '[data-hand-card] [role="button"]:has([data-card-state="playable"])';

/** Cuts from the top, or plays a legal card: tap to raise it, tap again to play it. */
async function takeTurn(page: Page): Promise<boolean> {
  const cut = page.getByRole('button', { name: 'De cima', exact: true });
  if (await cut.isVisible().catch(() => false)) {
    await cut.click();
    return true;
  }
  const playable = page.locator(PLAYABLE);
  const count = await playable.count();
  if (count === 0) return false;
  // The same card both times: once raised it is no longer "playable" but "selected".
  const card = await playable.nth(Math.floor(Math.random() * count)).elementHandle();
  if (!card) return false;
  await card.dispatchEvent('click');
  await page.waitForTimeout(120);
  await card.dispatchEvent('click');
  return true;
}

/** Seat by its accessible name in the room's table, e.g. "Norte: ana_x. Trocar". */
const seat = (page: Page, side: string) => page.getByRole('button', { name: new RegExp(`^${side}:`) });

test('four browsers pick partners and play Sueca; the table waits for a player who drops', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const names = ['ana', 'rui', 'eva', 'ze'].map(uniqueName);
  const pages = [
    await signIn(browser, names[0] as string),
    await signIn(browser, names[1] as string, { width: 390, height: 844 }),
    await signIn(browser, names[2] as string, { width: 820, height: 1180 }),
    await signIn(browser, names[3] as string, { width: 360, height: 740 }),
  ];
  const [host, rui, eva, ze] = pages as [Page, Page, Page, Page];

  await host.getByRole('button', { name: 'Criar sala' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByText('Sueca', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Personalizar' }).click();
  await dialog.getByRole('radiogroup', { name: 'Partida a' }).getByText('1 jogo', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = host.url().split('/').pop() as string;
  await expect(host.getByText('Partida a: 1 jogo')).toBeVisible();

  // Rui arrives second (East) and sits North instead, across from the host: partners.
  await rui.goto(`/room/${code}`);
  await expect(seat(rui, 'Norte')).toHaveAccessibleName(/lugar livre/);
  await seat(rui, 'Norte').click();
  await expect(seat(host, 'Norte')).toHaveAccessibleName(new RegExp(names[1] as string));
  for (const page of [eva, ze]) await page.goto(`/room/${code}`);
  await expect(seat(host, 'Este')).toHaveAccessibleName(new RegExp(names[2] as string));
  await expect(seat(host, 'Oeste')).toHaveAccessibleName(new RegExp(names[3] as string));

  // The host swaps East and West.
  await host.getByRole('button', { name: 'Trocar lugares' }).click();
  await seat(host, 'Este').click();
  await seat(host, 'Oeste').click();
  await expect(seat(host, 'Este')).toHaveAccessibleName(new RegExp(names[3] as string));
  await expect(seat(eva, 'Oeste')).toHaveAccessibleName(/\(tu\)|tu\b/);

  for (const page of [rui, eva, ze]) {
    await page.getByRole('button', { name: 'Estou pronto' }).click();
    await expect(page.getByRole('button', { name: 'Afinal, não estou pronto' })).toBeVisible();
  }
  await host.getByRole('button', { name: 'Começar partida' }).click();

  // Someone cuts; the others are told who.
  await expect(host.getByRole('group', { name: 'A tua mão: 10 cartas' })).toBeVisible({ timeout: 40_000 });
  // During the hand the chat is closed.
  await expect(host.getByRole('button', { name: 'Chat fechado: abre no fim da mão' })).toBeVisible();

  const deadline = Date.now() + 480_000;
  let dropped = false;
  let rounds = 0;
  while (!(await host.getByRole('button', RESULTS).isVisible())) {
    expect(Date.now(), 'match should finish in time').toBeLessThan(deadline);
    let acted = false;
    for (const page of pages) acted = (await takeTurn(page)) || acted;
    rounds += 1;

    // Mid-hand, Eva closes the room: the table stops and waits for her, then picks up.
    if (!dropped && rounds > 14) {
      dropped = true;
      await eva.goto('about:blank');
      const waiting = host.getByRole('alertdialog', { name: new RegExp(`À espera de ${names[2]}`) });
      await expect(waiting).toBeVisible({ timeout: 10_000 });
      await expect(rui.locator(PLAYABLE)).toHaveCount(0);
      await eva.goto(`/room/${code}`);
      await expect(waiting).toHaveCount(0, { timeout: 20_000 });
      await expect(eva.getByRole('group', { name: /^A tua mão: \d+ cartas?$/ })).toBeVisible();
    }
    await host.waitForTimeout(acted ? 250 : 150);
  }
  expect(dropped).toBe(true);

  for (const page of pages) await expect(page.getByRole('button', RESULTS)).toBeVisible();
  // Won by a pair, with each pair's games, and the hands of the match.
  const results = host.getByRole('dialog', { name: /Ganhámos|Perdemos/ });
  await expect(results).toBeVisible();
  await expect(results.getByText(/^Ganharam .+ — \d+ a \d+$/)).toBeVisible();
  await expect(results.getByText(/^\d+ jogos?$/)).toHaveCount(2);
  await expect(results.getByText(/^Mãos \(\d+\)$/)).toBeVisible();
  // Partners share the result.
  const hostWon = await host.getByRole('dialog', { name: /Ganhámos/ }).isVisible();
  await expect(rui.getByRole('dialog', { name: hostWon ? /Ganhámos/ : /Perdemos/ })).toBeVisible();
  await expect(ze.getByRole('dialog', { name: hostWon ? /Perdemos/ : /Ganhámos/ })).toBeVisible();

  await host.getByRole('button', RESULTS).click();
  await expect(host.getByText('Última partida')).toBeVisible();
  await expect(host.getByText(/^Ganharam /)).toBeVisible();
});
