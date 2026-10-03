import { expect, type Page } from '@playwright/test';
import { joinAndReady, signIn, test, uniqueName } from './helpers';

const RESULTS = { name: 'Voltar à sala' } as const;

/** Host creates a 4-seat Fodinha room that ends quickly (3 points, hands up to 3 cards). */
async function createFodinhaRoom(host: Page): Promise<string> {
  await host.getByRole('button', { name: 'Criar sala' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByText('Fodinha', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Personalizar' }).click();
  await dialog.getByText('4', { exact: true }).click();
  await dialog.getByText('3 pontos', { exact: true }).click();
  await dialog.getByText('3 cartas', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  await expect(host.getByText('Perde quem chegar a: 3 pontos')).toBeVisible();
  return host.url().split('/').pop() as string;
}

/**
 * Bids the lowest allowed value, or plays the lowest playable card, if it is this
 * player's turn. Clicks are dispatched to the element (like a tap): on narrow
 * phones the dev-mode badge of Next.js sits over the first bid button.
 */
async function takeTurn(page: Page): Promise<boolean> {
  const panel = page.getByRole('group', { name: 'Aposta' });
  if (await panel.isVisible({ timeout: 50 }).catch(() => false)) {
    const bid = panel.getByRole('button', { name: /^\d$/ }).and(page.locator(':enabled')).first();
    if ((await bid.count()) === 0) return false;
    const value = await bid.textContent();
    await bid.dispatchEvent('click'); // pick…
    await panel.getByRole('button', { name: `Apostar ${value}` }).dispatchEvent('click'); // …and confirm
    return true;
  }
  const playable = page.locator('[data-hand-card] [role="button"]:has([data-card-state="playable"])');
  if ((await playable.count()) > 0) {
    await playable.first().dispatchEvent('click'); // select
    await page.getByRole('button', { name: 'Jogar', exact: true }).dispatchEvent('click');
    return true;
  }
  return false;
}

/** Accessible name of the card another player sees in front of `owner` during a blind round. */
async function cardInFrontOf(viewer: Page, owner: string): Promise<string | null> {
  const seat = viewer.locator('section', { hasText: owner }).getByRole('group', { name: 'Carta na testa' });
  if ((await seat.count()) === 0) return null;
  return seat.getByRole('img').first().getAttribute('aria-label');
}

test('four browsers play a complete Fodinha match; nobody ever sees their own blind card', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const names = ['ana', 'rui', 'eva', 'ze'].map(uniqueName);
  const pages = [
    await signIn(browser, names[0] as string),
    await signIn(browser, names[1] as string, { width: 390, height: 844 }),
    await signIn(browser, names[2] as string, { width: 820, height: 1180 }),
    await signIn(browser, names[3] as string, { width: 360, height: 740 }),
  ];
  const [host, ...guests] = pages as [Page, ...Page[]];

  const code = await createFodinhaRoom(host);
  for (const guest of guests) await joinAndReady(guest, code);
  await host.getByRole('button', { name: 'Começar partida' }).click();

  // Round 1 is blind: every player sees the other three cards, never their own.
  const rui = pages[1] as Page;
  await expect(rui.getByText('A tua carta — não a podes ver')).toBeVisible();
  const ruiCard = await cardInFrontOf(host, names[1] as string);
  expect(ruiCard).toBeTruthy();
  await expect(rui.getByRole('img', { name: ruiCard as string })).toHaveCount(0);
  await expect(host.getByRole('img', { name: ruiCard as string })).toHaveCount(1);

  // Reconnect in the middle of the blind round: the card is still hidden from its owner.
  await rui.reload();
  await expect(rui.getByText(/A tua carta/)).toBeVisible();
  await expect(rui.getByRole('img', { name: ruiCard as string })).toHaveCount(0);

  // Play until every player gets the results.
  const deadline = Date.now() + 360_000;
  while (!(await host.getByRole('button', RESULTS).isVisible())) {
    expect(Date.now(), 'match should finish in time').toBeLessThan(deadline);
    let acted = false;
    for (const page of pages) acted = (await takeTurn(page)) || acted;
    await host.waitForTimeout(acted ? 300 : 150);
  }
  for (const page of pages) await expect(page.getByRole('button', RESULTS)).toBeVisible();
  // The results show who lost (with their points) and who survived.
  const results = host.getByRole('dialog', { name: /Perdeste|Sobreviveste/ });
  await expect(results).toBeVisible();
  await expect(results.getByText(/^(Perdeu|Perderam)$/)).toBeVisible();
  await expect(results.getByText(/\d+ pontos?$/).first()).toBeVisible();

  // Back in the room, the last result lists the loser(s); the match is in the history.
  await host.getByRole('button', RESULTS).click();
  await expect(host.getByText('Última partida')).toBeVisible();
  await host.goto('/profile');
  await expect(host.getByText('Fodinha').first()).toBeVisible();
});
