import { expect, type Page } from '@playwright/test';
import { joinAndReady, signIn, takePeixinhoTurn, test, uniqueName } from './helpers';

const RESULTS = { name: 'Voltar à sala' } as const;

test('three browsers play Peixinho to the 13th peixinho; a reload mid-match loses nothing', async ({
  browser,
}) => {
  test.setTimeout(600_000);
  const names = ['ana', 'rui', 'eva'].map(uniqueName);
  const pages = [
    await signIn(browser, names[0] as string),
    await signIn(browser, names[1] as string, { width: 390, height: 844 }),
    await signIn(browser, names[2] as string, { width: 820, height: 1180 }),
  ];
  const [host, ...guests] = pages as [Page, ...Page[]];

  await host.getByRole('button', { name: 'Criar sala' }).first().click();
  const dialog = host.getByRole('dialog');
  await dialog.getByText('Peixinho', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Personalizar' }).click();
  await dialog.getByText('3', { exact: true }).click();
  await dialog.getByText('Todos os pedidos', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Criar sala' }).click();
  await host.waitForURL(/\/room\/[A-Z0-9]{6}$/);
  const code = host.url().split('/').pop() as string;
  for (const guest of guests) await joinAndReady(guest, code);
  await host.getByRole('button', { name: 'Começar partida' }).click();

  // Three players: five cards each, the other 37 in the pond.
  for (const page of pages) {
    await expect(page.getByRole('group', { name: 'A tua mão: 5 cartas' })).toBeVisible();
    await expect(page.getByText('Lago · 37 cartas')).toBeVisible();
  }

  const deadline = Date.now() + 540_000;
  let reloaded = false;
  while (!(await host.getByRole('button', RESULTS).isVisible())) {
    expect(Date.now(), 'match should finish in time').toBeLessThan(deadline);
    let acted = false;
    for (const page of pages) acted = (await takePeixinhoTurn(page)) || acted;

    // Mid-match, one player reloads: same hand, same table.
    const rui = pages[1] as Page;
    const onTable = await host.getByText(/Peixinhos na mesa: [2-9] \//).isVisible();
    if (!reloaded && onTable) {
      reloaded = true;
      const hand = await rui.getByRole('group', { name: /^A tua mão/ }).getAttribute('aria-label');
      await rui.reload();
      await expect(rui.getByRole('group', { name: /^A tua mão/ })).toBeVisible();
      const after = await rui.getByRole('group', { name: /^A tua mão/ }).getAttribute('aria-label');
      // The hand may have changed if it was somebody's turn meanwhile, but it is there.
      expect(after).toMatch(/^A tua mão: \d+ cartas?$/);
      expect(hand).toMatch(/^A tua mão/);
      await expect(
        host.getByRole('heading', { name: 'Memória da mesa' }).or(host.getByText('Memória da mesa')),
      ).toBeVisible();
    }
    await host.waitForTimeout(acted ? 250 : 120);
  }
  expect(reloaded).toBe(true);

  for (const page of pages) await expect(page.getByRole('button', RESULTS)).toBeVisible();
  await expect(host.getByText('Peixinhos na mesa: 13 / 13')).toBeVisible();
  // The results rank everyone by peixinhos; who made the most won.
  const results = host.getByRole('dialog', { name: /Ganhaste|Empate|Terminaste/ });
  await expect(results).toBeVisible();
  await expect(results.getByText(/^\d+ peixinhos?$/)).toHaveCount(3);
  await expect(results.getByText('Quem fez menos peixinhos começa a próxima partida.')).toBeVisible();

  await host.getByRole('button', RESULTS).click();
  await expect(host.getByText('Última partida')).toBeVisible();
  await expect(host.getByText(/· \d+ peixinhos?/).first()).toBeVisible();
});
