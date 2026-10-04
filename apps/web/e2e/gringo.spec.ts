import { expect, type Page } from '@playwright/test';
import { joinAndReady, signIn, test, uniqueName } from './helpers';

const RESULTS = { name: 'Voltar à sala' } as const;

const visible = (page: Page, name: string | RegExp, exact = true) =>
  page
    .getByRole('button', { name, exact })
    .first()
    .isVisible()
    .catch(() => false);

/** Taps a card the way a finger would: grids are tight, so the click goes to the card itself. */
async function tapRandom(page: Page, name: RegExp): Promise<boolean> {
  const cards = page.getByRole('button', { name });
  const count = await cards.count();
  if (count === 0) return false;
  await cards.nth(Math.floor(Math.random() * count)).dispatchEvent('click');
  return true;
}

/**
 * Plays this player's move, if there is one: memorise, draw (or say "Gringo"
 * after a few turns), swap a card in now and then or discard — using the power
 * most of the time — and once in a while snap a card with the double tap.
 */
async function takeTurn(page: Page, turn: number): Promise<boolean> {
  if (await visible(page, 'Memorizei')) {
    await page.getByRole('button', { name: 'Memorizei' }).click();
    return true;
  }
  const status = (await page.getByRole('status').filter({ hasText: /./ }).allTextContents()).join(' ');
  // Snapped someone else's card: one of one's own goes to them.
  if (/Escolhe uma carta tua para dar/.test(status)) {
    return tapRandom(page, /^A tua carta \[\d+\]$/);
  }
  if (/Bater\? Toca duas vezes/.test(status) && Math.random() < 0.15) {
    // Mostly one's own card; now and then another player's.
    const whose = Math.random() < 0.3 ? /^Carta \[\d+\] de / : /^A tua carta \[\d+\]$/;
    const cards = page.getByRole('button', { name: whose });
    const count = await cards.count();
    if (count > 0) {
      const card = cards.nth(Math.floor(Math.random() * count));
      await card.dispatchEvent('click');
      await card.dispatchEvent('click');
      return true;
    }
  }
  if (await visible(page, 'Gringo!')) {
    if (turn > 8 && Math.random() < 0.3) {
      await page.getByRole('button', { name: 'Gringo!' }).click();
      return true;
    }
  }
  for (const name of ['Tirar carta', 'Passar', 'Não trocar', 'Já memorizei']) {
    if (await visible(page, name)) {
      await page.getByRole('button', { name, exact: true }).click();
      return true;
    }
  }
  // With a power on offer, the plain discard reads "Só descartar".
  const discard = /^(Só descartar|Descartar)$/;
  if (await visible(page, discard)) {
    const power = page.getByRole('button', { name: /Usar poder$/ });
    if ((await power.isVisible().catch(() => false)) && Math.random() < 0.8) await power.click();
    else if (Math.random() < 0.35) await tapRandom(page, /^A tua carta \[\d+\]$/);
    else await page.getByRole('button', { name: discard }).click();
    return true;
  }
  if (await visible(page, 'Não usar')) {
    // Peek at someone, look at one's own card, or swap blindly: tap theirs, then (if asked) one's own.
    if (!(await tapRandom(page, /^Carta \[\d+\] de /))) await tapRandom(page, /^A tua carta \[\d+\]$/);
    await page.waitForTimeout(150);
    if (await visible(page, 'Não usar')) {
      if (!(await tapRandom(page, /^A tua carta \[\d+\]$/))) {
        await page.getByRole('button', { name: 'Não usar' }).click();
      }
    }
    return true;
  }
  return false;
}

test('four browsers play Gringo to the end; a reload mid-game loses nothing', async ({ browser }) => {
  test.setTimeout(600_000);
  const names = ['ana', 'rui', 'eva', 'ze'].map(uniqueName);
  const pages = [
    await signIn(browser, names[0] as string),
    await signIn(browser, names[1] as string, { width: 390, height: 844 }),
    await signIn(browser, names[2] as string, { width: 820, height: 1180 }),
    await signIn(browser, names[3] as string, { width: 360, height: 740 }),
  ];
  const [host, ...guests] = pages as [Page, ...Page[]];

  await host.getByRole('button', { name: 'Criar sala' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByText('Gringo', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Personalizar' }).click();
  await dialog.getByText('4', { exact: true }).first().click();
  await dialog.getByRole('radiogroup', { name: 'Dizer "Gringo"' }).getByText('Sim', { exact: true }).click();
  await dialog.getByText('1 volta', { exact: true }).click();
  await dialog.getByText('2s', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = host.url().split('/').pop() as string;
  for (const guest of guests) await joinAndReady(guest, code);
  await host.getByRole('button', { name: 'Começar partida' }).click();

  // Everyone sees their own four cards, numbered, and the bottom two face up for a moment.
  for (const page of pages) {
    await expect(page.getByRole('group', { name: 'As tuas cartas' })).toBeVisible();
    await expect(page.getByText('Memoriza as tuas cartas [3] e [4]!')).toBeVisible();
    await expect(page.getByRole('group', { name: 'As tuas cartas' }).getByRole('img')).toHaveCount(4);
  }

  const deadline = Date.now() + 540_000;
  let reloaded = false;
  let turn = 0;
  while (!(await host.getByRole('button', RESULTS).isVisible())) {
    expect(Date.now(), 'game should finish in time').toBeLessThan(deadline);
    let acted = false;
    turn += 1;
    for (const page of pages) acted = (await takeTurn(page, turn)) || acted;

    // Mid-game, a player reloads: the table comes back as it was.
    const rui = pages[1] as Page;
    if (!reloaded && turn > 12) {
      reloaded = true;
      await rui.reload();
      await expect(rui.getByRole('group', { name: 'As tuas cartas' })).toBeVisible();
      await expect(rui.getByRole('status', { name: /^Baralho: \d+ cartas?$/ })).toBeVisible();
    }
    await host.waitForTimeout(acted ? 200 : 150);
  }
  expect(reloaded).toBe(true);

  for (const page of pages) await expect(page.getByRole('button', RESULTS)).toBeVisible();
  // The fewest points win; everyone is listed with their points.
  const results = host.getByRole('dialog', { name: /Ganhaste|Terminaste|Empate|Ficaste/ });
  await expect(results).toBeVisible();
  await expect(results.getByText(/^[-−]?\d+ pontos?$/)).toHaveCount(4);
  await expect(
    results.getByText('Ganha quem tiver menos pontos; os empates partilham o lugar.'),
  ).toBeVisible();

  await host.getByRole('button', RESULTS).click();
  await expect(host.getByText('Última partida')).toBeVisible();
});
