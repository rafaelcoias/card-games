import { expect, type Page } from '@playwright/test';
import { joinAndReady, signIn, test, uniqueName } from './helpers';

const RESULTS = { name: 'Voltar à sala' } as const;

/** "Setes" in the status line → "Sete", how a card of that rank is named ("Sete de copas"). */
const SINGULAR: Record<string, string> = {
  Ases: 'Ás',
  Doises: 'Dois',
  Treses: 'Três',
  Quatros: 'Quatro',
  Cincos: 'Cinco',
  Seises: 'Seis',
  Setes: 'Sete',
  Oitos: 'Oito',
  Noves: 'Nove',
  Dezes: 'Dez',
  Valetes: 'Valete',
  Damas: 'Dama',
  Reis: 'Rei',
};

/**
 * Plays this player's move, if it is theirs: the truth when the hand allows it
 * (one time in ten, a random card instead), or a doubt — readily once the pile
 * claims more of a rank than there can be. Clicks are dispatched to the
 * element (like a tap): fanned cards cover each other.
 */
async function takeTurn(page: Page): Promise<boolean> {
  const doubt = page.getByRole('button', { name: 'Desconfia!' }).first();
  // More than 6 cards claimed as one rank (4 + 2 jokers) cannot all be true: then doubt readily.
  const pile =
    (await page
      .getByRole('status', { name: /^Pilha: \d+/ })
      .getAttribute('aria-label', { timeout: 100 })
      .catch(() => null)) ?? '';
  const suspicious = Number(/\d+/.exec(pile)?.[0] ?? 0) > 6;
  if (Math.random() < (suspicious ? 0.5 : 0.03) && (await doubt.isVisible().catch(() => false))) {
    await doubt.dispatchEvent('click');
    return true;
  }
  const ready = page.getByRole('button', { name: /^Jogar \d+ como / });
  const choose = page.getByRole('button', { name: /^Escolhe (as cartas|o valor)$/ });
  if (
    !(await ready
      .or(choose)
      .first()
      .isVisible()
      .catch(() => false))
  )
    return false;

  const cards = page.locator('[data-hand-card] [role="button"]');
  const selected = page.locator('[data-hand-card] [role="button"][aria-pressed="true"]');
  if ((await selected.count()) === 0) {
    const status =
      (await page
        .getByRole('status')
        .filter({ hasText: /A tua vez/ })
        .first()
        .textContent()) ?? '';
    const claimed = /anunciar (\w+)/.exec(status)?.[1];
    const labels = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
    const lie = Math.random() < 0.1;
    // On a new pile, the rank held most (the claim then defaults to it, the truth).
    const ranks = labels.filter((l) => l !== 'Joker').map((l) => l.split(' de ')[0] as string);
    const most = ranks.sort(
      (a, b) => ranks.filter((r) => r === b).length - ranks.filter((r) => r === a).length,
    )[0];
    const rank = claimed ? SINGULAR[claimed] : most;
    let picks = labels.flatMap((label, i) =>
      label.startsWith(`${rank} de`) || label === 'Joker' ? [i] : [],
    );
    if (lie || picks.length === 0) picks = [Math.floor(Math.random() * labels.length)];
    for (const i of picks) await cards.nth(i).dispatchEvent('click');
  }
  const radios = page.getByRole('radio');
  if ((await radios.count()) > 0 && (await page.getByRole('radio', { checked: true }).count()) === 0) {
    await radios.nth(Math.floor(Math.random() * 13)).dispatchEvent('click');
  }
  if (!(await ready.isEnabled().catch(() => false))) return false;
  await ready.dispatchEvent('click');
  return true;
}

test('four browsers play Desconfia to the end; a reload while a play is open to doubts loses nothing', async ({
  browser,
}) => {
  test.setTimeout(900_000);
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
  await dialog.getByText('Desconfia', { exact: true }).click();
  await dialog.getByText('4', { exact: true }).first().click();
  await dialog.getByText('1s', { exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  await expect(host.getByText('Tempo para desconfiar: 1s')).toBeVisible();
  const code = host.url().split('/').pop() as string;
  for (const guest of guests) await joinAndReady(guest, code);
  await host.getByRole('button', { name: 'Começar partida' }).click();

  // All 54 cards dealt: 14 + 14 + 13 + 13, minus any peixinho dealt straight away.
  for (const page of pages)
    await expect(page.getByRole('group', { name: /^A tua mão: \d+ cartas/ })).toBeVisible();
  await expect(host.getByText('Pilha nova · valor livre')).toBeVisible();

  const deadline = Date.now() + 840_000;
  let reloaded = false;
  while (!(await host.getByRole('button', RESULTS).isVisible())) {
    expect(Date.now(), 'match should finish in time').toBeLessThan(deadline);
    let acted = false;
    for (const page of pages) acted = (await takeTurn(page)) || acted;

    // Mid-match, a player who may doubt the open play reloads: the table comes back as it was.
    const rui = pages[1] as Page;
    if (
      !reloaded &&
      (await rui
        .getByRole('button', { name: 'Desconfia!' })
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      reloaded = true;
      await rui.reload();
      await expect(rui.getByRole('group', { name: /^A tua mão: \d+ cartas?/ })).toBeVisible();
      await expect(rui.getByText(/^A pilha está em|^Pilha nova|^Valor livre/)).toBeVisible();
    }
    await host.waitForTimeout(acted ? 200 : 120);
  }
  expect(reloaded).toBe(true);

  for (const page of pages) await expect(page.getByRole('button', RESULTS)).toBeVisible();
  // The first out of cards wins; the others are ranked by the cards they still hold.
  const results = host.getByRole('dialog', { name: /Ganhaste|Terminaste|Empate/ });
  await expect(results).toBeVisible();
  await expect(results.getByText(/^\d+ cartas?$/)).toHaveCount(4);
  await expect(results.getByText('0 cartas')).toBeVisible();
  await expect(results.getByText('Começa a próxima partida quem receber o 3 de paus.')).toBeVisible();

  await host.getByRole('button', RESULTS).click();
  await expect(host.getByText('Última partida')).toBeVisible();
});
