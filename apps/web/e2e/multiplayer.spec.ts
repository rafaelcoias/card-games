import { expect, test, type Page } from '@playwright/test';
import { createRoom, joinAndReady, signIn, tap, uniqueName } from './helpers';

const RESULTS = { name: 'Voltar à sala' } as const;

test('two browsers play "Carta Mais Alta" end to end', async ({ browser }) => {
  const ana = await signIn(browser, uniqueName('ana'));
  const rui = await signIn(browser, uniqueName('rui'), { width: 390, height: 844 });

  const code = await createRoom(ana, 'Carta Mais Alta');
  await joinAndReady(rui, code);
  await ana.getByRole('button', { name: 'Começar partida' }).click();

  const hand = '.cr-card-hit';
  for (let round = 0; round < 5; round++) {
    for (const page of [ana, rui]) {
      await expect(page.getByText('Escolhe a tua carta')).toBeVisible();
      const cards = page.locator(hand);
      const before = await cards.count();
      await tap(page, hand);
      // Wait for the server to confirm the move: the hand changes (fewer or no clickable cards).
      await expect(cards).not.toHaveCount(before);
    }
  }
  for (const page of [ana, rui]) {
    await expect(page.getByRole('button', RESULTS)).toBeVisible();
  }
  await ana.getByRole('button', RESULTS).click();
  await expect(ana.getByText('Última partida')).toBeVisible();
});

/** Plays one decision for `page` if it is that player's turn; returns whether it acted. */
async function takeTurn(page: Page): Promise<boolean> {
  const pickUp = page.getByRole('button', { name: 'Apanhar a pilha' });
  if (await pickUp.isEnabled({ timeout: 50 }).catch(() => false)) {
    await pickUp.click();
    return true;
  }
  const status =
    (await page
      .getByRole('status')
      .filter({ hasText: /A tua vez|Vira uma carta|Joga uma carta visível/ })
      .count()) > 0;
  if (!status) return false;

  const playableHand = page.locator('[data-hand-card] [role="button"]:has([data-card-state="playable"])');
  if ((await playableHand.count()) > 0) {
    await playableHand.first().dispatchEvent('click'); // select
    await page.getByRole('button', { name: /^Jogar/ }).click();
    return true;
  }
  for (const layer of ['faceUp', 'faceDown']) {
    const card = page.locator(
      `[data-table-card="${layer}"] [role="button"]:has([data-card-state="playable"])`,
    );
    if ((await card.count()) > 0) {
      await card.first().dispatchEvent('click');
      return true;
    }
  }
  return false;
}

test('two browsers play a complete Mexicana match through the UI', async ({ browser }) => {
  test.setTimeout(420_000);
  const ana = await signIn(browser, uniqueName('ana'));
  const rui = await signIn(browser, uniqueName('rui'), { width: 390, height: 844 });

  const code = await createRoom(ana, 'Mexicana');
  await joinAndReady(rui, code);
  await ana.getByRole('button', { name: 'Começar partida' }).click();

  // Choosing phase: both pick three face-up cards simultaneously.
  for (const page of [ana, rui]) {
    await expect(page.getByRole('button', { name: /Confirmar \(0\/3\)/ })).toBeVisible();
    for (let i = 0; i < 3; i++) await tap(page, '[data-hand-card] [role="button"]', i);
  }
  for (const page of [ana, rui]) {
    await page.getByRole('button', { name: 'Confirmar (3/3)' }).click();
  }

  // Play until the results dialog shows up for both.
  const deadline = Date.now() + 360_000;
  while (!(await ana.getByRole('button', RESULTS).isVisible())) {
    expect(Date.now(), 'match should finish in time').toBeLessThan(deadline);
    const acted = (await takeTurn(ana)) || (await takeTurn(rui));
    await (acted ? ana.waitForTimeout(350) : ana.waitForTimeout(150));
  }
  await expect(rui.getByRole('button', RESULTS)).toBeVisible();
  const title = await ana.getByRole('dialog').getByRole('heading').textContent();
  expect(title).toMatch(/Ganhaste|Ficaste em último|Terminaste/);

  // The finished match shows up in the profile history.
  await ana.getByRole('button', RESULTS).click();
  await ana.goto('/profile');
  await expect(ana.getByText('Mexicana').first()).toBeVisible();
});
